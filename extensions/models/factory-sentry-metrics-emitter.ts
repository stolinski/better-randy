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
import { z } from "npm:zod@4.4.3";

import {
  buildFlowMetricsReport,
  loadMetricsData,
  workItemSlug,
} from "../../.swamp/pulled-extensions/@mgreten/software-factory-flow-metrics/reports/flow_metrics_report.ts";
import type { RunDataReader } from "../../.swamp/pulled-extensions/@mgreten/software-factory-flow-metrics/reports/flow_metrics_report.ts";

export const FACTORY_METRIC_MODEL_VERSION = "2026.08.16.5";
const SENTRY_SDK_VERSION = "10.67.0";
const MAX_DURATION_MS = 315_576_000_000;
const MAX_COUNT = 1_000_000;

const BoundedNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const FactoryMetricSeriesIdentitySchema = z.strictObject({
  project: BoundedNameSchema,
  name: BoundedNameSchema,
  profile: BoundedNameSchema,
});

const FactoryMetricIdentitySchema = FactoryMetricSeriesIdentitySchema.extend({
  definition_version: z.number().int().nonnegative().max(
    Number.MAX_SAFE_INTEGER,
  ),
});

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

const StageProfileSchema = z.strictObject({
  stage: BoundedNameSchema,
  entries: z.number().int().nonnegative().max(MAX_COUNT),
  firstEnteredMs: z.number().finite().nonnegative().max(MAX_DURATION_MS)
    .nullable(),
  dispatchAttempts: z.number().int().nonnegative().max(MAX_COUNT),
});

const AvailableStageProfilesSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    value: z.array(StageProfileSchema).max(128),
  }),
  z.strictObject({ availability: z.literal("unavailable") }),
]);

const AvailableFailedStageSchema = z.discriminatedUnion("availability", [
  z.strictObject({
    availability: z.literal("available"),
    value: BoundedNameSchema.nullable(),
  }),
  z.strictObject({ availability: z.literal("unavailable") }),
]);

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

/**
 * Strict serialized contract for one terminal Factory run.
 *
 * Swamp merges resolved global arguments into the runtime validation envelope;
 * `z.object` strips that known envelope before execution while the generated
 * method JSON Schema and every nested payload remain closed to caller extras.
 */
export const FactoryMetricEmissionArgsSchema = z.object({
  idempotencyKey: z.string().min(1).max(256).meta({ sensitive: true }),
  projectedSummaryDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  factory: FactoryMetricIdentitySchema,
  terminal: z.strictObject({
    outcome: z.enum(["done", "cleanup-required", "parked", "aborted"]),
    duration: AvailableDurationSchema,
    stageDurations: AvailableStageDurationsSchema,
    dispatchAttempts: AvailableCountSchema,
    humanDecisions: AvailableCountSchema,
    patchCycles: AvailableCountSchema,
    acceptedFirstPass: AvailableBooleanSchema,
    visualReviewUsed: AvailableBooleanSchema,
    stageProfiles: AvailableStageProfilesSchema.default({
      availability: "unavailable",
    }),
    failedStage: AvailableFailedStageSchema.default({
      availability: "unavailable",
    }),
    humanTouches: AvailableCountSchema.default({ availability: "unavailable" }),
    approvals: AvailableCountSchema.default({ availability: "unavailable" }),
    rejections: AvailableCountSchema.default({ availability: "unavailable" }),
    cycleOverrides: AvailableCountSchema.default({
      availability: "unavailable",
    }),
  }),
});

export type FactoryMetricEmissionArgs = z.infer<
  typeof FactoryMetricEmissionArgsSchema
>;

const MetricSourceSchema = z.object({
  kind: z.enum(["state", "journal", "artifact", "evidence", "approval"]),
  name: z.string().min(1),
  version: z.number().int().positive().optional(),
});

const TracedNumberSchema = z.object({
  value: z.number().finite().nonnegative().nullable(),
  sources: z.array(MetricSourceSchema),
});

const TrustedCountSchema = z.object({
  value: z.number().int().nonnegative().nullable(),
  availability: z.enum(["available", "partial", "unavailable"]),
});

const FlowStageSchema = z.object({
  stageId: BoundedNameSchema,
  entries: z.number().int().nonnegative().max(MAX_COUNT),
  totalMs: z.number().finite().nonnegative().nullable(),
  durationAvailability: z.enum(["available", "partial", "unavailable"]),
  firstEnteredMs: z.number().finite().nonnegative().nullable(),
  dispatchAttempts: z.number().int().nonnegative().max(MAX_COUNT),
  terminal: z.boolean(),
});

/** Canonical flow-report fields consumed by the Sentry projection. */
const FactoryFlowMetricReportSchema = z.object({
  workItem: z.string().min(1),
  metrics: z.object({
    workItem: z.string().min(1),
    runStatus: z.enum(["active", "terminal", "unknown"]),
    timeToTerminalMs: TracedNumberSchema,
    stages: z.array(FlowStageSchema).max(128),
    dispatchAttempts: TracedNumberSchema,
    failedStage: z.object({
      value: BoundedNameSchema.nullable(),
      sources: z.array(MetricSourceSchema),
    }),
    humanTouches: TracedNumberSchema,
    approvals: z.number().int().nonnegative().max(MAX_COUNT),
    rejections: z.number().int().nonnegative().max(MAX_COUNT),
    cycleOverrides: z.object({
      count: z.number().int().nonnegative().max(MAX_COUNT),
    }),
    patchCycles: TracedNumberSchema,
    outcome: z.object({
      value: z.enum([
        "done",
        "cleanup-required",
        "parked",
        "aborted",
        "active",
        "unknown",
      ]),
      sources: z.array(MetricSourceSchema),
    }),
    acceptedFirstPass: z.boolean(),
    journalTruncated: z.boolean(),
    ceremony: z.object({
      distinctDecisionCount: TrustedCountSchema,
    }),
  }),
});

export const FactoryFlowMetricEmissionArgsSchema = z.strictObject({
  factory: FactoryMetricIdentitySchema,
  visualReviewStages: z.array(BoundedNameSchema).max(16),
  report: FactoryFlowMetricReportSchema,
});

export type FactoryFlowMetricEmissionArgs = z.infer<
  typeof FactoryFlowMetricEmissionArgsSchema
>;

// See FactoryMetricEmissionArgsSchema: strip Swamp's merged global envelope.
const ProjectedTerminalSchema = z.strictObject({
  preterminalStage: z.enum([
    "done-observability",
    "aborted-observability",
    "escalated-observability",
  ]),
  targetStage: z.enum(["done", "aborted", "operational-escalation"]),
  outcome: z.enum(["done", "aborted", "parked"]),
});

export const FactoryFlowMetricSourceArgsSchema = z.object({
  workItem: z.string().min(1).max(256),
  sourceFactory: z.strictObject({
    id: z.string().uuid(),
    name: BoundedNameSchema,
  }),
  factory: FactoryMetricSeriesIdentitySchema,
  visualReviewStages: z.array(BoundedNameSchema).max(16),
  projectedTerminal: ProjectedTerminalSchema.optional(),
});

export type FactoryFlowMetricSourceArgs = z.infer<
  typeof FactoryFlowMetricSourceArgsSchema
>;

export const FactoryProjectedTerminalSummaryArgsSchema =
  FactoryFlowMetricSourceArgsSchema.required({ projectedTerminal: true });
export type FactoryProjectedTerminalSummaryArgs = z.infer<
  typeof FactoryProjectedTerminalSummaryArgsSchema
>;

export const FactoryProjectedTerminalAttemptIdentitySchema = z.strictObject({
  preterminalStageCycle: z.number().int().positive(),
  sourceRevision: z.strictObject({
    kind: z.literal("journal"),
    name: z.string().min(1).max(320),
    version: z.number().int().positive(),
  }),
  reportDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const FactoryProjectedTerminalSummarySchema = z.strictObject({
  schemaVersion: z.literal(2),
  summaryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  persistedAt: z.string().datetime(),
  workItem: z.string().min(1).max(256),
  sourceFactory: z.strictObject({
    id: z.string().uuid(),
    name: BoundedNameSchema,
  }),
  projectedTerminal: ProjectedTerminalSchema,
  attemptIdentity: FactoryProjectedTerminalAttemptIdentitySchema,
  report: FactoryFlowMetricReportSchema,
});

/** Typed, secret-free record of an emission attempt. */
export const FactoryMetricEmissionReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  emitterVersion: z.enum([
    "2026.08.06.1",
    "2026.08.07.1",
    "2026.08.09.1",
    "2026.08.16.2",
    "2026.08.16.3",
    "2026.08.16.4",
    FACTORY_METRIC_MODEL_VERSION,
  ]),
  sentrySdkVersion: z.literal(SENTRY_SDK_VERSION),
  emissionKeyHash: z.string().regex(/^[a-f0-9]{64}$/),
  projectedSummaryDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable()
    .optional(),
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
  factory: FactoryMetricIdentitySchema,
  outcome: z.enum(["done", "cleanup-required", "parked", "aborted"]),
});

type FactoryMetricEmissionReceipt = z.infer<
  typeof FactoryMetricEmissionReceiptSchema
>;

/** Local control-plane result proving whether one terminal run has a receipt. */
export const FactoryMetricCoverageSchema = z.strictObject({
  schemaVersion: z.literal(1),
  checkedAt: z.string().datetime(),
  status: z.enum(["observed", "degraded", "missing"]),
  expectedReceipt: z.string().regex(/^receipt-[a-f0-9]{64}$/),
  projectedSummaryDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  receiptStatus: FactoryMetricEmissionReceiptSchema.shape.status.nullable(),
  factory: FactoryMetricIdentitySchema,
  outcome: z.enum(["done", "cleanup-required", "parked", "aborted"]),
});

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
  trace?(args: FactoryMetricEmissionArgs): void;
  flush(timeoutMs: number): Promise<boolean>;
}

export type FactoryMetricMethodContext = {
  globalArgs: FactoryMetricGlobalArgs;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
    listVersions?: (
      type: unknown,
      modelId: string,
      dataName: string,
    ) => Promise<number[]>;
  };
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

type AvailableMetric<T> = { availability: "available"; value: T } | {
  availability: "unavailable";
};

const COVERAGE_FACTS = [
  "factory.run.duration",
  "factory.stage.duration",
  "factory.run.dispatch_attempts",
  "factory.run.human_decisions",
  "factory.run.patch_cycles",
  "factory.run.accepted_first_pass",
  "factory.run.visual_review_used",
  "factory.stage.profile",
  "factory.run.failed_stage",
  "factory.run.human_touches",
  "factory.run.approvals",
  "factory.run.rejections",
  "factory.run.cycle_overrides",
] as const;

const TERMINAL_OUTCOMES: ReadonlySet<string> = new Set(
  [
    "done",
    "cleanup-required",
    "parked",
    "aborted",
  ] as const,
);

function availableNumber(
  value: number | null,
  isComplete = true,
): AvailableMetric<number> {
  return value !== null && isComplete
    ? { availability: "available", value }
    : { availability: "unavailable" };
}

function availableBoolean(
  value: boolean,
  isComplete: boolean,
): AvailableMetric<boolean> {
  return isComplete
    ? { availability: "available", value }
    : { availability: "unavailable" };
}

function terminalEmissionKey(
  report: FactoryFlowMetricEmissionArgs["report"],
): string {
  const terminalJournalSource = report.metrics.outcome.sources.find(
    (source) => source.kind === "journal" && source.version !== undefined,
  );
  if (terminalJournalSource?.version === undefined) {
    throw new TypeError(
      "terminal flow report outcome must reference a versioned journal record",
    );
  }
  return `${terminalJournalSource.name}:${terminalJournalSource.version}`;
}

function availableStageDurations(
  stages: FactoryFlowMetricEmissionArgs["report"]["metrics"]["stages"],
): FactoryMetricEmissionArgs["terminal"]["stageDurations"] {
  const completedStages = stages.filter((stage) => !stage.terminal);
  if (
    completedStages.length === 0 ||
    completedStages.some(
      (stage) =>
        stage.durationAvailability !== "available" || stage.totalMs === null,
    )
  ) {
    return { availability: "unavailable" };
  }
  return {
    availability: "available",
    value: completedStages.map((stage) => ({
      stage: stage.stageId,
      durationMs: stage.totalMs as number,
    })),
  };
}

function availableStageProfiles(
  stages: FactoryFlowMetricEmissionArgs["report"]["metrics"]["stages"],
  isComplete: boolean,
): FactoryMetricEmissionArgs["terminal"]["stageProfiles"] {
  if (!isComplete) return { availability: "unavailable" };
  return {
    availability: "available",
    value: stages.map((stage) => ({
      stage: stage.stageId,
      entries: stage.entries,
      firstEnteredMs: stage.firstEnteredMs,
      dispatchAttempts: stage.dispatchAttempts,
    })),
  };
}

function assertTerminalFlowReport(
  report: FactoryFlowMetricEmissionArgs["report"],
): void {
  if (report.metrics.workItem !== report.workItem) {
    throw new TypeError(
      "flow report work item does not match its metrics payload",
    );
  }
  if (report.metrics.runStatus !== "terminal") {
    throw new TypeError(
      "Factory metrics can only be emitted for terminal flow reports",
    );
  }
  if (!TERMINAL_OUTCOMES.has(report.metrics.outcome.value)) {
    throw new TypeError(
      "Factory metrics can only be emitted for terminal flow reports",
    );
  }
}

/** Project one canonical terminal flow report into the strict emitter payload. */
export function factoryMetricEmissionFromFlowReport(
  args: FactoryFlowMetricEmissionArgs,
): FactoryMetricEmissionArgs {
  const { report } = args;
  assertTerminalFlowReport(report);
  const { metrics } = report;

  const hasCompleteJournal = !metrics.journalTruncated;
  const humanDecisions = metrics.ceremony.distinctDecisionCount;
  const visualReviewUsed = availableBoolean(
    metrics.stages.some((stage) =>
      args.visualReviewStages.includes(stage.stageId)
    ),
    hasCompleteJournal,
  );

  return FactoryMetricEmissionArgsSchema.parse({
    idempotencyKey: terminalEmissionKey(report),
    factory: args.factory,
    terminal: {
      outcome: metrics.outcome.value,
      duration: availableNumber(metrics.timeToTerminalMs.value),
      stageDurations: availableStageDurations(metrics.stages),
      dispatchAttempts: availableNumber(
        metrics.dispatchAttempts.value,
        hasCompleteJournal,
      ),
      humanDecisions: availableNumber(
        humanDecisions.value,
        humanDecisions.availability === "available",
      ),
      patchCycles: availableNumber(
        metrics.patchCycles.value,
        hasCompleteJournal,
      ),
      acceptedFirstPass: availableBoolean(
        metrics.acceptedFirstPass,
        hasCompleteJournal,
      ),
      visualReviewUsed,
      stageProfiles: availableStageProfiles(metrics.stages, hasCompleteJournal),
      failedStage: hasCompleteJournal
        ? { availability: "available", value: metrics.failedStage.value }
        : { availability: "unavailable" },
      humanTouches: availableNumber(
        metrics.humanTouches.value,
        hasCompleteJournal,
      ),
      approvals: availableNumber(metrics.approvals, hasCompleteJournal),
      rejections: availableNumber(metrics.rejections, hasCompleteJournal),
      cycleOverrides: availableNumber(
        metrics.cycleOverrides.count,
        hasCompleteJournal,
      ),
    },
  });
}

function recordFactoryRunTrace(args: FactoryMetricEmissionArgs): void {
  const durationMs = args.terminal.duration.availability === "available"
    ? args.terminal.duration.value
    : 0;
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - durationMs);
  const sharedAttributes: Record<string, MetricAttributeValue> = {
    "factory.project": args.factory.project,
    "factory.name": args.factory.name,
    "factory.profile": args.factory.profile,
    "factory.definition_version": String(args.factory.definition_version),
    outcome: args.terminal.outcome,
    "factory.telemetry_source": "terminal-observer",
    "factory.duration_available":
      args.terminal.duration.availability === "available",
  };
  Sentry.startSpanManual(
    {
      name: `Factory ${args.factory.name}`,
      op: "factory.run",
      forceTransaction: true,
      startTime: startedAt,
      attributes: sharedAttributes,
    },
    (runSpan) => {
      if (
        args.terminal.duration.availability === "available" &&
        args.terminal.stageProfiles.availability === "available"
      ) {
        const stageDurations = args.terminal.stageDurations.availability ===
            "available"
          ? new Map(
            args.terminal.stageDurations.value.map((stage) => [
              stage.stage,
              stage.durationMs,
            ]),
          )
          : new Map<string, number>();
        for (const stage of args.terminal.stageProfiles.value) {
          if (stage.firstEnteredMs === null) continue;
          const stageStartedAt = new Date(
            startedAt.getTime() + stage.firstEnteredMs,
          );
          const stageSpan = Sentry.startInactiveSpan({
            name: stage.stage,
            op: "factory.stage",
            parentSpan: runSpan,
            startTime: stageStartedAt,
            attributes: {
              ...sharedAttributes,
              stage: stage.stage,
              entries: stage.entries,
              "dispatch.attempts": stage.dispatchAttempts,
            },
          });
          const stageDurationMs = stageDurations.get(stage.stage) ?? 0;
          stageSpan.end(
            new Date(
              Math.min(
                endedAt.getTime(),
                stageStartedAt.getTime() + stageDurationMs,
              ),
            ),
          );
        }
      }
      runSpan.end(endedAt);
    },
  );
}

function createSentryFactoryMetricSink(dsn: string): FactoryMetricSink {
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    tracesSampleRate: 1,
  });
  return {
    count: (name, value, options) => Sentry.metrics.count(name, value, options),
    distribution: (name, value, options) =>
      Sentry.metrics.distribution(name, value, options),
    gauge: (name, value, options) => Sentry.metrics.gauge(name, value, options),
    trace: recordFactoryRunTrace,
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
  fact: { availability: "available"; value: boolean } | {
    availability: "unavailable";
  },
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

function buildStageProfileMetricOperations(
  args: FactoryMetricEmissionArgs,
  sharedAttributes: Record<string, MetricAttributeValue>,
): MetricOperation[] {
  if (args.terminal.stageProfiles.availability !== "available") return [];
  const operations: MetricOperation[] = [];
  for (const stage of args.terminal.stageProfiles.value) {
    const attributes = { ...sharedAttributes, stage: stage.stage };
    operations.push(
      {
        kind: "distribution",
        name: "factory.stage.entries",
        value: stage.entries,
        options: { attributes },
      },
      {
        kind: "distribution",
        name: "factory.stage.dispatch_attempts",
        value: stage.dispatchAttempts,
        options: { attributes },
      },
    );
    if (stage.firstEnteredMs !== null) {
      operations.push({
        kind: "distribution",
        name: "factory.stage.first_entered",
        value: stage.firstEnteredMs,
        options: { unit: "millisecond", attributes },
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
    ["factory.run.human_touches", args.terminal.humanTouches],
    ["factory.run.approvals", args.terminal.approvals],
    ["factory.run.rejections", args.terminal.rejections],
    ["factory.run.cycle_overrides", args.terminal.cycleOverrides],
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
  if (
    args.terminal.failedStage.availability === "available" &&
    args.terminal.failedStage.value !== null
  ) {
    operations.push({
      kind: "count",
      name: "factory.run.failed_terminal",
      value: 1,
      options: {
        attributes: {
          ...outcomeAttributes,
          "failed-stage": args.terminal.failedStage.value,
        },
      },
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
    "factory.stage.profile": availabilityValue(args.terminal.stageProfiles),
    "factory.run.failed_stage": availabilityValue(args.terminal.failedStage),
    "factory.run.human_touches": availabilityValue(args.terminal.humanTouches),
    "factory.run.approvals": availabilityValue(args.terminal.approvals),
    "factory.run.rejections": availabilityValue(args.terminal.rejections),
    "factory.run.cycle_overrides": availabilityValue(
      args.terminal.cycleOverrides,
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
    // Sentry custom attributes group reliably as strings across Trace Metrics queries.
    "factory.definition_version": String(args.factory.definition_version),
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
    ...buildDurationMetricOperations(args, sharedAttributes, outcomeAttributes),
    ...buildStageProfileMetricOperations(args, sharedAttributes),
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
    ...(args.projectedSummaryDigest === undefined
      ? []
      : [args.projectedSummaryDigest]),
  ].join("\0");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(internalKey),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function parsedEmissionReceipt(
  value: Record<string, unknown> | null,
): FactoryMetricEmissionReceipt | null {
  const parsed = FactoryMetricEmissionReceiptSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function receiptMatchesProjectedSummary(
  receipt: FactoryMetricEmissionReceipt,
  args: FactoryMetricEmissionArgs,
): boolean {
  return args.projectedSummaryDigest === undefined
    ? receipt.projectedSummaryDigest === undefined ||
      receipt.projectedSummaryDigest === null
    : receipt.projectedSummaryDigest === args.projectedSummaryDigest;
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
    projectedSummaryDigest: args.projectedSummaryDigest ?? null,
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

function emitFactoryTelemetry(
  sink: FactoryMetricSink,
  args: FactoryMetricEmissionArgs,
  operations: MetricOperation[],
): { failed: boolean; metricPoints: number } {
  let failed = false;
  let metricPoints = 0;
  try {
    sink.trace?.(args);
  } catch {
    failed = true;
  }
  try {
    for (const operation of operations) {
      sink[operation.kind](operation.name, operation.value, operation.options);
      metricPoints += 1;
    }
  } catch {
    failed = true;
  }
  return { failed, metricPoints };
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

type MetricSinkPreflight = { status: "ready"; sink: FactoryMetricSink } | {
  status: "stop";
  result: EmissionResult;
} | {
  status: "preserve";
};

async function prepareMetricSink(
  args: FactoryMetricEmissionArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies,
  receiptName: string,
): Promise<MetricSinkPreflight> {
  const priorReceipt = parsedEmissionReceipt(
    await context.readResource(receiptName),
  );
  if (priorReceipt !== null) {
    if (
      priorReceipt.emissionKeyHash !== receiptName.slice("receipt-".length) ||
      !receiptMatchesProjectedSummary(priorReceipt, args)
    ) {
      throw new Error("Factory metric receipt is stale or substituted");
    }
    context.logger.info(
      "Skipped repeated Factory metric emission for {project}/{factory}",
      {
        project: args.factory.project,
        factory: args.factory.name,
      },
    );
    if (priorReceipt.status !== "emitted") return { status: "preserve" };
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
      {
        project: args.factory.project,
        factory: args.factory.name,
      },
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
  if (preflight.status === "preserve") {
    return { dataHandles: [{ name: receiptName }] };
  }
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
  const emission = emitFactoryTelemetry(preflight.sink, args, operations);
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

/** Transform one canonical flow report and execute its non-gating emission. */
export function executeFactoryFlowMetricEmission(
  args: FactoryFlowMetricEmissionArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  return executeFactoryMetricEmission(
    factoryMetricEmissionFromFlowReport(args),
    context,
    dependencies,
  );
}

function decodeFactoryRunData(
  content: Uint8Array,
): Record<string, unknown> | null {
  try {
    const parsed = z
      .record(z.string(), z.unknown())
      .safeParse(JSON.parse(new TextDecoder().decode(content)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function factoryRunDataReader(
  context: FactoryMetricMethodContext,
  sourceModelId: string,
): RunDataReader {
  const modelTypeName = "@swamp/software-factory";
  const modelTypePath = {
    toDirectoryPath: (): string => "@swamp/software-factory",
    toString: (): string => "@swamp/software-factory",
  };
  return {
    versionsOf: (name) =>
      context.dataRepository.listVersions?.(
        modelTypePath,
        sourceModelId,
        name,
      ) ??
        Promise.resolve([]),
    read: async (name, version) => {
      const content = await context.dataRepository.getContent(
        modelTypeName,
        sourceModelId,
        name,
        version,
      );
      return content === null ? null : decodeFactoryRunData(content);
    },
  };
}

function canonicalizeFactorySummary(value: unknown): unknown {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalizeFactorySummary);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeFactorySummary(entry)]),
    );
  }
  throw new TypeError(`Unsupported projected summary value: ${typeof value}`);
}

function canonicalFactorySummaryJson(value: unknown): string {
  return JSON.stringify(canonicalizeFactorySummary(value));
}

async function factorySummaryDigest(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalFactorySummaryJson(value)),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function createFactoryProjectedTerminalAttemptIdentity(
  rawReport: unknown,
  preterminalStageCycle: number,
  sourceRevision: { kind: "journal"; name: string; version: number },
): Promise<ProjectedTerminalAttemptIdentity> {
  const report = FactoryFlowMetricReportSchema.parse(rawReport);
  return FactoryProjectedTerminalAttemptIdentitySchema.parse({
    preterminalStageCycle,
    sourceRevision,
    reportDigest: await factorySummaryDigest(report),
  });
}

const PROJECTED_TERMINAL_ROUTES = {
  "done-observability": { targetStage: "done", outcome: "done" },
  "aborted-observability": { targetStage: "aborted", outcome: "aborted" },
  "escalated-observability": {
    targetStage: "operational-escalation",
    outcome: "parked",
  },
} as const;

/** Convert a current observability report into the exact terminal outcome the verified transition will commit. */
export function projectFactoryTerminalFlowReport(
  rawReport: unknown,
  projection: z.infer<typeof ProjectedTerminalSchema>,
  journalVersion: number,
): z.infer<typeof FactoryFlowMetricReportSchema> {
  const report = FactoryFlowMetricReportSchema.parse(rawReport);
  const expected = PROJECTED_TERMINAL_ROUTES[projection.preterminalStage];
  if (
    projection.targetStage !== expected.targetStage ||
    projection.outcome !== expected.outcome
  ) {
    throw new TypeError(
      "Projected terminal outcome does not match the observability route",
    );
  }
  if (
    report.metrics.runStatus !== "active" ||
    report.metrics.stages.some((stage) => stage.terminal) ||
    !report.metrics.stages.some((stage) =>
      stage.stageId === projection.preterminalStage
    )
  ) {
    throw new TypeError(
      "Terminal projection requires the matching active preterminal stage",
    );
  }
  const source = {
    kind: "journal" as const,
    name: `journal-${workItemSlug(report.workItem)}`,
    version: journalVersion,
  };
  return FactoryFlowMetricReportSchema.parse({
    ...report,
    metrics: {
      ...report.metrics,
      runStatus: "terminal",
      stages: [...report.metrics.stages, {
        stageId: projection.targetStage,
        entries: 1,
        totalMs: null,
        durationAvailability: "unavailable",
        firstEnteredMs: null,
        dispatchAttempts: 0,
        terminal: true,
      }],
      timeToTerminalMs: {
        ...report.metrics.timeToTerminalMs,
        sources: [...report.metrics.timeToTerminalMs.sources, source],
      },
      failedStage: projection.outcome === "done"
        ? { value: null, sources: [source] }
        : { value: projection.targetStage, sources: [source] },
      outcome: { value: projection.outcome, sources: [source] },
    },
  });
}

type ProjectedTerminalAttemptIdentity = z.infer<
  typeof FactoryProjectedTerminalAttemptIdentitySchema
>;

type BuiltFactoryFlowReport = {
  report: z.infer<typeof FactoryFlowMetricReportSchema>;
  definitionVersion: number;
  projectedAttemptIdentity?: ProjectedTerminalAttemptIdentity;
};

async function buildFactoryFlowReportFromSource(
  args: FactoryFlowMetricSourceArgs,
  context: FactoryMetricMethodContext,
): Promise<BuiltFactoryFlowReport> {
  const reader = factoryRunDataReader(context, args.sourceFactory.id);
  const slug = workItemSlug(args.workItem);
  const metricsData = await loadMetricsData(reader, slug);
  const state = z.object({
    stageId: z.string(),
    status: z.string(),
    definitionVersion: z.number().int(),
    cycles: z.record(z.string(), z.number().int().positive()).optional(),
  }).parse(metricsData.state);
  const currentReport = buildFlowMetricsReport(args.workItem, metricsData, [], {
    factoryName: args.sourceFactory.name,
  });
  if (args.projectedTerminal === undefined) {
    if (state.status !== "terminal") {
      throw new TypeError(
        "Unprojected Factory metric emission requires a terminal Factory state",
      );
    }
    return {
      report: FactoryFlowMetricReportSchema.parse(currentReport),
      definitionVersion: state.definitionVersion,
    };
  }
  const expectedTerminal =
    PROJECTED_TERMINAL_ROUTES[args.projectedTerminal.preterminalStage];
  if (
    args.projectedTerminal.targetStage !== expectedTerminal.targetStage ||
    args.projectedTerminal.outcome !== expectedTerminal.outcome
  ) {
    throw new TypeError(
      "Projected terminal outcome does not match the observability route",
    );
  }
  if (state.status === "terminal") {
    const terminalStages = currentReport.metrics.stages.filter((stage) =>
      stage.terminal
    );
    const terminalSource = currentReport.metrics.outcome.sources.find((
      source,
    ) => source.kind === "journal" && source.version !== undefined);
    const terminalJournal = terminalSource?.version === undefined
      ? undefined
      : metricsData.journal.find((entry) =>
        entry.version === terminalSource.version &&
        entry.entry.event === "run_terminal"
      );
    const terminalPayload = terminalJournal?.entry.payload;
    if (
      state.stageId !== args.projectedTerminal.targetStage ||
      currentReport.metrics.runStatus !== "terminal" ||
      currentReport.metrics.outcome.value !== args.projectedTerminal.outcome ||
      terminalStages.length !== 1 ||
      terminalStages[0]?.stageId !== args.projectedTerminal.targetStage ||
      terminalSource?.name !== `journal-${slug}` ||
      terminalSource.version === undefined ||
      terminalJournal?.entry.stageId !== args.projectedTerminal.targetStage ||
      terminalPayload?.from !== args.projectedTerminal.preterminalStage ||
      terminalPayload?.to !== args.projectedTerminal.targetStage
    ) {
      throw new TypeError(
        "Projected terminal outcome does not match the durable terminal Factory route",
      );
    }
    const preterminalStageCycle = state.cycles
      ?.[args.projectedTerminal.preterminalStage];
    if (preterminalStageCycle === undefined) {
      throw new TypeError(
        "Historical terminal recovery requires the recorded preterminal stage cycle",
      );
    }
    return {
      report: FactoryFlowMetricReportSchema.parse(currentReport),
      definitionVersion: state.definitionVersion,
      projectedAttemptIdentity:
        await createFactoryProjectedTerminalAttemptIdentity(
          currentReport,
          preterminalStageCycle,
          {
            kind: "journal",
            name: `journal-${slug}`,
            version: terminalSource.version,
          },
        ),
    };
  }
  if (state.stageId !== args.projectedTerminal.preterminalStage) {
    throw new TypeError(
      "Projected terminal outcome does not match current preterminal Factory state",
    );
  }
  const journalVersions = await reader.versionsOf(`journal-${slug}`);
  const journalVersion = journalVersions.toSorted((left, right) => left - right)
    .at(-1);
  if (journalVersion === undefined) {
    throw new TypeError(
      "Terminal projection requires a versioned current journal",
    );
  }
  const report = projectFactoryTerminalFlowReport(
    currentReport,
    args.projectedTerminal,
    journalVersion,
  );
  const preterminalStageCycle = state.cycles
    ?.[args.projectedTerminal.preterminalStage];
  if (preterminalStageCycle === undefined) {
    throw new TypeError(
      "Terminal projection requires the current preterminal stage cycle",
    );
  }
  return {
    report,
    definitionVersion: state.definitionVersion,
    projectedAttemptIdentity:
      await createFactoryProjectedTerminalAttemptIdentity(
        report,
        preterminalStageCycle,
        {
          kind: "journal",
          name: `journal-${slug}`,
          version: journalVersion,
        },
      ),
  };
}

function projectedSummaryIdentity(
  args: z.infer<typeof FactoryProjectedTerminalSummaryArgsSchema>,
  attemptIdentity: ProjectedTerminalAttemptIdentity,
): Record<string, unknown> {
  return {
    workItem: args.workItem,
    sourceFactory: args.sourceFactory,
    projectedTerminal: args.projectedTerminal,
    attemptIdentity,
  };
}

export async function projectedTerminalSummaryResourceName(
  args: z.infer<typeof FactoryProjectedTerminalSummaryArgsSchema>,
  attemptIdentity: ProjectedTerminalAttemptIdentity,
): Promise<string> {
  return `projected-terminal-summary-${await factorySummaryDigest(
    projectedSummaryIdentity(args, attemptIdentity),
  )}`;
}

function projectedSummaryContentDigest(
  args: z.infer<typeof FactoryProjectedTerminalSummaryArgsSchema>,
  attemptIdentity: ProjectedTerminalAttemptIdentity,
  report: z.infer<typeof FactoryFlowMetricReportSchema>,
): Promise<string> {
  return factorySummaryDigest({
    ...projectedSummaryIdentity(args, attemptIdentity),
    report,
  });
}

/** Build one canonical persisted summary for an exact projected terminal route. */
export async function createFactoryProjectedTerminalSummary(
  rawArgs: FactoryProjectedTerminalSummaryArgs,
  report: z.infer<typeof FactoryFlowMetricReportSchema>,
  attemptIdentity: ProjectedTerminalAttemptIdentity,
  persistedAt: string,
): Promise<z.infer<typeof FactoryProjectedTerminalSummarySchema>> {
  const args = FactoryProjectedTerminalSummaryArgsSchema.parse(rawArgs);
  const identity = FactoryProjectedTerminalAttemptIdentitySchema.parse(
    attemptIdentity,
  );
  if (identity.reportDigest !== await factorySummaryDigest(report)) {
    throw new Error(
      "Projected terminal attempt identity does not match its report digest",
    );
  }
  return FactoryProjectedTerminalSummarySchema.parse({
    schemaVersion: 2,
    summaryDigest: await projectedSummaryContentDigest(args, identity, report),
    persistedAt,
    ...projectedSummaryIdentity(args, identity),
    report,
  });
}

function stableProjectedSummaryContent(
  summary: z.infer<typeof FactoryProjectedTerminalSummarySchema>,
): Record<string, unknown> {
  return {
    schemaVersion: summary.schemaVersion,
    summaryDigest: summary.summaryDigest,
    workItem: summary.workItem,
    sourceFactory: summary.sourceFactory,
    projectedTerminal: summary.projectedTerminal,
    attemptIdentity: summary.attemptIdentity,
    report: summary.report,
  };
}

/** Persist the canonical exact terminal projection before the Factory finalizes it. */
export async function executePersistFactoryProjectedTerminalSummary(
  rawArgs: FactoryProjectedTerminalSummaryArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = FactoryProjectedTerminalSummaryArgsSchema.parse(rawArgs);
  const built = await buildFactoryFlowReportFromSource(args, context);
  if (built.projectedAttemptIdentity === undefined) {
    throw new Error(
      "Projected terminal summary has no immutable attempt identity",
    );
  }
  const { report, projectedAttemptIdentity } = built;
  const name = await projectedTerminalSummaryResourceName(
    args,
    projectedAttemptIdentity,
  );
  const summary = await createFactoryProjectedTerminalSummary(
    args,
    report,
    projectedAttemptIdentity,
    dependencies.now(),
  );
  const existing = FactoryProjectedTerminalSummarySchema.safeParse(
    await context.readResource(name),
  );
  if (existing.success) {
    if (
      canonicalFactorySummaryJson(
        stableProjectedSummaryContent(existing.data),
      ) !==
        canonicalFactorySummaryJson(stableProjectedSummaryContent(summary))
    ) {
      throw new Error(
        "Projected terminal summary identity already binds different canonical facts",
      );
    }
    return { dataHandles: [{ name }] };
  }
  const handle = await context.writeResource(
    "projected-summary",
    name,
    summary,
  );
  return { dataHandles: [handle] };
}

async function factoryMetricEmissionArgsFromSource(
  rawArgs: FactoryFlowMetricSourceArgs,
  context: FactoryMetricMethodContext,
): Promise<FactoryMetricEmissionArgs> {
  const args = FactoryFlowMetricSourceArgsSchema.parse(rawArgs);
  let report: z.infer<typeof FactoryFlowMetricReportSchema>;
  let definitionVersion: number;
  let projectedSummaryDigest: string | undefined;
  if (args.projectedTerminal === undefined) {
    const built = await buildFactoryFlowReportFromSource(args, context);
    report = built.report;
    definitionVersion = built.definitionVersion;
  } else {
    const projectedArgs = FactoryProjectedTerminalSummaryArgsSchema.parse(args);
    const current = await buildFactoryFlowReportFromSource(
      projectedArgs,
      context,
    );
    if (current.projectedAttemptIdentity === undefined) {
      throw new Error(
        "Projected terminal emission has no immutable attempt identity",
      );
    }
    const name = await projectedTerminalSummaryResourceName(
      projectedArgs,
      current.projectedAttemptIdentity,
    );
    const summary = FactoryProjectedTerminalSummarySchema.parse(
      await context.readResource(name),
    );
    const expectedDigest = await projectedSummaryContentDigest(
      projectedArgs,
      current.projectedAttemptIdentity,
      current.report,
    );
    if (
      summary.summaryDigest !== expectedDigest ||
      canonicalFactorySummaryJson(summary.attemptIdentity) !==
        canonicalFactorySummaryJson(current.projectedAttemptIdentity) ||
      canonicalFactorySummaryJson(summary.report) !==
        canonicalFactorySummaryJson(current.report) ||
      canonicalFactorySummaryJson({
          workItem: summary.workItem,
          sourceFactory: summary.sourceFactory,
          projectedTerminal: summary.projectedTerminal,
          attemptIdentity: summary.attemptIdentity,
        }) !==
        canonicalFactorySummaryJson(
          projectedSummaryIdentity(
            projectedArgs,
            current.projectedAttemptIdentity,
          ),
        )
    ) {
      throw new Error(
        "Projected terminal summary is missing, stale, or substituted",
      );
    }
    const confirmed = await buildFactoryFlowReportFromSource(
      projectedArgs,
      context,
    );
    if (
      confirmed.projectedAttemptIdentity === undefined ||
      canonicalFactorySummaryJson(confirmed.projectedAttemptIdentity) !==
        canonicalFactorySummaryJson(current.projectedAttemptIdentity) ||
      canonicalFactorySummaryJson(confirmed.report) !==
        canonicalFactorySummaryJson(current.report)
    ) {
      throw new Error(
        "Projected terminal summary no longer matches current preterminal Factory attempt",
      );
    }
    report = summary.report;
    definitionVersion = confirmed.definitionVersion;
    projectedSummaryDigest = summary.summaryDigest;
  }
  const emission = factoryMetricEmissionFromFlowReport(
    FactoryFlowMetricEmissionArgsSchema.parse({
      factory: { ...args.factory, definition_version: definitionVersion },
      visualReviewStages: args.visualReviewStages,
      report,
    }),
  );
  return FactoryMetricEmissionArgsSchema.parse({
    ...emission,
    ...(projectedSummaryDigest === undefined ? {} : { projectedSummaryDigest }),
  });
}

/** Rebuild the canonical flow report from Factory data and emit its terminal facts. */
export async function executeFactoryFlowMetricEmissionFromSource(
  args: FactoryFlowMetricSourceArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  return executeFactoryMetricEmission(
    await factoryMetricEmissionArgsFromSource(args, context),
    context,
    dependencies,
  );
}

/** Verify one terminal run has a complete local receipt without making emission success a delivery gate. */
export async function verifyFactoryMetricReceipt(
  emissionArgs: FactoryMetricEmissionArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const keyHash = await emissionKeyHash(emissionArgs);
  const expectedReceipt = `receipt-${keyHash}`;
  const parsedReceipt = FactoryMetricEmissionReceiptSchema.safeParse(
    await context.readResource(expectedReceipt),
  );
  const receiptMatchesSummary = parsedReceipt.success &&
    parsedReceipt.data.emissionKeyHash === keyHash &&
    receiptMatchesProjectedSummary(parsedReceipt.data, emissionArgs);
  const receiptStatus = receiptMatchesSummary
    ? parsedReceipt.data.status
    : null;
  const status = receiptStatus === "emitted" || receiptStatus === "duplicate"
    ? "observed"
    : receiptStatus === null
    ? "missing"
    : "degraded";
  const coverage = FactoryMetricCoverageSchema.parse({
    schemaVersion: 1,
    checkedAt: dependencies.now(),
    status,
    expectedReceipt,
    projectedSummaryDigest: emissionArgs.projectedSummaryDigest ?? null,
    receiptStatus,
    factory: emissionArgs.factory,
    outcome: emissionArgs.terminal.outcome,
  });
  const handle = await context.writeResource(
    "coverage",
    `coverage-${keyHash}`,
    coverage,
  );
  if (status === "missing") {
    context.logger.warning(
      "Factory observability coverage is missing for {project}/{factory}",
      {
        project: emissionArgs.factory.project,
        factory: emissionArgs.factory.name,
      },
    );
    throw new Error("Factory observability coverage is missing");
  }
  const properties = {
    status,
    receiptStatus,
    project: emissionArgs.factory.project,
    factory: emissionArgs.factory.name,
  };
  if (status === "degraded") {
    context.logger.warning(
      "Verified complete Factory observability receipt with {receiptStatus} emission for {project}/{factory}",
      properties,
    );
  } else {
    context.logger.info(
      "Verified Factory observability receipt for {project}/{factory}",
      properties,
    );
  }
  return { dataHandles: [handle] };
}

/** Rebuild terminal flow facts and verify their exact local emission receipt. */
export async function verifyFactoryFlowMetricReceipt(
  args: FactoryFlowMetricSourceArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryMetricEmissionDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  return verifyFactoryMetricReceipt(
    await factoryMetricEmissionArgsFromSource(args, context),
    context,
    dependencies,
  );
}
