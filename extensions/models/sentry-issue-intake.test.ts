import assert from "node:assert/strict";

import {
  executeSentryIssueIntake,
  type SentryCommandRunner,
  SentryIssueReconciliationSchema,
  SentryIssueSnapshotSchema,
} from "./sentry-issue-intake-adapter.ts";
import { model } from "./sentry-issue-intake.ts";

const FIXED_NOW = "2026-08-09T18:30:00.000Z";

class FakeRunner implements SentryCommandRunner {
  calls: string[][] = [];

  run(
    args: readonly string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push([...args]);
    const query = args[args.indexOf("--query") + 1];
    const data = query.includes("release:")
      ? [{
        id: "1",
        shortId: "SUPERS-1",
        title: "Current crash",
        priority: "high",
        level: "error",
        status: "unresolved",
      }]
      : query.includes("lastSeen:-")
      ? [
        {
          id: "1",
          shortId: "SUPERS-1",
          title: "Current crash",
          priority: "high",
          level: "error",
          status: "unresolved",
        },
        {
          id: "2",
          shortId: "SUPERS-2",
          title: "Recent crash",
          priority: "medium",
          level: "error",
          status: "unresolved",
        },
      ]
      : [
        {
          id: "1",
          shortId: "SUPERS-1",
          title: "Current crash",
          priority: "high",
          level: "error",
          status: "unresolved",
        },
        {
          id: "2",
          shortId: "SUPERS-2",
          title: "Recent crash",
          priority: "medium",
          level: "error",
          status: "unresolved",
        },
        {
          id: "3",
          shortId: "SUPERS-3",
          title: "Old crash",
          priority: "low",
          level: "error",
          status: "unresolved",
        },
      ];
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({
        data: data.map((issue) => ({ firstSeen: FIXED_NOW, ...issue })),
        hasMore: false,
        hasPrev: false,
      }),
      stderr: "",
    });
  }
}

function fixtureContext() {
  const writes: Array<
    { specName: string; name: string; data: Record<string, unknown> }
  > = [];
  return {
    writes,
    context: {
      repoDir: "/fixture/supers",
      globalArgs: { target: "scott-tolinski-projects/supers" },
      logger: { info: () => undefined, warning: () => undefined },
      writeResource: (
        specName: string,
        name: string,
        data: Record<string, unknown>,
      ) => {
        writes.push({ specName, name, data });
        return Promise.resolve({ name });
      },
    },
  };
}

Deno.test("intake stores one bounded snapshot and classifies current, recent, and historical unresolved issues", async () => {
  const runner = new FakeRunner();
  const fixture = fixtureContext();
  await executeSentryIssueIntake(
    {
      lookbackDays: 7,
      historyDays: 90,
      limit: 100,
      currentRelease: "supers@abc1234",
    },
    fixture.context,
    { commandRunner: runner, now: () => FIXED_NOW },
  );

  assert.equal(runner.calls.length, 3);
  const snapshot = SentryIssueSnapshotSchema.parse(
    fixture.writes.find((write) => write.specName === "snapshot")?.data,
  );
  assert.equal(snapshot.issues.length, 3);
  assert.equal(snapshot.complete, true);
  const reconciliation = SentryIssueReconciliationSchema.parse(
    fixture.writes.find((write) => write.specName === "reconciliation")?.data,
  );
  assert.deepEqual(
    reconciliation.items.map(({ shortId, disposition }) => ({
      shortId,
      disposition,
    })),
    [
      { shortId: "SUPERS-1", disposition: "current-release" },
      { shortId: "SUPERS-2", disposition: "recent" },
      { shortId: "SUPERS-3", disposition: "historical-unresolved" },
    ],
  );
  assert.equal(reconciliation.automationEligible, true);
  assert.equal(reconciliation.items[0].queueIntent, "confirmed-repair");
  assert.equal(reconciliation.items[1].queueIntent, "reproduction-required");
  assert.equal(reconciliation.items[2].queueIntent, null);
});

Deno.test("scheduled intake resolves the current Git release at run time", async () => {
  const runner = new FakeRunner();
  const fixture = fixtureContext();
  await executeSentryIssueIntake(
    {
      lookbackDays: 7,
      historyDays: 90,
      limit: 100,
      currentRelease: "auto",
    },
    fixture.context,
    {
      commandRunner: runner,
      now: () => FIXED_NOW,
      resolveCurrentRelease: () => Promise.resolve("supers@scheduled-sha"),
    },
  );

  const snapshot = SentryIssueSnapshotSchema.parse(
    fixture.writes.find((write) => write.specName === "snapshot")?.data,
  );
  assert.equal(snapshot.currentRelease, "supers@scheduled-sha");
  assert(
    runner.calls.some((call) =>
      call[call.indexOf("--query") + 1] ===
        "is:unresolved release:supers@scheduled-sha"
    ),
  );
});

class SequenceRunner implements SentryCommandRunner {
  constructor(
    private readonly results: Array<
      { code: number; stdout: string; stderr: string } | Error
    >,
  ) {}
  run(): Promise<{ code: number; stdout: string; stderr: string }> {
    const next = this.results.shift();
    if (!next) throw new Error("No fixture result");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}

function cliResult(data: unknown[], hasMore = false) {
  return {
    code: 0,
    stdout: JSON.stringify({
      data: data.map((issue) =>
        typeof issue === "object" && issue !== null
          ? { firstSeen: FIXED_NOW, ...issue }
          : issue
      ),
      hasMore,
      hasPrev: false,
    }),
    stderr: "",
  };
}

Deno.test("incomplete pagination fails closed and makes every item ambiguous", async () => {
  const issue = {
    id: "1",
    shortId: "SUPERS-1",
    title: "Crash",
    priority: "high",
    level: "error",
    status: "unresolved",
  };
  const runner = new SequenceRunner([
    cliResult([issue], true),
    cliResult([issue]),
    cliResult([]),
  ]);
  const fixture = fixtureContext();
  await executeSentryIssueIntake(
    {
      lookbackDays: 7,
      historyDays: 90,
      limit: 1,
      currentRelease: "supers@abc1234",
    },
    fixture.context,
    { commandRunner: runner, now: () => FIXED_NOW },
  );
  const reconciliation = SentryIssueReconciliationSchema.parse(
    fixture.writes.find((write) => write.specName === "reconciliation")?.data,
  );
  assert.equal(reconciliation.automationEligible, false);
  assert.equal(reconciliation.items[0].disposition, "ambiguous");
  assert.equal(reconciliation.items[0].queueIntent, null);
});

Deno.test("conflicting Sentry identities fail closed before storing resources", async () => {
  const runner = new SequenceRunner([
    cliResult([{
      id: "1",
      shortId: "SUPERS-1",
      title: "A",
      status: "unresolved",
    }]),
    cliResult([{
      id: "2",
      shortId: "SUPERS-1",
      title: "B",
      status: "unresolved",
    }]),
  ]);
  const fixture = fixtureContext();
  await assert.rejects(
    executeSentryIssueIntake(
      { lookbackDays: 7, historyDays: 90, limit: 100 },
      fixture.context,
      { commandRunner: runner, now: () => FIXED_NOW },
    ),
    /conflicting identity/,
  );
  assert.equal(fixture.writes.length, 0);
});

Deno.test("malformed output and command timeouts fail without partial snapshots", async () => {
  for (
    const result of [
      { code: 0, stdout: "not-json", stderr: "" },
      new Error("sentry command timed out after 20000ms"),
    ]
  ) {
    const fixture = fixtureContext();
    await assert.rejects(
      executeSentryIssueIntake(
        { lookbackDays: 7, historyDays: 90, limit: 100 },
        fixture.context,
        { commandRunner: new SequenceRunner([result]), now: () => FIXED_NOW },
      ),
    );
    assert.equal(fixture.writes.length, 0);
  }
});

Deno.test("stored titles redact URLs, repository paths, and inline secrets", async () => {
  const issue = {
    id: "1",
    shortId: "SUPERS-1",
    title:
      '\u001b[31mFailed\u001b[0m at data:["/Users/person/private/file.ts"] https://key@example.invalid/1 token=super-secret',
    priority: "high",
    level: "error",
    status: "unresolved",
  };
  const fixture = fixtureContext();
  await executeSentryIssueIntake(
    { lookbackDays: 7, historyDays: 90, limit: 100 },
    fixture.context,
    {
      commandRunner: new SequenceRunner([
        cliResult([issue]),
        cliResult([issue]),
      ]),
      now: () => FIXED_NOW,
    },
  );
  const snapshot = SentryIssueSnapshotSchema.parse(
    fixture.writes.find((write) => write.specName === "snapshot")?.data,
  );
  assert.equal(
    snapshot.issues[0].title,
    'Failed at data:["<path>"] <url> token=<redacted>',
  );
  assert.equal(JSON.stringify(fixture.writes).includes("super-secret"), false);
  assert.equal(JSON.stringify(fixture.writes).includes("/Users/person"), false);
});

Deno.test("model exposes bounded read-only intake, evidence, and triage methods", () => {
  assert.equal(model.type, "@supers/sentry-issue-intake");
  assert.deepEqual(Object.keys(model.methods).sort(), [
    "collect",
    "collect-repair-evidence",
    "reproduce-defect",
    "triage",
    "verify-no-recurrence",
  ]);
  assert.deepEqual(Object.keys(model.resources).sort(), [
    "defect-reproduction",
    "defect-reproduction-attempt",
    "defect-reproduction-rejection",
    "no-recurrence",
    "reconciliation",
    "repair-evidence",
    "snapshot",
    "triage",
  ]);
});
