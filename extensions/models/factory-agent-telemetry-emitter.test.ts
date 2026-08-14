import assert from "node:assert/strict";

import {
  buildFactoryAgentMetricOperations,
  executeFactoryAgentTelemetryEmission,
  FactoryAgentTelemetryArgsSchema,
  type FactoryAgentTelemetryDependencies,
  FactoryAgentTelemetryReceiptSchema,
} from "./factory-agent-telemetry-emitter.ts";
import type {
  FactoryMetricMethodContext,
  FactoryMetricSink,
} from "./factory-sentry-metrics-emitter.ts";

function validArgs() {
  return FactoryAgentTelemetryArgsSchema.parse({
    idempotencyKey: "session:batch-1",
    factory: {
      project: "better-randy",
      name: "supers-delivery",
      profile: "supers-dex-delivery",
      stage: "verification",
      definitionVersion: "7",
    },
    agent: {
      provider: "openai-codex",
      model: "gpt-5.6",
      turns: 2,
      inputTokens: 1_000,
      outputTokens: 200,
      cacheReadTokens: 800,
      cacheWriteTokens: 20,
      totalTokens: 2_020,
      costUsd: 0.42,
      requestBytes: 45_000,
      contextTokens: 12_000,
      contextWindow: 128_000,
      toolCalls: 4,
      toolErrors: 1,
      toolDurationMs: 1_500,
      compactions: 0,
      skillCatalogCount: 30,
      skillMetadataBytes: 8_000,
      skillUses: [{ name: "swamp", count: 1 }],
    },
  });
}

Deno.test("agent telemetry uses bounded metric names and attributes", () => {
  const operations = buildFactoryAgentMetricOperations(validArgs());
  assert.equal(
    operations.filter((operation) => operation.name === "factory.agent.tokens")
      .length,
    5,
  );
  assert.ok(
    operations.some((operation) =>
      operation.name === "factory.agent.skill_use"
    ),
  );
  assert.ok(
    operations.every((operation) =>
      operation.attributes["factory.project"] === "better-randy" &&
      !("session" in operation.attributes) &&
      !("workItem" in operation.attributes)
    ),
  );
});

Deno.test("agent telemetry emits and stores an idempotent receipt", async () => {
  const resources = new Map<string, Record<string, unknown>>();
  const emitted: string[] = [];
  let traceCalls = 0;
  const sink: FactoryMetricSink = {
    count: (name) => emitted.push(name),
    distribution: (name) => emitted.push(name),
    gauge: (name) => emitted.push(name),
    flush: async () => true,
  };
  const dependencies: FactoryAgentTelemetryDependencies = {
    createSink: () => sink,
    now: () => "2026-08-09T00:00:00.000Z",
    recordTrace: () => {
      traceCalls += 1;
    },
  };
  const context = mockContext(resources);

  const first = await executeFactoryAgentTelemetryEmission(
    validArgs(),
    context,
    dependencies,
  );
  assert.equal(first.dataHandles.length, 1);
  assert.ok(emitted.length > 10);
  assert.equal(traceCalls, 1);
  const receipt = FactoryAgentTelemetryReceiptSchema.parse(
    resources.values().next().value,
  );
  assert.equal(receipt.status, "emitted");
  assert.equal(receipt.reason, "none");

  emitted.length = 0;
  const second = await executeFactoryAgentTelemetryEmission(
    validArgs(),
    context,
    dependencies,
  );
  assert.equal(second.dataHandles.length, 1);
  assert.deepEqual(emitted, []);
  assert.equal(traceCalls, 1);
  const duplicate = FactoryAgentTelemetryReceiptSchema.parse(
    resources.values().next().value,
  );
  assert.equal(duplicate.status, "duplicate");
});

Deno.test("agent telemetry records missing DSN without attempting network emission", async () => {
  const resources = new Map<string, Record<string, unknown>>();
  const context = mockContext(resources, "");
  const dependencies: FactoryAgentTelemetryDependencies = {
    createSink: () => {
      throw new Error("must not initialize");
    },
    now: () => "2026-08-09T00:00:00.000Z",
    recordTrace: () => {
      throw new Error("must not trace");
    },
  };
  await executeFactoryAgentTelemetryEmission(
    validArgs(),
    context,
    dependencies,
  );
  const receipt = FactoryAgentTelemetryReceiptSchema.parse(
    resources.values().next().value,
  );
  assert.equal(receipt.status, "unavailable");
  assert.equal(receipt.reason, "missing-dsn");
});

function mockContext(
  resources: Map<string, Record<string, unknown>>,
  dsn: string | undefined = "https://public@example.invalid/1",
): FactoryMetricMethodContext {
  return {
    globalArgs: { dsn, flushTimeoutMs: 1_000 },
    logger: { info: () => {}, warning: () => {} },
    readResource: async (name) => resources.get(name) ?? null,
    dataRepository: {
      getContent: async () => null,
      listVersions: async () => [],
    },
    writeResource: async (_specName, name, data) => {
      resources.set(name, data);
      return { name };
    },
  };
}
