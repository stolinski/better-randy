import * as Sentry from "npm:@sentry/node@10.67.0";
import { z } from "npm:zod@4.4.3";

import type {
  FactoryMetricMethodContext,
  FactoryMetricSink,
} from "./factory-sentry-metrics-emitter.ts";

const BoundedNameSchema = z.string().min(1).max(120).regex(
  /^[A-Za-z0-9._:-]+$/,
);
const CountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const MoneySchema = z.number().finite().nonnegative().max(1_000_000);

export const FactoryAgentTelemetryArgsSchema = z.object({
  idempotencyKey: z.string().min(1).max(256).meta({ sensitive: true }),
  factory: z.strictObject({
    project: BoundedNameSchema,
    name: BoundedNameSchema,
    profile: BoundedNameSchema,
    stage: BoundedNameSchema,
    definitionVersion: BoundedNameSchema,
  }),
  agent: z.strictObject({
    provider: BoundedNameSchema,
    model: BoundedNameSchema,
    turns: CountSchema.max(1_000),
    inputTokens: CountSchema,
    outputTokens: CountSchema,
    cacheReadTokens: CountSchema,
    cacheWriteTokens: CountSchema,
    totalTokens: CountSchema,
    costUsd: MoneySchema,
    requestBytes: CountSchema,
    contextTokens: CountSchema.nullable(),
    contextWindow: CountSchema.nullable(),
    toolCalls: CountSchema,
    toolErrors: CountSchema,
    toolDurationMs: CountSchema,
    compactions: CountSchema,
    skillCatalogCount: CountSchema.max(10_000),
    skillMetadataBytes: CountSchema,
    skillUses: z.array(z.strictObject({
      name: BoundedNameSchema,
      count: CountSchema,
    })).max(128),
  }),
});

export type FactoryAgentTelemetryArgs = z.infer<
  typeof FactoryAgentTelemetryArgsSchema
>;

export const FactoryAgentTelemetryReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
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
  metricPoints: CountSchema,
  factory: FactoryAgentTelemetryArgsSchema.shape.factory,
  provider: BoundedNameSchema,
  model: BoundedNameSchema,
});

export type FactoryAgentTelemetryReceipt = z.infer<
  typeof FactoryAgentTelemetryReceiptSchema
>;

type AgentMetricOperation = {
  kind: "count" | "distribution" | "gauge";
  name: string;
  value: number;
  unit?: string;
  attributes: Record<string, string | number | boolean>;
};

export type FactoryAgentTelemetryDependencies = {
  createSink: (dsn: string) => FactoryMetricSink;
  now: () => string;
  recordTrace: (args: FactoryAgentTelemetryArgs) => void;
};

function createSink(dsn: string): FactoryMetricSink {
  Sentry.init({ dsn, defaultIntegrations: false, tracesSampleRate: 1 });
  return {
    count: (name, value, options) => Sentry.metrics.count(name, value, options),
    distribution: (name, value, options) =>
      Sentry.metrics.distribution(name, value, options),
    gauge: (name, value, options) => Sentry.metrics.gauge(name, value, options),
    flush: (timeoutMs) => Sentry.flush(timeoutMs),
  };
}

const DEFAULT_DEPENDENCIES: FactoryAgentTelemetryDependencies = {
  createSink,
  now: () => new Date().toISOString(),
  recordTrace: recordAgentTrace,
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function sharedAttributes(args: FactoryAgentTelemetryArgs) {
  return {
    "factory.project": args.factory.project,
    "factory.name": args.factory.name,
    "factory.profile": args.factory.profile,
    "factory.stage": args.factory.stage,
    "factory.definition_version": args.factory.definitionVersion,
    "gen_ai.system": args.agent.provider,
    "gen_ai.request.model": args.agent.model,
    "factory.telemetry_source": "prime-agent-cockpit",
  };
}

export function buildFactoryAgentMetricOperations(
  args: FactoryAgentTelemetryArgs,
): AgentMetricOperation[] {
  const attributes = sharedAttributes(args);
  const operations: AgentMetricOperation[] = [
    { kind: "count", name: "factory.agent.emission", value: 1, attributes },
    {
      kind: "distribution",
      name: "factory.agent.turns",
      value: args.agent.turns,
      attributes,
    },
    {
      kind: "distribution",
      name: "factory.agent.cost",
      value: args.agent.costUsd,
      unit: "usd",
      attributes,
    },
    {
      kind: "distribution",
      name: "factory.agent.request_bytes",
      value: args.agent.requestBytes,
      unit: "byte",
      attributes,
    },
    {
      kind: "distribution",
      name: "factory.agent.tool_calls",
      value: args.agent.toolCalls,
      attributes,
    },
    {
      kind: "distribution",
      name: "factory.agent.tool_errors",
      value: args.agent.toolErrors,
      attributes,
    },
    {
      kind: "distribution",
      name: "factory.agent.tool_duration",
      value: args.agent.toolDurationMs,
      unit: "millisecond",
      attributes,
    },
    {
      kind: "distribution",
      name: "factory.agent.compactions",
      value: args.agent.compactions,
      attributes,
    },
    {
      kind: "gauge",
      name: "factory.agent.skill_catalog_count",
      value: args.agent.skillCatalogCount,
      attributes,
    },
    {
      kind: "gauge",
      name: "factory.agent.skill_metadata_bytes",
      value: args.agent.skillMetadataBytes,
      unit: "byte",
      attributes,
    },
    {
      kind: "gauge",
      name: "factory.agent.reasoning_token_coverage",
      value: 0,
      attributes,
    },
  ];
  const tokenValues = {
    input: args.agent.inputTokens,
    output: args.agent.outputTokens,
    cache_read: args.agent.cacheReadTokens,
    cache_write: args.agent.cacheWriteTokens,
    total: args.agent.totalTokens,
  };
  for (const [type, value] of Object.entries(tokenValues)) {
    operations.push({
      kind: "distribution",
      name: "factory.agent.tokens",
      value,
      attributes: { ...attributes, "token.type": type },
    });
  }
  if (args.agent.contextTokens !== null) {
    operations.push({
      kind: "gauge",
      name: "factory.agent.context_tokens",
      value: args.agent.contextTokens,
      attributes,
    });
  }
  if (args.agent.contextWindow !== null) {
    operations.push({
      kind: "gauge",
      name: "factory.agent.context_window",
      value: args.agent.contextWindow,
      attributes,
    });
  }
  for (const skill of args.agent.skillUses) {
    operations.push({
      kind: "count",
      name: "factory.agent.skill_use",
      value: skill.count,
      attributes: { ...attributes, skill: skill.name },
    });
  }
  return operations;
}

function emitOperation(
  sink: FactoryMetricSink,
  operation: AgentMetricOperation,
): void {
  const options = { unit: operation.unit, attributes: operation.attributes };
  if (operation.kind === "count") {
    sink.count(operation.name, operation.value, options);
  } else if (operation.kind === "distribution") {
    sink.distribution(operation.name, operation.value, options);
  } else sink.gauge(operation.name, operation.value, options);
}

function recordAgentTrace(args: FactoryAgentTelemetryArgs): void {
  const attributes = {
    ...sharedAttributes(args),
    "gen_ai.usage.input_tokens": args.agent.inputTokens,
    "gen_ai.usage.output_tokens": args.agent.outputTokens,
    "gen_ai.usage.total_tokens": args.agent.totalTokens,
    "factory.agent.cache_read_tokens": args.agent.cacheReadTokens,
    "factory.agent.cache_write_tokens": args.agent.cacheWriteTokens,
    "factory.agent.cost_usd": args.agent.costUsd,
    "factory.agent.turns": args.agent.turns,
    "factory.agent.tool_calls": args.agent.toolCalls,
    "factory.agent.tool_errors": args.agent.toolErrors,
  };
  Sentry.startSpanManual(
    {
      name: `Prime Agent ${args.factory.stage}`,
      op: "gen_ai.agent",
      forceTransaction: true,
      attributes,
    },
    (span) => span.end(),
  );
}

export async function executeFactoryAgentTelemetryEmission(
  rawArgs: FactoryAgentTelemetryArgs,
  context: FactoryMetricMethodContext,
  dependencies: FactoryAgentTelemetryDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = FactoryAgentTelemetryArgsSchema.parse(rawArgs);
  const emissionKeyHash = await sha256Hex(args.idempotencyKey);
  const receiptName = `agent-receipt-${emissionKeyHash}`;
  const existing = FactoryAgentTelemetryReceiptSchema.safeParse(
    await context.readResource(receiptName),
  );
  if (existing.success) {
    const duplicate = FactoryAgentTelemetryReceiptSchema.parse({
      ...existing.data,
      recordedAt: dependencies.now(),
      status: "duplicate",
      reason: "duplicate",
    });
    const handle = await context.writeResource(
      "agent-receipt",
      receiptName,
      duplicate,
    );
    return { dataHandles: [handle] };
  }

  let status: FactoryAgentTelemetryReceipt["status"] = "emitted";
  let reason: FactoryAgentTelemetryReceipt["reason"] = "none";
  let metricPoints = 0;
  const dsn = context.globalArgs.dsn;
  if (!dsn) {
    status = "unavailable";
    reason = "missing-dsn";
  } else {
    try {
      const sink = dependencies.createSink(dsn);
      const operations = buildFactoryAgentMetricOperations(args);
      for (const operation of operations) emitOperation(sink, operation);
      dependencies.recordTrace(args);
      metricPoints = operations.length;
      const flushed = await sink.flush(
        context.globalArgs.flushTimeoutMs ?? 5_000,
      );
      if (!flushed) {
        status = "failed";
        reason = "flush-failed";
      }
    } catch (error) {
      status = "failed";
      reason = "sdk-error";
      context.logger.warning("Prime Agent telemetry emission failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  const receipt = FactoryAgentTelemetryReceiptSchema.parse({
    schemaVersion: 1,
    emissionKeyHash,
    recordedAt: dependencies.now(),
    status,
    reason,
    metricPoints,
    factory: args.factory,
    provider: args.agent.provider,
    model: args.agent.model,
  });
  const handle = await context.writeResource(
    "agent-receipt",
    receiptName,
    receipt,
  );
  return { dataHandles: [handle] };
}
