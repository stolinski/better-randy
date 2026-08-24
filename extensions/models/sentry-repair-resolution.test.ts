import assert from "node:assert/strict";

import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  executeSentryRepairResolution,
  type SentryRepairResolutionCommandRunner,
  SentryRepairResolutionReceiptSchema,
} from "./sentry-repair-resolution.ts";

const SHA = "a".repeat(64);
const REVISION = "b".repeat(40);
const ISSUE_ID = "7659756211";
const SHORT_ID = "SUPERS-17";
const DEX_TASK_ID = "dex-task-17";
const MODEL_ID = "43609d3c-92b1-4509-9ed0-db25b48ee7c1";
const INTAKE_MODEL_ID = "97e8375f-5908-482d-846e-2a5b037ae9cf";
const DELIVERY_MODEL_ID = "90fac686-c724-4aee-97c4-e31b9af4c5e2";
const NOW = "2026-08-19T03:00:01.000Z";

async function contentAddress<T extends Record<string, unknown>>(base: T) {
  return {
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  };
}

async function fixtureResources() {
  const intentBase = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: SHA,
    sourceReconciliation: "reconciliation",
    sourceReconciliationFingerprint: "c".repeat(64),
    sourceTriage: "triage",
    sourceTriageFingerprint: "d".repeat(64),
    sentryTarget: "scott-tolinski-projects/supers",
    issueId: ISSUE_ID,
    shortId: SHORT_ID,
    title: "Current failure",
    priority: "high" as const,
    level: "error" as const,
    firstSeen: "2026-08-18T00:00:00.000Z",
    severityRank: 4,
    priorityRank: 3,
    observedAt: "2026-08-18T00:00:00.000Z",
    currentRelease: `supers@${"1".repeat(40)}`,
    disposition: "current-release" as const,
    queueIntent: "confirmed-repair" as const,
    requiresReproduction: false,
    recommendation: "create-task" as const,
    existingDexTaskId: null,
    scope: ["Repair the current failure."],
    acceptanceCriteria: ["The affected flow succeeds."],
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: "scott-tolinski-projects/supers",
      issueId: ISSUE_ID,
      shortId: SHORT_ID,
    },
    planningWorkItem: `sentry-${ISSUE_ID}`,
    supersedesIntentFingerprint: null,
    idempotencyKey: "e".repeat(64),
  };
  const intent = await contentAddress(intentBase);
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "2".repeat(64),
    planningWorkItem: intent.planningWorkItem,
    intent,
  };
  const envelope = await contentAddress(envelopeBase);
  const backlink = await contentAddress({
    schemaVersion: 1 as const,
    status: "linked" as const,
    issueId: ISSUE_ID,
    shortId: SHORT_ID,
    dexTaskId: DEX_TASK_ID,
    planningWorkItem: intent.planningWorkItem,
    repairIntentFingerprint: intent.fingerprint,
    applicationPlanId: "machine-evidence",
    commentMarker: "[supers-repair:fixture]",
    linkedAt: "2026-08-18T23:00:00.000Z",
  });
  const repairIdentityFingerprint = await createSentrySha256(
    canonicalSentryJson({
      authority: "sentry-issue-event-evidence-v1",
      issueId: ISSUE_ID,
      shortId: SHORT_ID,
      eventId: "f".repeat(32),
      eventOccurredAt: "2026-08-18T22:00:00.000Z",
    }),
  );
  const evidence = await contentAddress({
    schemaVersion: 1 as const,
    authority: "sentry-issue-event-evidence-v1" as const,
    advisorySeer: true as const,
    repairIntentName: "repair-intent",
    repairIntentFingerprint: envelope.fingerprint,
    repairIdentityFingerprint,
    queueSelectionName: "selection",
    queueSelectionFingerprint: "6".repeat(64),
    sourceSnapshotFingerprint: intent.sourceSnapshotFingerprint,
    sourceReconciliationFingerprint: intent.sourceReconciliationFingerprint,
    sourceTriageFingerprint: intent.sourceTriageFingerprint,
    issueId: ISSUE_ID,
    shortId: SHORT_ID,
    issueStatus: "unresolved" as const,
    eventId: "f".repeat(32),
    eventOccurredAt: "2026-08-18T22:00:00.000Z",
    lastSeen: "2026-08-18T22:00:00.000Z",
    eventRelease: `supers@${"1".repeat(40)}`,
    culprit: "GET /api/example",
    stackFrames: [],
    breadcrumbCategories: ["console"],
    seerRootCauses: [{ description: "Inspect the reported route", relevantRepos: [] }],
    seerPlanRunId: 1,
    seerPlanSummary: "Apply the smallest credible fix",
    seerPlanSteps: [{ title: "Inspect", description: "Check the reported code path" }],
    checkoutRevision: "1".repeat(40),
    capturedAt: "2026-08-18T22:01:00.000Z",
  });
  const verification = {
    name: "verification" as const,
    workItem: DEX_TASK_ID,
    stageId: "verification" as const,
    cycle: 1,
    payload: {
      schemaVersion: 2 as const,
      disposition: "reconcile" as const,
      workItem: DEX_TASK_ID,
      integratedRevision: REVISION,
      integratedTreeFingerprint: SHA,
      treeFingerprint: "c".repeat(64),
      changeImpactResourceName: "artifact-change-impact",
      deterministicFanoutResourceName: "verification-fanout",
      deterministicFanoutContentDigest: SHA,
      deterministicFanoutWorkflowRunId: "verification-run-17",
      policySweepResourceName: "policy-sweep-receipt",
      policySweepWorkflowId: "5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a" as const,
      policySweepWorkflowName: "policy-sweep" as const,
      policySweepWorkflowVersion: 2 as const,
      policySweepWorkflowRunId: "policy-run-17",
      policySweepExecutionDigest: SHA,
      policyReceipts: ["parity", "planning", "timing", "tracking"].map((specName) => ({
        modelName: "repo-audit",
        specName,
        resourceName: `${specName}-latest`,
        workflowRunId: "policy-run-17",
        contentDigest: SHA,
      })),
      corpusReceipt: {
        modelName: "corpus-verify",
        specName: "sweep",
        resourceName: "sweep-latest",
        workflowRunId: "policy-run-17",
        contentDigest: SHA,
      },
      renderMatrixRunName: "render-run-17",
      renderMatrixManifestName: "",
      renderMatrixBundleName: "",
      renderMatrixManifestDigest: "",
      renderMatrixBundleDigest: "",
      renderMatrixRunDigest: "d".repeat(64),
      renderEvidenceArchiveDigest: "",
      workflowRunId: "verification-run-17",
      requiredHumanReviewKinds: [],
      objectiveFailureCodes: [],
      unavailableEvidenceCodes: [],
      advisories: [],
    },
    recordedAt: "2026-08-19T01:00:00.000Z",
  };
  const state = {
    workItem: DEX_TASK_ID,
    stageId: "done" as const,
    cycles: { verification: 1, done: 1 },
    dispatches: {},
    enteredAt: "2026-08-19T02:00:00.000Z",
    status: "terminal" as const,
    definitionVersion: 1,
    startedAt: "2026-08-18T23:30:00.000Z",
  };
  const changeSummary = {
    name: "change-summary" as const,
    workItem: DEX_TASK_ID,
    stageId: "implementation",
    cycle: 1,
    payload: {
      summary: "Fixed observed error",
      commit: REVISION,
      integrationReceipt: {
        receiptId: "9".repeat(64),
        integratedRevision: REVISION,
      },
    },
    recordedAt: "2026-08-19T00:30:00.000Z",
  };
  return { intent: envelope, backlink, evidence, verification, state, changeSummary };
}

class FakeRunner implements SentryRepairResolutionCommandRunner {
  calls: string[][] = [];
  private resolved = false;
  run(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push([...args]);
    if (args.includes("resolve")) {
      this.resolved = true;
      return Promise.resolve({ code: 0, stdout: "{}", stderr: "" });
    }
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({
        id: ISSUE_ID,
        shortId: SHORT_ID,
        status: this.resolved ? "resolved" : "unresolved",
        lastSeen: "2026-08-19T00:30:00.000Z",
      }),
      stderr: "",
    });
  }
}

function resourceKey(type: string, modelId: string, name: string): string {
  return `${type}:${modelId}:${name}`;
}

async function runResolution(
  runner: SentryRepairResolutionCommandRunner,
  mutate?: (fixture: Awaited<ReturnType<typeof fixtureResources>>) => void,
) {
  const fixture = await fixtureResources();
  mutate?.(fixture);
  const store = new Map<string, Record<string, unknown>>([
    [resourceKey("@supers/sentry-repair-planning-handoff", MODEL_ID, "repair-intent"), fixture.intent],
    [resourceKey("@supers/sentry-repair-planning-handoff", MODEL_ID, "backlink-receipt"), fixture.backlink],
    [resourceKey("@supers/sentry-issue-intake", INTAKE_MODEL_ID, "repair-evidence"), fixture.evidence],
    [resourceKey("@swamp/software-factory", DELIVERY_MODEL_ID, `state-${DEX_TASK_ID}`), fixture.state],
    [resourceKey("@swamp/software-factory", DELIVERY_MODEL_ID, `artifact-${DEX_TASK_ID}-verification`), fixture.verification],
    [resourceKey("@swamp/software-factory", DELIVERY_MODEL_ID, `artifact-${DEX_TASK_ID}-change-summary`), fixture.changeSummary],
  ]);
  const writes: Array<{ specName: string; name: string; data: Record<string, unknown> }> = [];
  const args = {
    repairIntentName: "repair-intent",
    expectedRepairIntentFingerprint: fixture.intent.fingerprint,
    backlinkReceiptName: "backlink-receipt",
    expectedBacklinkReceiptFingerprint: fixture.backlink.fingerprint,
    evidenceName: "repair-evidence",
    expectedEvidenceFingerprint: fixture.evidence.fingerprint,
    dexTaskId: DEX_TASK_ID,
  };
  const execute = () => executeSentryRepairResolution(
    args,
    {
      modelId: MODEL_ID,
      repoDir: "/fixture/supers",
      globalArgs: {
        sourceIntakeModelId: INTAKE_MODEL_ID,
        sourceDeliveryModelId: DELIVERY_MODEL_ID,
      },
      dataRepository: {
        getContent: (type, modelId, name) => {
          const data = store.get(resourceKey(String(type), modelId, name));
          return Promise.resolve(data === undefined ? null : new TextEncoder().encode(JSON.stringify(data)));
        },
      },
      logger: { info: () => undefined },
      writeResource: (specName, name, data) => {
        writes.push({ specName, name, data });
        store.set(resourceKey("@supers/sentry-repair-planning-handoff", MODEL_ID, name), data);
        return Promise.resolve({ name });
      },
    },
    { commandRunner: runner, now: () => NOW },
  );
  await execute();
  return { execute, writes };
}

Deno.test("terminal repair with normal passing checks resolves the observed Sentry issue", async () => {
  const runner = new FakeRunner();
  const { writes } = await runResolution(runner);
  const receipt = SentryRepairResolutionReceiptSchema.parse(
    writes.find((write) => write.specName === "resolution-receipt")?.data,
  );
  assert.equal(receipt.status, "resolved");
  assert.equal(receipt.resolvedInRelease, `supers@${REVISION}`);
  assert.deepEqual(runner.calls[1], [
    "issue",
    "resolve",
    SHORT_ID,
    "--in",
    `supers@${REVISION}`,
    "--json",
  ]);
});

Deno.test("resolution does not require reproduction, replay, or a no-recurrence snapshot", async () => {
  const runner = new FakeRunner();
  const { writes } = await runResolution(runner);
  assert.deepEqual(writes.map((write) => write.specName), [
    "resolution-attempt",
    "resolution-receipt",
  ]);
});

Deno.test("resolution replay returns the exact receipt without another Sentry mutation", async () => {
  const runner = new FakeRunner();
  const { execute, writes } = await runResolution(runner);
  await execute();
  assert.equal(writes.length, 2);
  assert.equal(runner.calls.length, 3);
});

Deno.test("ordinary check failures block resolution", async () => {
  const runner = new FakeRunner();
  await assert.rejects(
    () => runResolution(runner, (fixture) => {
      (fixture.verification.payload.objectiveFailureCodes as string[]).push("unit-failed");
    }),
    /Passing routes cannot contain failure|ordinary passing Delivery checks/,
  );
  assert.equal(runner.calls.length, 0);
});

Deno.test("a later unresolved event can be handled by a new repair cycle", async () => {
  const runner = new FakeRunner();
  await runResolution(runner);
  assert.equal(runner.calls.some((args) => args.includes("reopen")), false);
});
