import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  DEFAULT_SENTRY_EVIDENCE_MAPPING_DEPENDENCIES,
  executeMapEvidencedSentryRepair,
  SentryEvidenceTaskMappingSchema,
} from "./sentry-evidence-dex-mapping.ts";

const INTAKE_ID = "97e8375f-5908-482d-846e-2a5b037ae9cf";
const REPAIR_ID = "43609d3c-92b1-4509-9ed0-db25b48ee7c1";
const DELIVERY_ID = "90fac686-c724-4aee-97c4-e31b9af4c5e2";
const REVISION = "a".repeat(40);

async function buildFixture() {
  const intentBase = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: "1".repeat(64),
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
    scope: ["Repair"],
    acceptanceCriteria: ["Regression test"],
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
  };
  const intent = {
    ...intentBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(intentBase)),
  };
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "5".repeat(64),
    planningWorkItem: "sentry-123",
    intent,
  };
  const envelope = {
    ...envelopeBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(envelopeBase)),
  };
  const repairIdentityFingerprint = await createSentrySha256(
    canonicalSentryJson({
      authority: "sentry-issue-event-evidence-v1",
      issueId: "123",
      shortId: "SUPERS-1",
      eventId: "b".repeat(32),
      eventOccurredAt: "2026-08-22T00:30:00.000Z",
    }),
  );
  const evidenceBase = {
    schemaVersion: 1 as const,
    authority: "sentry-issue-event-evidence-v1" as const,
    advisorySeer: true as const,
    repairIntentName: "intent",
    repairIntentFingerprint: envelope.fingerprint,
    repairIdentityFingerprint,
    queueSelectionName: "selection",
    queueSelectionFingerprint: "6".repeat(64),
    sourceSnapshotFingerprint: intent.sourceSnapshotFingerprint,
    sourceReconciliationFingerprint: intent.sourceReconciliationFingerprint,
    sourceTriageFingerprint: intent.sourceTriageFingerprint,
    issueId: "123",
    shortId: "SUPERS-1",
    issueStatus: "unresolved" as const,
    eventId: "b".repeat(32),
    eventOccurredAt: "2026-08-22T00:30:00.000Z",
    lastSeen: "2026-08-22T00:30:00.000Z",
    eventRelease: `supers@${REVISION}`,
    culprit: "GET /p/example",
    stackFrames: [{
      filename: "src/lib/example.ts",
      function: "run",
      lineNo: 1,
      colNo: 1,
      inApp: true,
    }],
    breadcrumbCategories: ["console"],
    seerRootCauses: [{ description: "Cause", relevantRepos: ["repo"] }],
    seerPlanRunId: 1,
    seerPlanSummary: "Fix it",
    seerPlanSteps: [{ title: "Test", description: "Add regression coverage" }],
    checkoutRevision: REVISION,
    capturedAt: "2026-08-22T01:00:00.000Z",
  };
  const evidence = {
    ...evidenceBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(evidenceBase)),
  };
  const resources = new Map<string, unknown>([["evidence", evidence], [
    "intent",
    envelope,
  ]]);
  const local = new Map<string, Record<string, unknown>>();
  const writes: Array<{ specName: string; data: Record<string, unknown> }> = [];
  const tasks: Array<Record<string, unknown>> = [];
  const runDex = async (args: readonly string[]) => {
    if (args[0] === "list") return { code: 0, stdout: JSON.stringify(tasks) };
    if (args[0] === "create") {
      tasks.push({
        id: "dex-1",
        name: args[1],
        description: args[3],
        completed: false,
        started_at: null,
      });
      return { code: 0, stdout: "" };
    }
    if (args[0] === "start") {
      const task = tasks.find((candidate) => candidate.id === args[1]);
      if (task === undefined) return { code: 1, stdout: "" };
      task.started_at = "2026-08-22T01:01:00.000Z";
      return { code: 0, stdout: "" };
    }
    return { code: 1, stdout: "" };
  };
  const context = {
    repoDir: "/repo",
    globalArgs: {
      sourceIntakeModelId: INTAKE_ID,
      sourceRepairModelId: REPAIR_ID,
      sourceDeliveryModelId: DELIVERY_ID,
    },
    dataRepository: {
      getContent: async (_type: unknown, _modelId: string, name: string) => {
        const value = resources.get(name);
        return value === undefined
          ? null
          : new TextEncoder().encode(JSON.stringify(value));
      },
    },
    readResource: async (name: string) => local.get(name) ?? null,
    writeResource: async (
      specName: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
      writes.push({ specName, data });
      local.set(name, data);
      return { name };
    },
    logger: { info: () => {}, warning: () => {} },
  };
  const dependencies = {
    dexRepositoryLock: {
      runExclusive: async <T>(_repo: string, operation: () => Promise<T>) =>
        await operation(),
    },
    runDex: (args: readonly string[]) => runDex(args),
  };
  return { context, dependencies, evidence, writes, tasks };
}

test("production Sentry admission delegates persistence to Dex without touching Git", () => {
  assert.equal(DEFAULT_SENTRY_EVIDENCE_MAPPING_DEPENDENCIES.commitDexMutation, undefined);
});

test("observed-event mapping creates, starts, and admits one Dex repair without reproduction", async () => {
  const value = await buildFixture();
  await executeMapEvidencedSentryRepair(
    {
      evidenceName: "evidence",
      expectedEvidenceFingerprint: value.evidence.fingerprint,
    },
    value.context,
    value.dependencies,
  );
  assert.equal(value.tasks.length, 1);
  assert.notEqual(value.tasks[0].started_at, null);
  assert.deepEqual(value.writes.map((write) => write.specName), [
    "creation-intent",
    "task-mapping",
    "delivery-admission",
  ]);
  assert.match(String(value.tasks[0].description), /Breadcrumb categories/);
  assert.doesNotMatch(String(value.tasks[0].description), /reproduc|failing-before/i);
  assert.match(String(value.tasks[0].description), /smallest credible fix/);
});

test("unrelated Dex status does not impersonate Factory capacity", async () => {
  const value = await buildFixture();
  value.tasks.push({
    id: "unrelated-task",
    name: "Unrelated work",
    description: "No Sentry marker",
    completed: false,
    started_at: "2026-08-21T01:00:00.000Z",
  });

  await executeMapEvidencedSentryRepair(
    {
      evidenceName: "evidence",
      expectedEvidenceFingerprint: value.evidence.fingerprint,
    },
    value.context,
    value.dependencies,
  );

  assert.equal(value.tasks.length, 2);
  assert.notEqual(
    value.tasks.find((task) => task.id === "dex-1")?.started_at,
    null,
  );
});

test("evidence mapping replay preserves one mapping identity", async () => {
  const value = await buildFixture();
  const args = {
    evidenceName: "evidence",
    expectedEvidenceFingerprint: value.evidence.fingerprint,
  };
  await executeMapEvidencedSentryRepair(
    args,
    value.context,
    value.dependencies,
  );
  const first = SentryEvidenceTaskMappingSchema.parse(
    value.writes.find((write) => write.specName === "task-mapping")?.data,
  );
  value.writes.length = 0;
  await executeMapEvidencedSentryRepair(
    args,
    value.context,
    value.dependencies,
  );
  const second = SentryEvidenceTaskMappingSchema.parse(
    value.writes.find((write) => write.specName === "task-mapping")?.data,
  );
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(value.tasks.length, 1);
});
