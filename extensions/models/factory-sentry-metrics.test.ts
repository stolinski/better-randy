import assert from "node:assert/strict";

import {
  buildFactoryMetricOperations,
  executeFactoryMetricEmission,
  FactoryMetricEmissionArgsSchema,
  FactoryMetricEmissionReceiptSchema,
  type FactoryMetricSink,
} from "./factory-sentry-metrics-emitter.ts";
import { model } from "./factory-sentry-metrics.ts";

type ValidArgs = ReturnType<typeof validArgs>;

Deno.test("model uses the reusable software Factory extension identity", () => {
  assert.equal(
    model.type,
    "@club_aqua_back_deck/software-factory-sentry-metrics",
  );
});

function validArgs() {
  return FactoryMetricEmissionArgsSchema.parse({
    idempotencyKey: "run-example-1",
    factory: {
      project: "example-project",
      name: "delivery",
      profile: "standard-v2",
      definition_version: 4,
    },
    terminal: {
      outcome: "cleanup-required",
      duration: { availability: "available", value: 12_500 },
      stageDurations: {
        availability: "available",
        value: [
          { stage: "implementation", durationMs: 8_000 },
          { stage: "verification", durationMs: 4_500 },
        ],
      },
      dispatchAttempts: { availability: "available", value: 2 },
      humanDecisions: { availability: "available", value: 1 },
      patchCycles: { availability: "available", value: 3 },
      acceptedFirstPass: { availability: "available", value: false },
      visualReviewUsed: { availability: "available", value: true },
    },
  });
}

type RecordedOperation = {
  kind: "count" | "distribution" | "gauge";
  name: string;
  value: number;
  options: Parameters<FactoryMetricSink["count"]>[2];
};

function recordingSink(flushResult = true): {
  sink: FactoryMetricSink;
  operations: RecordedOperation[];
  flushTimeouts: number[];
} {
  const operations: RecordedOperation[] = [];
  const flushTimeouts: number[] = [];
  const record = (kind: RecordedOperation["kind"]) =>
  (
    name: string,
    value: number,
    options: RecordedOperation["options"],
  ): void => {
    operations.push({ kind, name, value, options });
  };
  return {
    operations,
    flushTimeouts,
    sink: {
      count: record("count"),
      distribution: record("distribution"),
      gauge: record("gauge"),
      flush: (timeoutMs) => {
        flushTimeouts.push(timeoutMs);
        return Promise.resolve(flushResult);
      },
    },
  };
}

function fixtureContext(
  dsn: string | undefined,
  flushTimeoutMs: number | undefined = 2_500,
) {
  const resources = new Map<string, Record<string, unknown>>();
  const logs: Array<{ message: string; properties?: Record<string, unknown> }> =
    [];
  const globalArgs: { dsn: string | undefined; flushTimeoutMs?: number } = {
    dsn,
    flushTimeoutMs,
  };
  return {
    resources,
    logs,
    context: {
      globalArgs,
      logger: {
        info: (message: string, properties?: Record<string, unknown>) => {
          logs.push({ message, properties });
        },
        warning: (message: string, properties?: Record<string, unknown>) => {
          logs.push({ message, properties });
        },
      },
      readResource: (name: string) =>
        Promise.resolve(resources.get(name) ?? null),
      writeResource: (
        _specName: string,
        name: string,
        data: Record<string, unknown>,
      ) => {
        resources.set(name, data);
        return Promise.resolve({ name });
      },
    },
  };
}

function onlyReceipt(resources: Map<string, Record<string, unknown>>) {
  assert.equal(resources.size, 1);
  return FactoryMetricEmissionReceiptSchema.parse([...resources.values()][0]);
}

Deno.test("buildFactoryMetricOperations emits the documented bounded vocabulary", () => {
  const operations = buildFactoryMetricOperations(validArgs());
  assert.deepEqual(
    operations.map(({ kind, name, value }) => ({ kind, name, value })),
    [
      { kind: "count", name: "factory.run.completed", value: 1 },
      { kind: "distribution", name: "factory.run.duration", value: 12_500 },
      { kind: "distribution", name: "factory.stage.duration", value: 8_000 },
      { kind: "distribution", name: "factory.stage.duration", value: 4_500 },
      { kind: "distribution", name: "factory.run.dispatch_attempts", value: 2 },
      { kind: "distribution", name: "factory.run.human_decisions", value: 1 },
      { kind: "distribution", name: "factory.run.patch_cycles", value: 3 },
      { kind: "count", name: "factory.run.cleanup_failure", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
    ],
  );

  const allowedAttributes = new Set([
    "factory.project",
    "factory.name",
    "factory.profile",
    "factory.definition_version",
    "outcome",
    "accepted-first-pass",
    "visual-review-used",
    "stage",
    "metric",
  ]);
  for (const operation of operations) {
    assert.equal(
      operation.options.attributes["factory.project"],
      "example-project",
    );
    assert.equal(operation.options.attributes["factory.name"], "delivery");
    assert.equal(
      operation.options.attributes["factory.profile"],
      "standard-v2",
    );
    assert.equal(operation.options.attributes["factory.definition_version"], 4);
    for (const attribute of Object.keys(operation.options.attributes)) {
      assert.equal(allowedAttributes.has(attribute), true, attribute);
    }
  }
});

Deno.test("unavailable facts emit coverage zero without invented distributions", () => {
  const args = validArgs();
  const unavailable = FactoryMetricEmissionArgsSchema.parse({
    ...args,
    terminal: {
      ...args.terminal,
      outcome: "done",
      duration: { availability: "unavailable" },
      stageDurations: { availability: "unavailable" },
      dispatchAttempts: { availability: "unavailable" },
      humanDecisions: { availability: "unavailable" },
      patchCycles: { availability: "unavailable" },
      acceptedFirstPass: { availability: "unavailable" },
      visualReviewUsed: { availability: "unavailable" },
    },
  });
  const operations = buildFactoryMetricOperations(unavailable);
  assert.deepEqual(
    operations.map(({ kind, name, value }) => ({ kind, name, value })),
    [
      { kind: "count", name: "factory.run.completed", value: 1 },
      ...Array.from({ length: 7 }, () => ({
        kind: "gauge" as const,
        name: "factory.metric.coverage",
        value: 0,
      })),
    ],
  );
  assert.equal(
    operations[0].options.attributes["accepted-first-pass"],
    "unavailable",
  );
  assert.equal(
    operations[0].options.attributes["visual-review-used"],
    "unavailable",
  );
});

Deno.test("executeFactoryMetricEmission flushes and stores a secret-free emitted receipt", async () => {
  const dsn = "https://public@example.com/42";
  const fixture = fixtureContext(dsn);
  const recorder = recordingSink();
  let suppliedDsn = "";
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: (value) => {
      suppliedDsn = value;
      return recorder.sink;
    },
    now: () => "2026-08-05T12:00:00.000Z",
  });

  assert.equal(suppliedDsn, dsn);
  assert.deepEqual(recorder.flushTimeouts, [2_500]);
  const receipt = onlyReceipt(fixture.resources);
  assert.equal(receipt.status, "emitted");
  assert.equal(receipt.reason, "none");
  assert.equal(receipt.flush, "succeeded");
  assert.equal(receipt.metricPoints, recorder.operations.length);
  assert.equal(JSON.stringify(receipt).includes(dsn), false);
  assert.equal(JSON.stringify(fixture.logs).includes(dsn), false);
});

Deno.test("missing DSN is explicit, non-gating, and retryable", async () => {
  const fixture = fixtureContext(undefined);
  let sinkCreated = false;
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => {
      sinkCreated = true;
      return recordingSink().sink;
    },
    now: () => "2026-08-05T12:00:00.000Z",
  });

  assert.equal(sinkCreated, false);
  const unavailableReceipt = onlyReceipt(fixture.resources);
  assert.equal(unavailableReceipt.status, "unavailable");
  assert.equal(unavailableReceipt.reason, "missing-dsn");

  fixture.context.globalArgs.dsn = "https://public@example.com/42";
  const recorder = recordingSink();
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:01:00.000Z",
  });
  assert.equal(recorder.flushTimeouts.length, 1);
  assert.equal(onlyReceipt(fixture.resources).status, "emitted");
});

Deno.test("an omitted flush timeout uses the bounded internal default", async () => {
  const fixture = fixtureContext("https://public@example.com/42");
  fixture.context.globalArgs.flushTimeoutMs = undefined;
  const recorder = recordingSink();
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:00:00.000Z",
  });

  assert.deepEqual(recorder.flushTimeouts, [5_000]);
});

Deno.test("a final receipt suppresses duplicate network emission", async () => {
  const fixture = fixtureContext("https://public@example.com/42");
  const recorder = recordingSink();
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:00:00.000Z",
  });
  const firstOperationCount = recorder.operations.length;
  let duplicateSinkCreated = false;
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => {
      duplicateSinkCreated = true;
      return recorder.sink;
    },
    now: () => "2026-08-05T12:01:00.000Z",
  });

  assert.equal(duplicateSinkCreated, false);
  assert.equal(recorder.operations.length, firstOperationCount);
  const duplicateReceipt = onlyReceipt(fixture.resources);
  assert.equal(duplicateReceipt.status, "duplicate");
  assert.match(duplicateReceipt.emissionKeyHash, /^[a-f0-9]{64}$/);
  assert.equal(
    JSON.stringify(recorder.operations).includes("run-example-1"),
    false,
  );
});

Deno.test("flush failure is recorded without throwing and remains idempotent", async () => {
  const fixture = fixtureContext("https://public@example.com/42");
  const recorder = recordingSink(false);
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:00:00.000Z",
  });

  const failedReceipt = onlyReceipt(fixture.resources);
  assert.equal(failedReceipt.status, "failed");
  assert.equal(failedReceipt.reason, "flush-failed");
  assert.equal(failedReceipt.flush, "failed");

  let retrySinkCreated = false;
  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => {
      retrySinkCreated = true;
      return recordingSink().sink;
    },
    now: () => "2026-08-05T12:01:00.000Z",
  });
  assert.equal(retrySinkCreated, false);
  assert.equal(onlyReceipt(fixture.resources).status, "duplicate");
});

Deno.test("input schema rejects non-terminal outcomes and unbounded dimensions", () => {
  const args = validArgs() as ValidArgs;
  assert.equal(
    FactoryMetricEmissionArgsSchema.safeParse({
      ...args,
      terminal: { ...args.terminal, outcome: "active" },
    }).success,
    false,
  );
  assert.equal(
    FactoryMetricEmissionArgsSchema.safeParse({
      ...args,
      factory: { ...args.factory, project: "contains spaces" },
    }).success,
    false,
  );
});
