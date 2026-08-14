import assert from "node:assert/strict";

import {
  buildFactoryMetricOperations,
  executeFactoryFlowMetricEmission,
  executeFactoryMetricEmission,
  FactoryFlowMetricEmissionArgsSchema,
  FactoryFlowMetricSourceArgsSchema,
  FactoryMetricCoverageSchema,
  FactoryMetricEmissionArgsSchema,
  factoryMetricEmissionFromFlowReport,
  FactoryMetricEmissionReceiptSchema,
  type FactoryMetricSink,
  verifyFactoryMetricReceipt,
} from "./factory-sentry-metrics-emitter.ts";
import { model } from "./factory-sentry-metrics.ts";

type ValidArgs = ReturnType<typeof validArgs>;

Deno.test("model uses the reusable software Factory extension identity", () => {
  assert.equal(
    model.type,
    "@club_aqua_back_deck/software-factory-sentry-metrics",
  );
});

Deno.test("method schemas strip Swamp's resolved global argument envelope", () => {
  const direct = FactoryMetricEmissionArgsSchema.parse({
    ...validArgs(),
    dsn: "https://public@example.invalid/1",
    flushTimeoutMs: 2_000,
  });
  assert.equal("dsn" in direct, false);
  assert.equal("flushTimeoutMs" in direct, false);

  const source = FactoryFlowMetricSourceArgsSchema.parse({
    workItem: "task-example",
    sourceFactory: {
      id: "90fac686-c724-4aee-97c4-e31b9af4c5e2",
      name: "supers-delivery",
    },
    factory: {
      project: "better-randy",
      name: "supers-delivery",
      profile: "supers-dex-delivery",
    },
    visualReviewStages: ["review"],
    dsn: "https://public@example.invalid/1",
  });
  assert.equal("dsn" in source, false);
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
      stageProfiles: {
        availability: "available",
        value: [
          {
            stage: "implementation",
            entries: 2,
            firstEnteredMs: 500,
            dispatchAttempts: 2,
          },
          {
            stage: "verification",
            entries: 1,
            firstEnteredMs: 8_500,
            dispatchAttempts: 1,
          },
        ],
      },
      failedStage: {
        availability: "available",
        value: "cleanup-required",
      },
      humanTouches: { availability: "available", value: 2 },
      approvals: { availability: "available", value: 1 },
      rejections: { availability: "available", value: 1 },
      cycleOverrides: { availability: "available", value: 1 },
    },
  });
}

function validFlowReportArgs(
  outcome: "done" | "cleanup-required" | "parked" | "aborted" = "done",
) {
  return FactoryFlowMetricEmissionArgsSchema.parse({
    factory: {
      project: "better-randy",
      name: "supers-delivery",
      profile: "supers-dex-delivery",
      definition_version: 6,
    },
    visualReviewStages: ["review"],
    report: {
      workItem: "task-example",
      metrics: {
        workItem: "task-example",
        runStatus: "terminal",
        timeToTerminalMs: {
          value: 15_000,
          sources: [
            {
              kind: "journal",
              name: "journal-task-example",
              version: 9,
            },
          ],
        },
        stages: [
          {
            stageId: "implementation",
            entries: 2,
            totalMs: 10_000,
            durationAvailability: "available",
            firstEnteredMs: 0,
            dispatchAttempts: 2,
            terminal: false,
          },
          {
            stageId: "review",
            entries: 1,
            totalMs: 5_000,
            durationAvailability: "available",
            firstEnteredMs: 10_000,
            dispatchAttempts: 1,
            terminal: false,
          },
          {
            stageId: outcome === "parked" ? "review-blocked" : outcome,
            entries: 1,
            totalMs: null,
            durationAvailability: "unavailable",
            firstEnteredMs: 15_000,
            dispatchAttempts: 0,
            terminal: true,
          },
        ],
        dispatchAttempts: { value: 3, sources: [] },
        failedStage: {
          value: outcome === "done"
            ? null
            : outcome === "parked"
            ? "review-blocked"
            : outcome,
          sources: [],
        },
        humanTouches: { value: 2, sources: [] },
        approvals: 1,
        rejections: 1,
        cycleOverrides: { count: 1 },
        patchCycles: { value: 1, sources: [] },
        outcome: {
          value: outcome,
          sources: [
            {
              kind: "journal",
              name: "journal-task-example",
              version: 9,
            },
          ],
        },
        acceptedFirstPass: false,
        journalTruncated: false,
        ceremony: {
          distinctDecisionCount: { value: 2, availability: "available" },
        },
      },
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
  traceCalls: ValidArgs[];
  flushTimeouts: number[];
} {
  const operations: RecordedOperation[] = [];
  const traceCalls: ValidArgs[] = [];
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
    traceCalls,
    flushTimeouts,
    sink: {
      count: record("count"),
      distribution: record("distribution"),
      gauge: record("gauge"),
      trace: (args) => traceCalls.push(args),
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
      dataRepository: {
        getContent: () => Promise.resolve(null),
        listVersions: () => Promise.resolve([]),
      },
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
      { kind: "distribution", name: "factory.stage.entries", value: 2 },
      {
        kind: "distribution",
        name: "factory.stage.dispatch_attempts",
        value: 2,
      },
      {
        kind: "distribution",
        name: "factory.stage.first_entered",
        value: 500,
      },
      { kind: "distribution", name: "factory.stage.entries", value: 1 },
      {
        kind: "distribution",
        name: "factory.stage.dispatch_attempts",
        value: 1,
      },
      {
        kind: "distribution",
        name: "factory.stage.first_entered",
        value: 8_500,
      },
      { kind: "distribution", name: "factory.run.dispatch_attempts", value: 2 },
      { kind: "distribution", name: "factory.run.human_decisions", value: 1 },
      { kind: "distribution", name: "factory.run.patch_cycles", value: 3 },
      { kind: "distribution", name: "factory.run.human_touches", value: 2 },
      { kind: "distribution", name: "factory.run.approvals", value: 1 },
      { kind: "distribution", name: "factory.run.rejections", value: 1 },
      { kind: "distribution", name: "factory.run.cycle_overrides", value: 1 },
      { kind: "count", name: "factory.run.cleanup_failure", value: 1 },
      { kind: "count", name: "factory.run.failed_terminal", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
      { kind: "gauge", name: "factory.metric.coverage", value: 1 },
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
    "failed-stage",
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
    assert.equal(
      operation.options.attributes["factory.definition_version"],
      "4",
    );
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
      stageProfiles: { availability: "unavailable" },
      failedStage: { availability: "unavailable" },
      humanTouches: { availability: "unavailable" },
      approvals: { availability: "unavailable" },
      rejections: { availability: "unavailable" },
      cycleOverrides: { availability: "unavailable" },
    },
  });
  const operations = buildFactoryMetricOperations(unavailable);
  assert.deepEqual(
    operations.map(({ kind, name, value }) => ({ kind, name, value })),
    [
      { kind: "count", name: "factory.run.completed", value: 1 },
      ...Array.from({ length: 13 }, () => ({
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

Deno.test("terminal flow reports map every outcome into the strict emitter payload", () => {
  for (
    const outcome of ["done", "cleanup-required", "parked", "aborted"] as const
  ) {
    const emission = factoryMetricEmissionFromFlowReport(
      validFlowReportArgs(outcome),
    );
    assert.equal(emission.terminal.outcome, outcome);
    assert.equal(emission.idempotencyKey, "journal-task-example:9");
    assert.deepEqual(emission.terminal.duration, {
      availability: "available",
      value: 15_000,
    });
    assert.deepEqual(emission.terminal.stageDurations, {
      availability: "available",
      value: [
        { stage: "implementation", durationMs: 10_000 },
        { stage: "review", durationMs: 5_000 },
      ],
    });
    assert.deepEqual(emission.terminal.dispatchAttempts, {
      availability: "available",
      value: 3,
    });
    assert.deepEqual(emission.terminal.humanDecisions, {
      availability: "available",
      value: 2,
    });
    assert.deepEqual(emission.terminal.patchCycles, {
      availability: "available",
      value: 1,
    });
    assert.deepEqual(emission.terminal.acceptedFirstPass, {
      availability: "available",
      value: false,
    });
    assert.deepEqual(emission.terminal.visualReviewUsed, {
      availability: "available",
      value: true,
    });
    assert.equal(emission.terminal.stageProfiles.availability, "available");
    assert.deepEqual(emission.terminal.failedStage, {
      availability: "available",
      value: outcome === "done"
        ? null
        : outcome === "parked"
        ? "review-blocked"
        : outcome,
    });
    assert.deepEqual(emission.terminal.humanTouches, {
      availability: "available",
      value: 2,
    });
    assert.deepEqual(emission.terminal.approvals, {
      availability: "available",
      value: 1,
    });
    assert.deepEqual(emission.terminal.rejections, {
      availability: "available",
      value: 1,
    });
    assert.deepEqual(emission.terminal.cycleOverrides, {
      availability: "available",
      value: 1,
    });
  }
});

Deno.test("incomplete flow facts stay unavailable instead of becoming zero", () => {
  const args = validFlowReportArgs();
  const incomplete = FactoryFlowMetricEmissionArgsSchema.parse({
    ...args,
    report: {
      ...args.report,
      metrics: {
        ...args.report.metrics,
        timeToTerminalMs: {
          ...args.report.metrics.timeToTerminalMs,
          value: null,
        },
        stages: args.report.metrics.stages.map((stage) =>
          stage.terminal ? stage : {
            ...stage,
            totalMs: null,
            durationAvailability: "partial" as const,
          }
        ),
        journalTruncated: true,
        ceremony: {
          distinctDecisionCount: { value: 1, availability: "partial" },
        },
      },
    },
  });
  const terminal = factoryMetricEmissionFromFlowReport(incomplete).terminal;
  assert.deepEqual(terminal.duration, { availability: "unavailable" });
  assert.deepEqual(terminal.stageDurations, { availability: "unavailable" });
  assert.deepEqual(terminal.dispatchAttempts, { availability: "unavailable" });
  assert.deepEqual(terminal.humanDecisions, { availability: "unavailable" });
  assert.deepEqual(terminal.patchCycles, { availability: "unavailable" });
  assert.deepEqual(terminal.acceptedFirstPass, { availability: "unavailable" });
  assert.deepEqual(terminal.visualReviewUsed, { availability: "unavailable" });
  assert.deepEqual(terminal.stageProfiles, { availability: "unavailable" });
  assert.deepEqual(terminal.failedStage, { availability: "unavailable" });
  assert.deepEqual(terminal.humanTouches, { availability: "unavailable" });
  assert.deepEqual(terminal.approvals, { availability: "unavailable" });
  assert.deepEqual(terminal.rejections, { availability: "unavailable" });
  assert.deepEqual(terminal.cycleOverrides, { availability: "unavailable" });
});

Deno.test("active flow reports cannot reach metric emission", () => {
  const args = validFlowReportArgs();
  const active = FactoryFlowMetricEmissionArgsSchema.parse({
    ...args,
    report: {
      ...args.report,
      metrics: {
        ...args.report.metrics,
        runStatus: "active",
        outcome: { value: "active", sources: [] },
      },
    },
  });
  assert.throws(
    () => factoryMetricEmissionFromFlowReport(active),
    /only be emitted for terminal flow reports/,
  );
});

Deno.test(
  "executeFactoryMetricEmission flushes and stores a secret-free emitted receipt",
  async () => {
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
    assert.equal(recorder.traceCalls.length, 1);
    assert.equal(recorder.traceCalls[0].factory.name, "delivery");
    assert.deepEqual(recorder.flushTimeouts, [2_500]);
    const receipt = onlyReceipt(fixture.resources);
    assert.equal(receipt.status, "emitted");
    assert.equal(receipt.reason, "none");
    assert.equal(receipt.flush, "succeeded");
    assert.equal(receipt.metricPoints, recorder.operations.length);
    assert.equal(JSON.stringify(receipt).includes(dsn), false);
    assert.equal(JSON.stringify(fixture.logs).includes(dsn), false);
  },
);

Deno.test("trace failure preserves metric attempts and records degraded telemetry", async () => {
  const fixture = fixtureContext("https://public@example.com/42");
  const recorder = recordingSink();
  recorder.sink.trace = () => {
    throw new Error("trace transport setup failed");
  };

  await executeFactoryMetricEmission(validArgs(), fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:00:00.000Z",
  });

  assert.ok(recorder.operations.length > 0);
  assert.deepEqual(recorder.flushTimeouts, [2_500]);
  const receipt = onlyReceipt(fixture.resources);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.reason, "sdk-error");
  assert.equal(receipt.metricPoints, recorder.operations.length);
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

Deno.test("repeated terminal flow summaries reuse the receipt idempotency key", async () => {
  const fixture = fixtureContext("https://public@example.com/42");
  const recorder = recordingSink();
  const args = validFlowReportArgs();
  await executeFactoryFlowMetricEmission(args, fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:00:00.000Z",
  });
  const firstOperationCount = recorder.operations.length;
  await executeFactoryFlowMetricEmission(args, fixture.context, {
    createSink: () => recorder.sink,
    now: () => "2026-08-05T12:01:00.000Z",
  });
  assert.equal(recorder.operations.length, firstOperationCount);
  assert.equal(onlyReceipt(fixture.resources).status, "duplicate");
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

Deno.test("receipt coverage distinguishes observed, degraded, and missing telemetry", async () => {
  const now = () => "2026-08-07T20:00:00.000Z";

  const observed = fixtureContext("https://public@example.com/42");
  await executeFactoryMetricEmission(validArgs(), observed.context, {
    createSink: () => recordingSink().sink,
    now,
  });
  const observedResult = await verifyFactoryMetricReceipt(
    validArgs(),
    observed.context,
    { createSink: () => recordingSink().sink, now },
  );
  const observedCoverage = FactoryMetricCoverageSchema.parse(
    observed.resources.get(observedResult.dataHandles[0].name),
  );
  assert.equal(observedCoverage.status, "observed");
  assert.equal(observedCoverage.receiptStatus, "emitted");

  const degraded = fixtureContext(undefined);
  await executeFactoryMetricEmission(validArgs(), degraded.context, {
    createSink: () => recordingSink().sink,
    now,
  });
  await assert.rejects(
    () =>
      verifyFactoryMetricReceipt(validArgs(), degraded.context, {
        createSink: () => recordingSink().sink,
        now,
      }),
    /coverage is degraded/,
  );
  const degradedCoverage = [...degraded.resources.entries()].find(([name]) =>
    name.startsWith("coverage-")
  )?.[1];
  assert.equal(
    FactoryMetricCoverageSchema.parse(degradedCoverage).status,
    "degraded",
  );

  const missing = fixtureContext("https://public@example.com/42");
  await assert.rejects(
    () =>
      verifyFactoryMetricReceipt(validArgs(), missing.context, {
        createSink: () => recordingSink().sink,
        now,
      }),
    /coverage is missing/,
  );
  const missingCoverage = [...missing.resources.entries()].find(([name]) =>
    name.startsWith("coverage-")
  )?.[1];
  assert.equal(
    FactoryMetricCoverageSchema.parse(missingCoverage).status,
    "missing",
  );
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
