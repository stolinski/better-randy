/**
 * Emits bounded @swamp/software-factory terminal flow measurements to Sentry
 * Application Metrics and records a versioned local receipt.
 *
 * The caller supplies values already derived by a Factory flow report. This
 * model does not read Factory lifecycle data, infer missing measurements, or
 * make Sentry part of Factory completion. The DSN is an optional sensitive
 * global argument so definitions can resolve it from a Swamp vault.
 *
 * @module
 */
import * as Sentry from "npm:@sentry/node@10.67.0";
import { z } from "npm:zod@4";

export const FACTORY_METRIC_MODEL_VERSION = "2026.08.05.1";
const SENTRY_SDK_VERSION = "10.67.0";
const MAX_DURATION_MS = 315_576_000_000;
const MAX_COUNT = 1_000_000;

const BoundedNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export const FactoryMetricGlobalArgsSchema = z.strictObject({
  dsn: z.string().url().max(2_048).optional().meta({ sensitive: true }),
  flushTimeoutMs: z.number().int().min(100).max(30_000).optional(),
});

export type FactoryMetricGlobalArgs = z.infer<
  typeof FactoryMetricGlobalArgsSchema
>;

const AvailableDurationSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    value: z.number().finite().nonnegative().max(MAX_DURATION_MS),
  }),
  z.strictObject({ availability: z.literal("unavailable") }),
]);

const AvailableCountSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    value: z.number().int().nonnegative().max(MAX_COUNT),
  }),
  z.strictObject({ availability: z.literal("unavailable") }),
]);

const AvailableBooleanSchema = z.discriminatedUnion("availability", [
  z.strictObject({ availability: z.literal("available"), value: z.boolean() }),
  z.strictObject({ availability: z.literal("unavailable") }),
]);

const StageDurationSchema = z.strictObject({
  stage: BoundedNameSchema,
  durationMs: z.number().finite().nonnegative().max(MAX_DURATION_MS),
});

const AvailableStageDurationsSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    value: z
      .array(StageDurationSchema)
      .max(128)
      .refine(
        (stages) =>
          new Set(stages.map((stage) => stage.stage)).size === stages.length,
        "stage ids must be unique",
      ),
  }),
  z.strictObject({ availability: z.literal("unavailable") }),
]);

/** Strict input contract for one terminal Factory run. */
export const FactoryMetricEmissionArgsSchema = z.strictObject({
  idempotencyKey: z.string().min(1).max(256).meta({ sensitive: true }),
  factory: z.strictObject({
    project: BoundedNameSchema,
    name: BoundedNameSchema,
    profile: BoundedNameSchema,
    definition_version: z.number().int().nonnegative().max(
      Number.MAX_SAFE_INTEGER,
    ),
  }),
  terminal: z.strictObject({
    outcome: z.enum(["done", "cleanup-required", "parked", "aborted"]),
    duration: AvailableDurationSchema,
    stageDurations: AvailableStageDurationsSchema,
    dispatchAttempts: AvailableCountSchema,
    humanDecisions: AvailableCountSchema,
    patchCycles: AvailableCountSchema,
    acceptedFirstPass: AvailableBooleanSchema,
    visualReviewUsed: AvailableBooleanSchema,
  }),
});

export type FactoryMetricEmissionArgs = z.infer<
  typeof FactoryMetricEmissionArgsSchema
>;

/** Typed, secret-free record of an emission attempt. */
export const FactoryMetricEmissionReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  emitterVersion: z.literal(FACTORY_METRIC_MODEL_VERSION),
  sentrySdkVersion: z.literal(SENTRY_SDK_VERSION),
  emissionKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
  recordedAt: z.string().datetime(),
  status: z.enum(["emitted", "duplicate", "unavailable", "failed"]),
  reason: z.enum([
    "none",
    "duplicate",
    "missing-dsn",
    "sdk-error",
    "flush-failed",
  ]),
  flush: z.enum(["succeeded", "failed", "not-attempted"]),
  metricPoints: z.number().int().nonnegative(),
  factory: z.strictObject({
    project: BoundedNameSchema,
    name: BoundedNameSchema,
    profile: BoundedNameSchema,
    definition_version: z.number().int().nonnegative().max(
      Number.MAX_SAFE_INTEGER,
    ),
  }),
  outcome: z.enum(["done", "cleanup-required", "parked", "aborted"]),
});

type FactoryMetricEmissionReceipt = z.infer<
  typeof FactoryMetricEmissionReceiptSchema
>;

type MetricAttributeValue = string | number | boolean;
type MetricOptions = {
  unit?: string;
  attributes: Record<string, MetricAttributeValue>;
};

/** Minimal Sentry metrics surface, injectable so fixture tests never use a network transport. */
export interface FactoryMetricSink {
  count(name: string, value: number, options: MetricOptions): void;
  distribution(name: string, value: number, options: MetricOptions): void;
  gauge(name: string, value: number, options: MetricOptions): void;
  flush(timeoutMs: number): Promise<boolean>;
}

export type FactoryMetricMethodContext = {
  globalArgs: FactoryMetricGlobalArgs;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

export type FactoryMetricEmissionDependencies = {
  createSink: (dsn: string) => FactoryMetricSink;
  now: () => string;
};

type MetricOperation =
  | { kind: "count"; name: string; value: number; options: MetricOptions }
  | {
    kind: "distribution";
    name: string;
    value: number;
    options: MetricOptions;
  }
  | { kind: "gauge"; name: string; value: number; options: MetricOptions };

type EmissionResult = Pick<
  FactoryMetricEmissionReceipt,
  "status" | "reason" | "flush" | "metricPoints"
>;

const COVERAGE_FACTS = [
  "factory.run.duration",
  "factory.stage.duration",
  "factory.run.dispatch_attempts",
  "factory.run.human_decisions",
  "factory.run.patch_cycles",
  "factory.run.accepted_first_pass",
  "factory.run.visual_review_used",
] as const;

function createSentryFactoryMetricSink(dsn: string): FactoryMetricSink {
  Sentry.init({ dsn, defaultIntegrations: false });
  return {
    count: (name, value, options) => Sentry.metrics.count(name, value, options),
    distribution: (name, value, options) =>
      Sentry.metrics.distribution(name, value, options),
    gauge: (name, value, options) => Sentry.metrics.gauge(name, value, options),
    flush: (timeoutMs) => Sentry.flush(timeoutMs),
  };
}

const DEFAULT_DEPENDENCIES: FactoryMetricEmissionDependencies = {
  createSink: createSentryFactoryMetricSink,
  now: () => new Date().toISOString(),
};

function availabilityValue(
  fact: { availability: "available" | "unavailable" },
): 0 | 1 {
  return fact.availability === "available" ? 1 : 0;
}

function booleanAttribute(
  fact:
    | { availability: "available"; value: boolean }
    | { availability: "unavailable" },
): boolean | "unavailable" {
  return fact.availability === "available" ? fact.value : "unavailable";
}

function buildDurationMetricOperations(
  args: FactoryMetricEmissionArgs,
  sharedAttributes: Record<string, MetricAttributeValue>,
  outcomeAttributes: Record<string, MetricAttributeValue>,
): MetricOperation[] {
  const operations: MetricOperation[] = [];
  if (args.terminal.duration.availability === "available") {
    operations.push({
      kind: "distribution",
      name: "factory.run.duration",
      value: args.terminal.duration.value,
      options: { unit: "millisecond", attributes: outcomeAttributes },
    });
  }
  if (args.terminal.stageDurations.availability === "available") {
    for (const stage of args.terminal.stageDurations.value) {
      operations.push({
        kind: "distribution",
        name: "factory.stage.duration",
        value: stage.durationMs,
        options: {
          unit: "millisecond",
          attributes: { ...sharedAttributes, stage: stage.stage },
        },
      });
    }
  }
  return operations;
}

function buildCountMetricOperations(
  args: FactoryMetricEmissionArgs,
  sharedAttributes: Record<string, MetricAttributeValue>,
  outcomeAttributes: Record<string, MetricAttributeValue>,
): MetricOperation[] {
  const distributionFacts = [
    ["factory.run.dispatch_attempts", args.terminal.dispatchAttempts],
    ["factory.run.human_decisions", args.terminal.humanDecisions],
    ["factory.run.patch_cycles", args.terminal.patchCycles],
  ] as const;
  const operations: MetricOperation[] = [];
  for (const [name, fact] of distributionFacts) {
    if (fact.availability === "available") {
      operations.push({
        kind: "distribution",
        name,
        value: fact.value,
        options: { attributes: outcomeAttributes },
      });
    }
  }
  if (args.terminal.outcome === "cleanup-required") {
    operations.push({
      kind: "count",
      name: "factory.run.cleanup_failure",
      value: 1,
      options: { attributes: sharedAttributes },
    });
  }
  return operations;
}

function buildCoverageMetricOperations(
  args: FactoryMetricEmissionArgs,
  sharedAttributes: Record<string, MetricAttributeValue>,
): MetricOperation[] {
  const coverageValues: Record<(typeof COVERAGE_FACTS)[number], 0 | 1> = {
    "factory.run.duration": availabilityValue(args.terminal.duration),
    "factory.stage.duration": availabilityValue(args.terminal.stageDurations),
    "factory.run.dispatch_attempts": availabilityValue(
      args.terminal.dispatchAttempts,
    ),
    "factory.run.human_decisions": availabilityValue(
      args.terminal.humanDecisions,
    ),
    "factory.run.patch_cycles": availabilityValue(args.terminal.patchCycles),
    "factory.run.accepted_first_pass": availabilityValue(
      args.terminal.acceptedFirstPass,
    ),
    "factory.run.visual_review_used": availabilityValue(
      args.terminal.visualReviewUsed,
    ),
  };
  return COVERAGE_FACTS.map((metric) => ({
    kind: "gauge",
    name: "factory.metric.coverage",
    value: coverageValues[metric],
    options: { attributes: { ...sharedAttributes, metric } },
  }));
}

/** Build the exact bounded Sentry operations for a validated terminal payload. */
export function buildFactoryMetricOperations(
  args: FactoryMetricEmissionArgs,
): MetricOperation[] {
  const sharedAttributes: Record<string, MetricAttributeValue> = {
    "factory.project": args.factory.project,
    "factory.name": args.factory.name,
    "factory.profile": args.factory.profile,
    "factory.definition_version": args.factory.definition_version,
  };
  const outcomeAttributes = {
    ...sharedAttributes,
    outcome: args.terminal.outcome,
  };
  return [
    {
      kind: "count",
      name: "factory.run.completed",
      value: 1,
      options: {
        attributes: {
          ...outcomeAttributes,
          "accepted-first-pass": booleanAttribute(
            args.terminal.acceptedFirstPass,
          ),
          "visual-review-used": booleanAttribute(
            args.terminal.visualReviewUsed,
          ),
        },
      },
    },
    ...buildDurationMetricOperations(
      args,
      sharedAttributes,
      outcomeAttributes,
    ),
    ...buildCountMetricOperations(args, sharedAttributes, outcomeAttributes),
    ...buildCoverageMetricOperations(args, sharedAttributes),
  ];
}

async function emissionKeyHash(
  args: FactoryMetricEmissionArgs,
): Promise<string> {
  const internalKey = [
    args.factory.project,
    args.factory.name,
    args.factory.profile,
    String(args.factory.definition_version),
    args.idempotencyKey,
  ].join("\0");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(internalKey),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join(
    "",
  );
}

function isFinalReceipt(value: Record<string, unknown> | null): boolean {
  const parsed = FactoryMetricEmissionReceiptSchema.safeParse(value);
  return (
    parsed.success &&
    (parsed.data.status === "emitted" ||
      parsed.data.status === "failed" ||
      parsed.data.status === "duplicate")
  );
}

function receiptData(
  args: FactoryMetricEmissionArgs,
  emissionKeyHashValue: string,
  recordedAt: string,
  result: EmissionResult,
): FactoryMetricEmissionReceipt {
  return {
    schemaVersion: 1,
    emitterVersion: FACTORY_METRIC_MODEL_VERSION,
    sentrySdkVersion: SENTRY_SDK_VERSION,
    emissionKeyHash: emissionKeyHashValue,
    recordedAt,
    ...result,
    factory: args.factory,
    outcome: args.terminal.outcome,
  };
}

async function writeEmissionReceipt(
  args: FactoryMetricEmissionArgs,
  context: FactoryMetricMethodContext,
  keyHash: string,
  recordedAt: string,
  result: EmissionResult,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const receiptName = `receipt-${keyHash}`;
  const receipt = receiptData(args, keyHash, recordedAt, result);
  const handle = await context.writeResource("receipt", receiptName, receipt);
  return { dataHandles: [handle] };
}

function emitMetricOperations(
  sink: FactoryMetricSink,
  operations: MetricOperation[],
): { failed: boolean; metricPoints: number } {
  let metricPoints = 0;
  try {
    for (const operation of operations) {
      sink[operation.kind](operation.name, operation.value, operation.options);
      metricPoints += 1;
    }
    return { failed: false, metricPoints };
  } catch {
    return { failed: true, metricPoints };
  }
}

async function flushMetricSink(
  sink: FactoryMetricSink,
  timeoutMs: number,
): Promise<boolean> {
  try {
    return await sink.flush(timeoutMs);
  } catch {
    return false;
  }
}

function classifyEmissionResult(
  emissionFailed: boolean,
  flushSucceeded: boolean,
  metricPoints: number,
): EmissionResult {
  if (emissionFailed) {
    return {
      status: "failed",
      reason: "sdk-error",
      flush: flushSucceeded ? "succeeded" : "failed",
      metricPoints,
    };
  }
  if (!flushSucceeded) {
    return {
      status: "failed",
      reason: "flush-failed",
      flush: "failed",
      metricPoints,
    };
  }
  return {
    status: "emitted",
    reason: "none",
    flush: "succeeded",
    metricPoints,
  };
}

function logEmissionResult(
  context: FactoryMetricMethodContext,
  args: FactoryMetricEmissionArgs,
  result: EmissionResult,
): void {
  const properties = {
    metricPoints: result.metricPoints,
    project: args.factory.project,
    factory: args.factory.name,
  };
  if (result.status === "emitted") {
    context.logger.info(
      "Emitted {metricPoints} Factory metric points for {project}/{factory}",
      properties,
    );
    return;
  }
  context.logger.warning(
    "Factory metric emission failed for {project}/{factory}",
    properties,
  );
}

type MetricSinkPreflight =
  | { status: "ready"; sink: FactoryMetricSink }
  | { status: "stop"; result: EmissionResult };

async function prepareMetricSink(
  args: FactoryMetricEmissionArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies,
  receiptName: string,
): Promise<MetricSinkPreflight> {
  if (isFinalReceipt(await context.readResource(receiptName))) {
    context.logger.info(
      "Skipped duplicate Factory metric emission for {project}/{factory}",
      { project: args.factory.project, factory: args.factory.name },
    );
    return {
      status: "stop",
      result: {
        status: "duplicate",
        reason: "duplicate",
        flush: "not-attempted",
        metricPoints: 0,
      },
    };
  }
  if (context.globalArgs.dsn === undefined) {
    context.logger.warning(
      "Factory metric emission is unavailable because no Sentry DSN is configured",
    );
    return {
      status: "stop",
      result: {
        status: "unavailable",
        reason: "missing-dsn",
        flush: "not-attempted",
        metricPoints: 0,
      },
    };
  }
  try {
    return {
      status: "ready",
      sink: dependencies.createSink(context.globalArgs.dsn),
    };
  } catch {
    context.logger.warning(
      "Factory metric SDK initialization failed for {project}/{factory}",
      { project: args.factory.project, factory: args.factory.name },
    );
    return {
      status: "stop",
      result: {
        status: "failed",
        reason: "sdk-error",
        flush: "not-attempted",
        metricPoints: 0,
      },
    };
  }
}

/** Execute one best-effort, idempotent metric emission and persist its receipt. */
export async function executeFactoryMetricEmission(
  args: FactoryMetricEmissionArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const keyHash = await emissionKeyHash(args);
  const receiptName = `receipt-${keyHash}`;
  context.logger.info(
    "Emitting terminal Factory metrics for {project}/{factory}",
    {
      project: args.factory.project,
      factory: args.factory.name,
    },
  );
  const preflight = await prepareMetricSink(
    args,
    context,
    dependencies,
    receiptName,
  );
  if (preflight.status === "stop") {
    return writeEmissionReceipt(
      args,
      context,
      keyHash,
      dependencies.now(),
      preflight.result,
    );
  }

  const operations = buildFactoryMetricOperations(args);
  const emission = emitMetricOperations(preflight.sink, operations);
  const flushSucceeded = await flushMetricSink(
    preflight.sink,
    context.globalArgs.flushTimeoutMs ?? 5_000,
  );
  const result = classifyEmissionResult(
    emission.failed,
    flushSucceeded,
    emission.metricPoints,
  );
  logEmissionResult(context, args, result);
  return writeEmissionReceipt(
    args,
    context,
    keyHash,
    dependencies.now(),
    result,
  );
}
