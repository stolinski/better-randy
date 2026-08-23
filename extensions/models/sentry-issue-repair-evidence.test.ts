import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalSentryJson,
  createSentrySha256,
  type SentryCommandRunner,
} from "./sentry-issue-intake-adapter.ts";
import {
  executeCollectSentryIssueRepairEvidence,
  SentryIssueRepairEvidenceSchema,
} from "./sentry-issue-repair-evidence.ts";

const REPAIR_MODEL_ID = "43609d3c-92b1-4509-9ed0-db25b48ee7c1";
const REVISION = "a".repeat(40);
const EVENT_ID = "b".repeat(32);
const NOW = "2026-08-22T01:00:00.000Z";

async function fixture(status = "unresolved", snapshotCharacter = "1") {
  const intent = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: snapshotCharacter.repeat(64),
    sourceReconciliation: "reconciliation",
    sourceReconciliationFingerprint: "2".repeat(64),
    sourceTriage: "triage",
    sourceTriageFingerprint: "3".repeat(64),
    sentryTarget: "scott-tolinski-projects/supers",
    issueId: "123",
    shortId: "SUPERS-1",
    title: "Failure",
    priority: "high" as const,
    level: "error" as const,
    firstSeen: "2026-08-21T23:00:00.000Z",
    severityRank: 4,
    priorityRank: 3,
    observedAt: "2026-08-22T00:00:00.000Z",
    currentRelease: `supers@${REVISION}`,
    disposition: "recent" as const,
    queueIntent: "reproduction-required" as const,
    requiresReproduction: true,
    recommendation: "reproduce-first" as const,
    existingDexTaskId: null,
    scope: ["Repair the issue"],
    acceptanceCriteria: ["Regression test passes"],
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: "scott-tolinski-projects/supers",
      issueId: "123",
      shortId: "SUPERS-1",
    },
    planningWorkItem: "sentry-123",
    supersedesIntentFingerprint: null,
    idempotencyKey: "4".repeat(64),
    fingerprint: "5".repeat(64),
  };
  const intentBase = Object.fromEntries(
    Object.entries(intent).filter(([key]) => key !== "fingerprint"),
  );
  intent.fingerprint = await createSentrySha256(
    canonicalSentryJson(intentBase),
  );
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "6".repeat(64),
    planningWorkItem: "sentry-123",
    intent,
  };
  const envelope = {
    ...envelopeBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(envelopeBase)),
  };
  const selectionBase = {
    schemaVersion: 1 as const,
    status: "selected" as const,
    action: "start" as const,
    reason: "next-queued-intent" as const,
    selectedWorkItem: "sentry-123",
    selectedIntentFingerprint: envelope.fingerprint,
    queuedWorkItems: ["sentry-123"],
    activeWorkItems: [],
  };
  const selection = {
    ...selectionBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(selectionBase)),
  };
  const resources = new Map<string, unknown>([
    ["intent", envelope],
    ["selection", selection],
  ]);
  const calls: string[][] = [];
  const responses = [
    {
      id: "123",
      shortId: "SUPERS-1",
      status,
      lastSeen: "2026-08-22T00:30:00.000Z",
      culprit: "GET /p/example",
      event: {
        eventID: EVENT_ID,
        dateCreated: "2026-08-22T00:30:00.000Z",
        culprit: "GET /p/example",
        release: { version: `supers@${REVISION}` },
        entries: [{
          type: "exception",
          data: {
            values: [{
              stacktrace: {
                frames: [{
                  filename: "src/lib/example.ts",
                  function: "runExample",
                  lineNo: 12,
                  colNo: 4,
                  inApp: true,
                }],
              },
            }],
          },
        }, {
          type: "breadcrumbs",
          data: { values: [{ category: "console" }] },
        }],
      },
    },
    [{ description: "Root cause", relevant_repos: ["stolinski/olympus"] }],
    {
      run_id: 99,
      status: "COMPLETED",
      solution: {
        one_line_summary: "Fix the broken branch",
        steps: [{
          title: "Add regression test",
          description: "Cover the failing case",
        }],
      },
    },
  ];
  responses.push(structuredClone(responses[0]));
  const runner: SentryCommandRunner = {
    run: async (args) => {
      calls.push([...args]);
      return { code: 0, stdout: JSON.stringify(responses.shift()), stderr: "" };
    },
  };
  const writes: Array<{ specName: string; data: Record<string, unknown> }> = [];
  return {
    envelope,
    selection,
    runner,
    calls,
    writes,
    context: {
      repoDir: "/repo",
      globalArgs: { sourceRepairModelId: REPAIR_MODEL_ID },
      dataRepository: {
        getContent: async (_type: unknown, modelId: string, name: string) => {
          assert.equal(modelId, REPAIR_MODEL_ID);
          const value = resources.get(name);
          return value === undefined
            ? null
            : new TextEncoder().encode(JSON.stringify(value));
        },
      },
      writeResource: async (
        specName: string,
        name: string,
        data: Record<string, unknown>,
      ) => {
        writes.push({ specName, data });
        return { name };
      },
      logger: { info: () => {}, warning: () => {} },
    },
  };
}

test("collects exact issue/event evidence and advisory Seer context", async () => {
  const value = await fixture();
  await executeCollectSentryIssueRepairEvidence(
    {
      repairIntentName: "intent",
      expectedRepairIntentFingerprint: value.envelope.fingerprint,
      queueSelectionName: "selection",
      expectedQueueSelectionFingerprint: value.selection.fingerprint,
    },
    value.context,
    {
      commandRunner: value.runner,
      resolveCheckoutRevision: async () => REVISION,
      now: () => NOW,
    },
  );
  assert.deepEqual(value.calls.map((call) => call.slice(0, 2)), [
    ["issue", "view"],
    ["issue", "explain"],
    ["issue", "plan"],
    ["issue", "view"],
  ]);
  const evidence = SentryIssueRepairEvidenceSchema.parse(value.writes[0].data);
  assert.equal(evidence.eventId, EVENT_ID);
  assert.equal(evidence.advisorySeer, true);
  assert.equal(evidence.stackFrames[0].filename, "src/lib/example.ts");
  assert.equal(evidence.seerPlanSteps[0].title, "Add regression test");
});

test("recollection preserves stable repair identity across wall-clock time", async () => {
  const first = await fixture();
  const second = await fixture("unresolved", "7");
  const firstArgs = {
    repairIntentName: "intent",
    expectedRepairIntentFingerprint: first.envelope.fingerprint,
    queueSelectionName: "selection",
    expectedQueueSelectionFingerprint: first.selection.fingerprint,
  };
  const secondArgs = {
    repairIntentName: "intent",
    expectedRepairIntentFingerprint: second.envelope.fingerprint,
    queueSelectionName: "selection",
    expectedQueueSelectionFingerprint: second.selection.fingerprint,
  };
  await executeCollectSentryIssueRepairEvidence(firstArgs, first.context, {
    commandRunner: first.runner,
    resolveCheckoutRevision: async () => REVISION,
    now: () => NOW,
  });
  await executeCollectSentryIssueRepairEvidence(secondArgs, second.context, {
    commandRunner: second.runner,
    resolveCheckoutRevision: async () => REVISION,
    now: () => "2026-08-22T02:00:00.000Z",
  });
  const firstEvidence = SentryIssueRepairEvidenceSchema.parse(
    first.writes[0].data,
  );
  const secondEvidence = SentryIssueRepairEvidenceSchema.parse(
    second.writes[0].data,
  );
  assert.equal(
    firstEvidence.repairIdentityFingerprint,
    secondEvidence.repairIdentityFingerprint,
  );
  assert.notEqual(firstEvidence.fingerprint, secondEvidence.fingerprint);
});

test("refuses resolved issues before any repair admission", async () => {
  const value = await fixture("resolved");
  await assert.rejects(() =>
    executeCollectSentryIssueRepairEvidence(
      {
        repairIntentName: "intent",
        expectedRepairIntentFingerprint: value.envelope.fingerprint,
        queueSelectionName: "selection",
        expectedQueueSelectionFingerprint: value.selection.fingerprint,
      },
      value.context,
      {
        commandRunner: value.runner,
        resolveCheckoutRevision: async () => REVISION,
        now: () => NOW,
      },
    ), /identity or event watermark drifted/);
  assert.equal(value.writes.length, 0);
});

test("refuses a forged queue selection fingerprint", async () => {
  const value = await fixture();
  await assert.rejects(() =>
    executeCollectSentryIssueRepairEvidence(
      {
        repairIntentName: "intent",
        expectedRepairIntentFingerprint: value.envelope.fingerprint,
        queueSelectionName: "selection",
        expectedQueueSelectionFingerprint: "f".repeat(64),
      },
      value.context,
      {
        commandRunner: value.runner,
        resolveCheckoutRevision: async () => REVISION,
        now: () => NOW,
      },
    ), /source authority mismatch/);
  assert.equal(value.calls.length, 0);
});
