import assert from "node:assert/strict";
import test from "node:test";

import { canonicalSentryJson, createSentrySha256 } from "./sentry-issue-intake-adapter.ts";
import {
  executeReproduceSentryDefect,
  executeVerifySentryNoRecurrence,
  SentryDefectReproductionReceiptSchema,
  SentryDefectReproductionRejectionSchema,
  SentryNoRecurrenceReceiptSchema,
} from "./sentry-defect-reproduction.ts";

const REVISION = "a".repeat(40);

async function fixture() {
  const repairIdentityFingerprint = await createSentrySha256(canonicalSentryJson({
    authority: "sentry-issue-event-evidence-v1",
    issueId: "123",
    shortId: "SUPERS-1",
    eventId: "b".repeat(32),
    eventOccurredAt: "2026-08-22T00:00:00.000Z",
  }));
  const evidenceBase = {
    schemaVersion: 1 as const,
    authority: "sentry-issue-event-evidence-v1" as const,
    advisorySeer: true as const,
    repairIntentName: "intent",
    repairIntentFingerprint: "1".repeat(64),
    repairIdentityFingerprint,
    queueSelectionName: "selection",
    queueSelectionFingerprint: "2".repeat(64),
    sourceSnapshotFingerprint: "3".repeat(64),
    sourceReconciliationFingerprint: "4".repeat(64),
    sourceTriageFingerprint: "5".repeat(64),
    issueId: "123",
    shortId: "SUPERS-1",
    issueStatus: "unresolved" as const,
    eventId: "b".repeat(32),
    eventOccurredAt: "2026-08-22T00:00:00.000Z",
    lastSeen: "2026-08-22T00:00:00.000Z",
    eventRelease: "supers@old",
    culprit: "GET /p/example",
    stackFrames: [],
    breadcrumbCategories: [],
    seerRootCauses: [{ description: "cause", relevantRepos: [] }],
    seerPlanRunId: 1,
    seerPlanSummary: "fix",
    seerPlanSteps: [{ title: "fix", description: "fix" }],
    checkoutRevision: REVISION,
    capturedAt: "2026-08-22T00:01:00.000Z",
  };
  const evidence = {
    ...evidenceBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(evidenceBase)),
  };
  const resources = new Map<string, unknown>([["evidence", evidence]]);
  const writes: Array<{ specName: string; name: string; data: Record<string, unknown> }> = [];
  let driven = 0;
  let phase: "before" | "reproduced" | "fixed" = "before";
  const issueJson = () => JSON.stringify({
    id: "123",
    shortId: "SUPERS-1",
    status: "unresolved",
    lastSeen: phase === "before" ? evidence.lastSeen : "2026-08-22T00:02:00.000Z",
    event: {
      eventID: phase === "before" ? evidence.eventId : "c".repeat(32),
      release: phase === "before" ? "supers@old" : `supers@${REVISION}`,
    },
  });
  const context = {
    modelId: "intake",
    repoDir: "/repo",
    dataRepository: {
      getContent: async (_type: unknown, _modelId: string, name: string) => {
        const value = resources.get(name);
        return value === undefined ? null : new TextEncoder().encode(JSON.stringify(value));
      },
    },
    writeResource: async (specName: string, name: string, data: Record<string, unknown>) => {
      writes.push({ specName, name, data });
      resources.set(name, data);
      return { name };
    },
  };
  const dependencies = {
    commandRunner: { run: async () => ({ code: 0, stdout: issueJson(), stderr: "" }) },
    driveRoute: async (route: string) => {
      assert.equal(route, "/p/example");
      driven += 1;
      if (phase === "before") phase = "reproduced";
    },
    waitForObservation: async () => {},
    now: () => phase === "fixed" ? "2026-08-22T00:05:00.000Z" : "2026-08-22T00:03:00.000Z",
  };
  return { context, dependencies, evidence, resources, writes, driven: () => driven, setFixed: () => { phase = "fixed"; } };
}

test("code-owned reproduction records a new exact-HEAD event before coding and replays idempotently", async () => {
  const value = await fixture();
  const args = { evidenceName: "evidence", expectedEvidenceFingerprint: value.evidence.fingerprint };
  await executeReproduceSentryDefect(args, value.context, value.dependencies);
  const receiptWrite = value.writes.find((write) => write.specName === "defect-reproduction");
  const receipt = SentryDefectReproductionReceiptSchema.parse(receiptWrite?.data);
  assert.equal(receipt.reproducedInRelease, `supers@${REVISION}`);
  assert.equal(value.driven(), 1);
  await executeReproduceSentryDefect(args, value.context, value.dependencies);
  assert.equal(value.driven(), 1);
});

test("unsupported evidence is durably excluded without creating a repair", async () => {
  const value = await fixture();
  const base = Object.fromEntries(
    Object.entries(value.evidence).filter(([key]) => key !== "fingerprint"),
  );
  const unsupportedBase = { ...base, culprit: null };
  const unsupported = {
    ...unsupportedBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(unsupportedBase)),
  };
  value.resources.set("unsupported", unsupported);

  await executeReproduceSentryDefect(
    {
      evidenceName: "unsupported",
      expectedEvidenceFingerprint: unsupported.fingerprint,
    },
    value.context,
    value.dependencies,
  );

  const rejection = SentryDefectReproductionRejectionSchema.parse(
    value.writes.find((write) =>
      write.specName === "defect-reproduction-rejection"
    )?.data,
  );
  assert.equal(rejection.reason, "no-code-owned-route");
  assert.equal(rejection.repairIntentFingerprint, value.evidence.repairIntentFingerprint);
  assert.equal(value.driven(), 0);
});

test("fresh no-recurrence replay rejects watermark movement and stores one receipt when unchanged", async () => {
  const value = await fixture();
  await executeReproduceSentryDefect(
    { evidenceName: "evidence", expectedEvidenceFingerprint: value.evidence.fingerprint },
    value.context,
    value.dependencies,
  );
  const reproduction = SentryDefectReproductionReceiptSchema.parse(
    value.writes.find((write) => write.specName === "defect-reproduction")?.data,
  );
  value.setFixed();
  const result = await executeVerifySentryNoRecurrence({
    reproductionName: `sentry-defect-reproduction-${value.evidence.repairIdentityFingerprint}-${REVISION}`,
    expectedReproductionFingerprint: reproduction.fingerprint,
    integratedRevision: "d".repeat(40),
    verificationRecordedAt: "2026-08-22T00:04:00.000Z",
  }, value.context, value.dependencies);
  assert.equal(result.dataHandles.length, 1);
  SentryNoRecurrenceReceiptSchema.parse(
    value.writes.find((write) => write.specName === "no-recurrence")?.data,
  );
});
