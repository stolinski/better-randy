import assert from "node:assert/strict";

import {
  executeSentryDexTriage,
  type SentryDexCommandRunner,
  SentryDexTriageSchema,
} from "./sentry-dex-triage.ts";

const FINGERPRINT = "a".repeat(64);
const NOW = "2026-08-09T23:30:00.000Z";

class FakeDexRunner implements SentryDexCommandRunner {
  calls: string[][] = [];
  constructor(private readonly tasks: unknown[]) {}
  run(
    args: readonly string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push([...args]);
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify(this.tasks),
      stderr: "",
    });
  }
}

function reconciliation(items: Array<Record<string, unknown>>) {
  return {
    sourceSnapshot: `sentry-issue-snapshot-${FINGERPRINT}`,
    sourceFingerprint: FINGERPRINT,
    generatedAt: NOW,
    automationEligible: true,
    items,
  };
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: "7659756211",
    shortId: "SUPERS-17",
    title: "Identifier allowedKeys has already been declared",
    priority: "high",
    level: "error",
    disposition: "current-release",
    repairCandidate: true,
    requiresReproduction: false,
    ...overrides,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    parent_id: "epic-1",
    name: "Fix SUPERS-17 duplicate declaration",
    description: "Repair the current Sentry regression.",
    priority: 2,
    completed: false,
    result: null,
    metadata: null,
    created_at: NOW,
    updated_at: NOW,
    started_at: null,
    completed_at: null,
    blockedBy: [],
    blocks: [],
    children: [],
    ...overrides,
  };
}

function fixtureContext(reconciliationValue: Record<string, unknown>) {
  const writes: Array<
    { specName: string; name: string; data: Record<string, unknown> }
  > = [];
  return {
    writes,
    context: {
      repoDir: "/fixture/supers",
      logger: { info: () => undefined, warning: () => undefined },
      readResource: (name: string) =>
        Promise.resolve(
          name === "reconciliation-source" ? reconciliationValue : null,
        ),
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

Deno.test("triage reads Dex once and attaches an exact open Sentry task with graph context", async () => {
  const runner = new FakeDexRunner([
    task(),
    task({
      id: "epic-1",
      parent_id: null,
      name: "Reliability epic",
      description: "",
      children: ["task-1"],
    }),
    task({
      id: "child-1",
      parent_id: "task-1",
      name: "Regression test",
      description: "",
      children: [],
    }),
  ]);
  const fixture = fixtureContext(reconciliation([issue()]));
  await executeSentryDexTriage(
    {
      sourceReconciliation: "reconciliation-source",
      expectedFingerprint: FINGERPRINT,
    },
    fixture.context,
    { commandRunner: runner, now: () => NOW },
  );

  assert.deepEqual(runner.calls, [["list", "--all", "--json"]]);
  const report = SentryDexTriageSchema.parse(fixture.writes[0].data);
  assert.equal(report.automationEligible, true);
  assert.equal(report.items[0].recommendation, "attach-existing");
  assert.deepEqual(report.items[0].exactMatchTaskIds, ["task-1"]);
  assert.deepEqual(report.items[0].ancestorTaskIds, ["epic-1"]);
  assert.deepEqual(report.items[0].descendantTaskIds, ["child-1"]);
});

Deno.test("triage proposes a new task only for a current-release issue with no Dex match", async () => {
  const fixture = fixtureContext(reconciliation([issue()]));
  await executeSentryDexTriage(
    {
      sourceReconciliation: "reconciliation-source",
      expectedFingerprint: FINGERPRINT,
    },
    fixture.context,
    { commandRunner: new FakeDexRunner([]), now: () => NOW },
  );
  const report = SentryDexTriageSchema.parse(fixture.writes[0].data);
  assert.equal(report.automationEligible, true);
  assert.equal(report.items[0].recommendation, "create-task");
});

Deno.test("triage routes lexical duplicates, completed exact matches, and multiple exact matches to human review", async () => {
  for (
    const tasks of [
      [task({
        id: "lexical",
        name: "Fix allowedKeys declaration regression",
        description: "Identifier collision",
      })],
      [task({ id: "completed", completed: true, completed_at: NOW })],
      [task({ id: "open-1" }), task({ id: "open-2" })],
    ]
  ) {
    const fixture = fixtureContext(reconciliation([issue()]));
    await executeSentryDexTriage(
      {
        sourceReconciliation: "reconciliation-source",
        expectedFingerprint: FINGERPRINT,
      },
      fixture.context,
      { commandRunner: new FakeDexRunner(tasks), now: () => NOW },
    );
    const report = SentryDexTriageSchema.parse(fixture.writes[0].data);
    assert.equal(report.automationEligible, false);
    assert.equal(report.items[0].recommendation, "human-review");
  }
});

Deno.test("recent issues require reproduction and active Dex WIP blocks automation", async () => {
  const fixture = fixtureContext(reconciliation([
    issue({
      disposition: "recent",
      repairCandidate: false,
      requiresReproduction: true,
    }),
  ]));
  await executeSentryDexTriage(
    {
      sourceReconciliation: "reconciliation-source",
      expectedFingerprint: FINGERPRINT,
    },
    fixture.context,
    {
      commandRunner: new FakeDexRunner([
        task({ id: "active", name: "Other work", started_at: NOW }),
      ]),
      now: () => NOW,
    },
  );
  const report = SentryDexTriageSchema.parse(fixture.writes[0].data);
  assert.equal(report.automationEligible, false);
  assert.deepEqual(report.blockingReasons, [
    "active-wip",
    "reproduction-required",
  ]);
  assert.equal(report.items[0].recommendation, "reproduce-first");
});

Deno.test("triage fails closed on fingerprint drift and malformed Dex output", async () => {
  const source = reconciliation([issue()]);
  const badFingerprintFixture = fixtureContext(source);
  await assert.rejects(
    executeSentryDexTriage(
      {
        sourceReconciliation: "reconciliation-source",
        expectedFingerprint: "b".repeat(64),
      },
      badFingerprintFixture.context,
      { commandRunner: new FakeDexRunner([]), now: () => NOW },
    ),
    /fingerprint mismatch/,
  );
  assert.equal(badFingerprintFixture.writes.length, 0);

  const malformedFixture = fixtureContext(source);
  const malformedRunner: SentryDexCommandRunner = {
    run: () => Promise.resolve({ code: 0, stdout: "not-json", stderr: "" }),
  };
  await assert.rejects(
    executeSentryDexTriage(
      {
        sourceReconciliation: "reconciliation-source",
        expectedFingerprint: FINGERPRINT,
      },
      malformedFixture.context,
      { commandRunner: malformedRunner, now: () => NOW },
    ),
    /malformed or out-of-contract/,
  );
  assert.equal(malformedFixture.writes.length, 0);
});

Deno.test("exact matching does not confuse Sentry short-id prefixes", async () => {
  const fixture = fixtureContext(reconciliation([
    issue({ id: "1", shortId: "SUPERS-1" }),
  ]));
  await executeSentryDexTriage(
    {
      sourceReconciliation: "reconciliation-source",
      expectedFingerprint: FINGERPRINT,
    },
    fixture.context,
    {
      commandRunner: new FakeDexRunner([
        task({ name: "Fix SUPERS-17 duplicate declaration" }),
      ]),
      now: () => NOW,
    },
  );
  const report = SentryDexTriageSchema.parse(fixture.writes[0].data);
  assert.deepEqual(report.items[0].exactMatchTaskIds, []);
  assert.equal(report.items[0].recommendation, "create-task");
});

Deno.test("triage resource identity is stable across observation timestamps", async () => {
  const names: string[] = [];
  for (const now of [NOW, "2026-08-10T00:00:00.000Z"]) {
    const fixture = fixtureContext(reconciliation([issue()]));
    await executeSentryDexTriage(
      {
        sourceReconciliation: "reconciliation-source",
        expectedFingerprint: FINGERPRINT,
      },
      fixture.context,
      { commandRunner: new FakeDexRunner([]), now: () => now },
    );
    names.push(fixture.writes[0].name);
  }
  assert.equal(names[0], names[1]);
});
