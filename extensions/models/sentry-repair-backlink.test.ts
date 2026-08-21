import assert from "node:assert/strict";

import {
  executeSentryRepairBacklink,
  type SentryRepairBacklinkCommandRunner,
  SentryRepairBacklinkReceiptSchema,
} from "./sentry-repair-backlink.ts";

const HASH = "a".repeat(64);
const NOW = "2026-08-19T00:00:00.000Z";

function repairIntent() {
  const intent = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: HASH,
    sourceReconciliation: "reconciliation",
    sourceReconciliationFingerprint: "b".repeat(64),
    sourceTriage: "triage",
    sourceTriageFingerprint: "c".repeat(64),
    sentryTarget: "scott-tolinski-projects/supers",
    issueId: "7659756211",
    shortId: "SUPERS-17",
    title: "Current failure",
    priority: "high" as const,
    level: "error" as const,
    firstSeen: "2026-08-18T00:00:00.000Z",
    severityRank: 4,
    priorityRank: 3,
    observedAt: NOW,
    currentRelease: "supers@abc123",
    disposition: "current-release" as const,
    queueIntent: "confirmed-repair" as const,
    requiresReproduction: false as const,
    recommendation: "create-task" as const,
    existingDexTaskId: null,
    scope: ["Repair the current failure."],
    acceptanceCriteria: ["The affected flow succeeds."],
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: "scott-tolinski-projects/supers",
      issueId: "7659756211",
      shortId: "SUPERS-17",
    },
    planningWorkItem: "sentry-7659756211",
    supersedesIntentFingerprint: null,
    idempotencyKey: "d".repeat(64),
    fingerprint: "e".repeat(64),
  };
  return {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "f".repeat(64),
    planningWorkItem: intent.planningWorkItem,
    intent,
    fingerprint: "1".repeat(64),
  };
}

function approvedArgs() {
  return {
    repairIntent: repairIntent(),
    humanApproval: {
      gateId: "planning-approval" as const,
      workItem: "sentry-7659756211",
      decision: "approved" as const,
      actor: "human",
      stageId: "plan-review" as const,
      cycle: 1,
      decidedAt: NOW,
    },
    application: {
      schemaVersion: 1 as const,
      status: "succeeded" as const,
      planId: "sentry-plan",
      planHash: HASH,
      idempotencyKey: "2".repeat(64),
      attempt: 1,
      checkpointDataName: "checkpoint",
      receiptDataName: "receipt",
      resultDataName: "result",
      mappings: [{
        clientRef: "repair-task",
        dexTaskId: "dex-task-17",
        disposition: "created" as const,
      }],
      retryDisposition: "none" as const,
      errorCode: "",
      summary: "Applied one repair task.",
    },
    planningAudit: {
      schemaVersion: 1 as const,
      status: "passed" as const,
      planId: "sentry-plan",
      verifiedTaskIds: ["dex-task-17"],
      unresolvedIssues: [],
      summary: "Verified.",
    },
    planningHandoff: {
      schemaVersion: 1 as const,
      status: "ready" as const,
      planId: "sentry-plan",
      candidateTaskId: "dex-task-17",
      summary: "Ready.",
    },
  };
}

class FakeRunner implements SentryRepairBacklinkCommandRunner {
  calls: string[][] = [];
  constructor(private readonly existingComments: unknown = []) {}
  run(
    args: readonly string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push([...args]);
    return Promise.resolve({
      code: 0,
      stdout: args.includes("GET")
        ? JSON.stringify(this.existingComments)
        : JSON.stringify({ id: "comment-1" }),
      stderr: "",
    });
  }
}

async function runBacklink(
  runner: SentryRepairBacklinkCommandRunner,
  args = approvedArgs(),
) {
  const writes: Array<{ name: string; data: Record<string, unknown> }> = [];
  await executeSentryRepairBacklink(
    args,
    {
      repoDir: "/fixture/supers",
      logger: { info: () => undefined },
      writeResource: (_specName, name, data) => {
        writes.push({ name, data });
        return Promise.resolve({ name });
      },
    },
    { commandRunner: runner, now: () => NOW },
  );
  return SentryRepairBacklinkReceiptSchema.parse(writes[0].data);
}

Deno.test("approved Planning posts one Dex backlink to the exact Sentry issue", async () => {
  const runner = new FakeRunner();
  const receipt = await runBacklink(runner);
  assert.equal(receipt.status, "linked");
  assert.equal(receipt.dexTaskId, "dex-task-17");
  assert.equal(runner.calls.length, 2);
  assert.equal(
    runner.calls[0][1],
    "organizations/scott-tolinski-projects/issues/7659756211/comments/",
  );
  assert(runner.calls[1].join(" ").includes("dex-task-17"));
});

Deno.test("backlink replay detects its marker and does not post twice", async () => {
  const marker =
    `[supers-repair:${repairIntent().intent.fingerprint}:dex-task-17]`;
  const runner = new FakeRunner([{ text: `Already linked ${marker}` }]);
  const receipt = await runBacklink(runner);
  assert.equal(receipt.status, "already-linked");
  assert.equal(runner.calls.length, 1);
});

Deno.test("backlink rejects uncorrelated Planning evidence before Sentry access", async () => {
  const runner = new FakeRunner();
  const args = approvedArgs();
  args.planningAudit.verifiedTaskIds = ["different-task"];
  await assert.rejects(
    runBacklink(runner, args),
    /does not identify one audited/,
  );
  assert.equal(runner.calls.length, 0);
});
