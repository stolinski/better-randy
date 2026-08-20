import assert from "node:assert/strict";

import {
  canonicalSentryJson,
  createSentrySha256,
  SentryIssueSnapshotSchema,
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
const VERIFICATION_AT = "2026-08-19T01:00:00.000Z";
const DONE_AT = "2026-08-19T02:00:00.000Z";
const SNAPSHOT_AT = "2026-08-19T03:00:00.000Z";
const NOW = "2026-08-19T03:00:01.000Z";

async function repairIntent() {
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
    currentRelease: `supers@${"1".repeat(40)}`,
    disposition: "current-release" as const,
    requiresReproduction: false as const,
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
    idempotencyKey: "e".repeat(64),
  };
  const intent = {
    ...intentBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(intentBase)),
  };
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "2".repeat(64),
    planningWorkItem: intent.planningWorkItem,
    intent,
  };
  return {
    ...envelopeBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(envelopeBase)),
  };
}

async function fixtureResources() {
  const intent = await repairIntent();
  const backlinkBase = {
    schemaVersion: 1 as const,
    status: "linked" as const,
    issueId: ISSUE_ID,
    shortId: SHORT_ID,
    dexTaskId: DEX_TASK_ID,
    planningWorkItem: intent.planningWorkItem,
    repairIntentFingerprint: intent.intent.fingerprint,
    applicationPlanId: "sentry-plan",
    commentMarker: "[supers-repair:fixture]",
    linkedAt: "2026-08-18T23:00:00.000Z",
  };
  const backlink = {
    ...backlinkBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(backlinkBase)),
  };
  const snapshotBase = {
    source: "sentry-cli" as const,
    target: "scott-tolinski-projects/supers",
    capturedAt: SNAPSHOT_AT,
    lookbackDays: 7,
    historyDays: 90,
    limit: 100,
    currentRelease: `supers@${REVISION}`,
    complete: true,
    coverage: {
      historyHasMore: false,
      recentHasMore: false,
      releaseHasMore: false,
    },
    issues: [{
      id: ISSUE_ID,
      shortId: SHORT_ID,
      title: "Current failure",
      priority: "high" as const,
      level: "error" as const,
      firstSeen: "2026-08-18T00:00:00.000Z",
      status: "unresolved" as const,
    }],
    recentIssueIds: [ISSUE_ID],
    currentReleaseIssueIds: [] as string[],
  };
  const snapshotFingerprint = await createSentrySha256(JSON.stringify({
    target: snapshotBase.target,
    args: {
      lookbackDays: snapshotBase.lookbackDays,
      historyDays: snapshotBase.historyDays,
      limit: snapshotBase.limit,
      currentRelease: snapshotBase.currentRelease,
    },
    issues: snapshotBase.issues,
    recentIds: snapshotBase.recentIssueIds,
    releaseIds: snapshotBase.currentReleaseIssueIds,
    complete: snapshotBase.complete,
  }));
  const snapshot = { ...snapshotBase, fingerprint: snapshotFingerprint };
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
      policyReceipts: ["parity", "planning", "timing", "tracking"].map((
        specName,
      ) => ({
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
    recordedAt: VERIFICATION_AT,
  };
  const state = {
    workItem: DEX_TASK_ID,
    stageId: "done" as const,
    cycles: { verification: 1, done: 1 },
    dispatches: {},
    enteredAt: DONE_AT,
    status: "terminal" as const,
    definitionVersion: 1,
    startedAt: "2026-08-18T23:30:00.000Z",
  };
  return { intent, backlink, snapshot, verification, state };
}

class FakeRunner implements SentryRepairResolutionCommandRunner {
  calls: string[][] = [];
  private resolved = false;
  constructor(private readonly lastSeen = "2026-08-19T00:30:00.000Z") {}
  run(
    args: readonly string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    this.calls.push([...args]);
    if (args.includes("resolve")) {
      this.resolved = true;
      return Promise.resolve({ code: 0, stdout: "{}", stderr: "" });
    }
    if (args.includes("reopen")) {
      this.resolved = false;
      return Promise.resolve({ code: 0, stdout: "{}", stderr: "" });
    }
    return Promise.resolve({
      code: 0,
      stdout: JSON.stringify({
        id: ISSUE_ID,
        shortId: SHORT_ID,
        status: this.resolved ? "resolved" : "unresolved",
        lastSeen: this.lastSeen,
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
  mutate?: (resources: Awaited<ReturnType<typeof fixtureResources>>) => void,
) {
  const fixture = await fixtureResources();
  mutate?.(fixture);
  const intentName = "repair-intent";
  const backlinkName = "backlink-receipt";
  const snapshotName = "closure-snapshot";
  const store = new Map<string, Record<string, unknown>>([
    [
      resourceKey(
        "@supers/sentry-repair-planning-handoff",
        MODEL_ID,
        intentName,
      ),
      fixture.intent,
    ],
    [
      resourceKey(
        "@supers/sentry-repair-planning-handoff",
        MODEL_ID,
        backlinkName,
      ),
      fixture.backlink,
    ],
    [
      resourceKey("@supers/sentry-issue-intake", INTAKE_MODEL_ID, snapshotName),
      fixture.snapshot,
    ],
    [
      resourceKey(
        "@swamp/software-factory",
        DELIVERY_MODEL_ID,
        `state-${DEX_TASK_ID}`,
      ),
      fixture.state,
    ],
    [
      resourceKey(
        "@swamp/software-factory",
        DELIVERY_MODEL_ID,
        `artifact-${DEX_TASK_ID}-verification`,
      ),
      fixture.verification,
    ],
  ]);
  const writes: Array<
    { specName: string; name: string; data: Record<string, unknown> }
  > = [];
  const methodArgs = {
    repairIntentName: intentName,
    expectedRepairIntentFingerprint: fixture.intent.fingerprint,
    backlinkReceiptName: backlinkName,
    expectedBacklinkReceiptFingerprint: fixture.backlink.fingerprint,
    dexTaskId: DEX_TASK_ID,
    currentSnapshotName: snapshotName,
    expectedSnapshotFingerprint: fixture.snapshot.fingerprint,
  };
  const execute = () =>
    executeSentryRepairResolution(
      methodArgs,
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
            return Promise.resolve(
              data === undefined
                ? null
                : new TextEncoder().encode(JSON.stringify(data)),
            );
          },
        },
        logger: { info: () => undefined },
        writeResource: (specName, name, data) => {
          writes.push({ specName, name, data });
          store.set(
            resourceKey(
              "@supers/sentry-repair-planning-handoff",
              MODEL_ID,
              name,
            ),
            data,
          );
          return Promise.resolve({ name });
        },
      },
      { commandRunner: runner, now: () => NOW },
    );
  await execute();
  return { execute, methodArgs, store, writes };
}

Deno.test("verified terminal Delivery resolves the exact Sentry issue in the fix release", async () => {
  const runner = new FakeRunner();
  const { writes } = await runResolution(runner);
  const receipt = SentryRepairResolutionReceiptSchema.parse(
    writes.find((write) => write.specName === "resolution-receipt")?.data,
  );
  assert.equal(receipt.status, "resolved");
  assert.equal(receipt.resolvedInRelease, `supers@${REVISION}`);
  assert.deepEqual(
    runner.calls[1],
    ["issue", "resolve", SHORT_ID, "--in", `supers@${REVISION}`, "--json"],
  );
});

Deno.test("resolution replay returns the existing exact receipt without Sentry access", async () => {
  const runner = new FakeRunner();
  const { execute, writes } = await runResolution(runner);
  await execute();
  assert.equal(writes.length, 2);
  assert.equal(runner.calls.length, 3);
});

Deno.test("durable attempt recovers a missing post-mutation receipt", async () => {
  const runner = new FakeRunner();
  const { execute, methodArgs, store, writes } = await runResolution(runner);
  const receiptWrite = writes.find((write) =>
    write.specName === "resolution-receipt"
  );
  assert(receiptWrite);
  store.delete(resourceKey(
    "@supers/sentry-repair-planning-handoff",
    MODEL_ID,
    receiptWrite.name,
  ));
  const snapshotKey = resourceKey(
    "@supers/sentry-issue-intake",
    INTAKE_MODEL_ID,
    methodArgs.currentSnapshotName,
  );
  const priorSnapshot = SentryIssueSnapshotSchema.parse(store.get(snapshotKey));
  const freshSnapshotBase = {
    ...priorSnapshot,
    fingerprint: undefined,
    capturedAt: "2026-08-19T03:05:00.000Z",
    issues: [],
    recentIssueIds: [],
    currentReleaseIssueIds: [],
  };
  const freshFingerprint = await createSentrySha256(JSON.stringify({
    target: freshSnapshotBase.target,
    args: {
      lookbackDays: freshSnapshotBase.lookbackDays,
      historyDays: freshSnapshotBase.historyDays,
      limit: freshSnapshotBase.limit,
      currentRelease: freshSnapshotBase.currentRelease,
    },
    issues: freshSnapshotBase.issues,
    recentIds: freshSnapshotBase.recentIssueIds,
    releaseIds: freshSnapshotBase.currentReleaseIssueIds,
    complete: freshSnapshotBase.complete,
  }));
  store.set(snapshotKey, {
    ...freshSnapshotBase,
    fingerprint: freshFingerprint,
  });
  methodArgs.expectedSnapshotFingerprint = freshFingerprint;
  await execute();
  assert.equal(
    writes.filter((write) => write.specName === "resolution-attempt").length,
    1,
  );
  assert.equal(
    writes.filter((write) => write.specName === "resolution-receipt").length,
    2,
  );
  assert.equal(
    runner.calls.filter((call) => call.includes("resolve")).length,
    1,
  );
});

Deno.test("resolution rejects a Sentry event observed after Delivery verification", async () => {
  const runner = new FakeRunner("2026-08-19T01:00:01.000Z");
  await assert.rejects(
    runResolution(runner),
    /new event after verified Delivery/,
  );
});

Deno.test("resolution rejects current-release recurrence before Sentry access", async () => {
  const runner = new FakeRunner();
  await assert.rejects(
    runResolution(runner, (fixture) => {
      fixture.snapshot.currentReleaseIssueIds = [ISSUE_ID];
    }),
    /snapshot fingerprint verification failed/,
  );
  assert.equal(runner.calls.length, 0);
});

Deno.test("resolution rejects caller-tampered persisted evidence", async () => {
  const runner = new FakeRunner();
  await assert.rejects(
    runResolution(runner, (fixture) => {
      fixture.state.workItem = "different-task";
    }),
    /does not match the linked Dex task/,
  );
  assert.equal(runner.calls.length, 0);
});

Deno.test("resolution rejects an event racing the resolve mutation", async () => {
  class RacingRunner extends FakeRunner {
    private views = 0;
    override run(args: readonly string[]) {
      if (!args.includes("resolve")) this.views += 1;
      if (this.views === 2) {
        return Promise.resolve({
          code: 0,
          stdout: JSON.stringify({
            id: ISSUE_ID,
            shortId: SHORT_ID,
            status: "resolved",
            lastSeen: "2026-08-19T00:45:00.000Z",
          }),
          stderr: "",
        });
      }
      return super.run(args);
    }
  }
  const runner = new RacingRunner();
  await assert.rejects(
    runResolution(runner),
    /race-free issue resolution/,
  );
  assert(runner.calls.some((call) => call.includes("reopen")));
});
