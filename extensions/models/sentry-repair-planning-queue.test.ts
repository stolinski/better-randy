import assert from "node:assert/strict";

import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryRepairIntentEnvelopeSchema,
  SentryRepairIntentSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  selectSentryRepairPlanningQueue,
  SentryRepairPlanningQueueSelectionSchema,
} from "./sentry-repair-planning-queue.ts";

const HASH = "a".repeat(64);

async function envelope(overrides: {
  issueId: string;
  shortId: string;
  severityRank: number;
  priorityRank: number;
  firstSeen: string;
  queueIntent?: "confirmed-repair" | "reproduction-required";
  supersedesIntentFingerprint?: string | null;
}) {
  const planningWorkItem = `sentry-${overrides.issueId}`;
  const queueIntent = overrides.queueIntent ?? "confirmed-repair";
  const intentBase = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: HASH,
    sourceReconciliation: "reconciliation",
    sourceReconciliationFingerprint: "b".repeat(64),
    sourceTriage: "triage",
    sourceTriageFingerprint: "c".repeat(64),
    sentryTarget: "scott-tolinski-projects/supers",
    issueId: overrides.issueId,
    shortId: overrides.shortId,
    title: `Failure ${overrides.shortId}`,
    priority: "high" as const,
    level: "error" as const,
    firstSeen: overrides.firstSeen,
    severityRank: overrides.severityRank,
    priorityRank: overrides.priorityRank,
    observedAt: "2026-08-20T00:00:00.000Z",
    currentRelease: "supers@abc123",
    disposition: queueIntent === "confirmed-repair"
      ? "current-release" as const
      : "recent" as const,
    queueIntent,
    requiresReproduction: queueIntent === "reproduction-required",
    recommendation: queueIntent === "confirmed-repair"
      ? "create-task" as const
      : "reproduce-first" as const,
    existingDexTaskId: null,
    scope: ["Repair the affected flow."],
    acceptanceCriteria: ["The issue no longer reproduces."],
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: "scott-tolinski-projects/supers",
      issueId: overrides.issueId,
      shortId: overrides.shortId,
    },
    planningWorkItem,
    supersedesIntentFingerprint: overrides.supersedesIntentFingerprint ?? null,
    idempotencyKey: "d".repeat(64),
  };
  const intent = SentryRepairIntentSchema.parse({
    ...intentBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(intentBase)),
  });
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "e".repeat(64),
    planningWorkItem,
    intent,
  };
  return SentryRepairIntentEnvelopeSchema.parse({
    ...envelopeBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(envelopeBase)),
  });
}

async function select(args: {
  repairIntents: Awaited<ReturnType<typeof envelope>>[];
  planningStates?: Array<{
    workItem: string;
    status: "active" | "terminal";
    stageId: string;
  }>;
  priorSelections?: Array<{
    status: "selected" | "active" | "no-candidate" | "human-gate";
    selectedWorkItem: string | null;
    selectedIntentFingerprint: string | null;
  }>;
  admittedIntentFingerprints?: string[];
  excludedIssueIds?: string[];
}) {
  const writes: Array<Record<string, unknown>> = [];
  await selectSentryRepairPlanningQueue(
    {
      repairIntents: args.repairIntents,
      planningStates: args.planningStates ?? [],
      priorSelections: args.priorSelections ?? [],
      admittedIntentFingerprints: args.admittedIntentFingerprints ?? [],
      excludedIssueIds: args.excludedIssueIds ?? [],
    },
    {
      logger: { info: () => undefined, warning: () => undefined },
      writeResource: (_specName, _name, data) => {
        writes.push(data);
        return Promise.resolve({
          name: "sentry-repair-planning-queue-selection",
        });
      },
    },
  );
  return SentryRepairPlanningQueueSelectionSchema.parse(writes[0]);
}

Deno.test("repair queue orders by severity, priority, firstSeen, then issue id", async () => {
  const intents = [
    await envelope({
      issueId: "3",
      shortId: "SUPERS-3",
      severityRank: 4,
      priorityRank: 3,
      firstSeen: "2026-08-02T00:00:00.000Z",
    }),
    await envelope({
      issueId: "2",
      shortId: "SUPERS-2",
      severityRank: 5,
      priorityRank: 1,
      firstSeen: "2026-08-03T00:00:00.000Z",
    }),
    await envelope({
      issueId: "1",
      shortId: "SUPERS-1",
      severityRank: 4,
      priorityRank: 3,
      firstSeen: "2026-08-01T00:00:00.000Z",
    }),
  ];
  const result = await select({ repairIntents: intents });
  assert.equal(result.selectedWorkItem, "sentry-2");
  assert.deepEqual(result.queuedWorkItems, [
    "sentry-2",
    "sentry-1",
    "sentry-3",
  ]);
});

Deno.test("repair queue resumes one active item and keeps later work queued", async () => {
  const first = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
  });
  const second = await envelope({
    issueId: "2",
    shortId: "SUPERS-2",
    severityRank: 4,
    priorityRank: 3,
    firstSeen: "2026-08-02T00:00:00.000Z",
  });
  const active = await select({
    repairIntents: [first, second],
    planningStates: [{
      workItem: "sentry-1",
      status: "active",
      stageId: "inventory",
    }],
  });
  assert.equal(active.status, "active");
  assert.equal(active.action, "status");
  assert.equal(active.selectedWorkItem, "sentry-1");

  const afterTerminal = await select({
    repairIntents: [first, second],
    planningStates: [{
      workItem: "sentry-1",
      status: "terminal",
      stageId: "done",
    }],
  });
  assert.equal(afterTerminal.action, "start");
  assert.equal(afterTerminal.selectedWorkItem, "sentry-2");
});

Deno.test("repair queue replay keeps the same selected work item before Factory start", async () => {
  const intent = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
  });
  const initial = await select({ repairIntents: [intent] });
  const replay = await select({
    repairIntents: [intent],
    priorSelections: [{
      status: initial.status,
      selectedWorkItem: initial.selectedWorkItem,
      selectedIntentFingerprint: initial.selectedIntentFingerprint,
    }],
  });
  assert.equal(replay.action, "start");
  assert.equal(replay.selectedWorkItem, initial.selectedWorkItem);
});

Deno.test("repair queue selects a supersession head and rejects conflicting branches", async () => {
  const intent = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
  });
  const newer = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
    supersedesIntentFingerprint: intent.fingerprint,
  });
  const superseded = await select({ repairIntents: [intent, newer] });
  assert.equal(superseded.status, "selected");
  assert.equal(superseded.selectedIntentFingerprint, newer.fingerprint);

  const branch = structuredClone(newer);
  branch.sourceHandoff = "branch-handoff";
  const branchBase = {
    schemaVersion: branch.schemaVersion,
    sourceHandoff: branch.sourceHandoff,
    sourceHandoffFingerprint: branch.sourceHandoffFingerprint,
    planningWorkItem: branch.planningWorkItem,
    intent: branch.intent,
  };
  branch.fingerprint = await createSentrySha256(
    canonicalSentryJson(branchBase),
  );
  const ambiguous = await select({ repairIntents: [intent, newer, branch] });
  assert.equal(ambiguous.status, "human-gate");
  assert.equal(ambiguous.reason, "conflicting-intent-supersession");

  const multipleActive = await select({
    repairIntents: [intent],
    planningStates: [
      { workItem: "sentry-1", status: "active", stageId: "inventory" },
      { workItem: "sentry-2", status: "active", stageId: "inventory" },
    ],
  });
  assert.equal(multipleActive.status, "human-gate");
  assert.equal(multipleActive.reason, "multiple-active-repairs");
});

Deno.test("reproduction intent is selected without starting Planning", async () => {
  const intent = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
    queueIntent: "reproduction-required",
  });
  const result = await select({ repairIntents: [intent] });
  assert.equal(result.status, "selected");
  assert.equal(result.action, "start");
  assert.equal(result.reason, "next-queued-intent");
});

Deno.test("admitted head is skipped without removing its supersession ancestor", async () => {
  const ancestor = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
  });
  const successor = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
    supersedesIntentFingerprint: ancestor.fingerprint,
  });
  const result = await select({
    repairIntents: [ancestor, successor],
    admittedIntentFingerprints: [successor.fingerprint],
  });
  assert.equal(result.status, "no-candidate");
  assert.notEqual(result.reason, "conflicting-intent-supersession");
});

Deno.test("excluded issue identity skips every volatile intent version", async () => {
  const intent = await envelope({
    issueId: "1",
    shortId: "SUPERS-1",
    severityRank: 5,
    priorityRank: 3,
    firstSeen: "2026-08-01T00:00:00.000Z",
  });
  const result = await select({
    repairIntents: [intent],
    excludedIssueIds: ["1"],
  });
  assert.equal(result.status, "no-candidate");
});

Deno.test("empty repair queue is a typed no-candidate outcome", async () => {
  const result = await select({ repairIntents: [] });
  assert.equal(result.status, "no-candidate");
  assert.equal(result.action, "none");
  assert.equal(result.selectedWorkItem, null);
});
