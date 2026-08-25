import assert from "node:assert/strict";

import {
  executeSupersRenderMatrixVerification,
  SupersRenderMatrixRunSchema,
  SupersRenderMatrixVerificationArgumentsSchema,
} from "./supers-render-matrix-verification.ts";

const SHA = "a".repeat(64);
const REVISION = "b".repeat(40);

Deno.test("verification arguments are a strict affected/full discriminated union", () => {
  assert.equal(
    SupersRenderMatrixVerificationArgumentsSchema.parse({
      schemaVersion: 1,
      scope: "affected",
      workItem: "imjlwx0s",
      expectedTreeFingerprint: SHA,
      renderRequired: true,
      changedPaths: ["src/lib/platform/Workspace.svelte"],
    }).scope,
    "affected",
  );
  assert.throws(() =>
    SupersRenderMatrixVerificationArgumentsSchema.parse({
      schemaVersion: 1,
      scope: "affected",
      workItem: "imjlwx0s",
      expectedTreeFingerprint: SHA,
      renderRequired: true,
      changedPaths: ["same", "same"],
    })
  );
  assert.throws(() =>
    SupersRenderMatrixVerificationArgumentsSchema.parse({
      schemaVersion: 1,
      scope: "full",
      workItem: "imjlwx0s",
      expectedTreeFingerprint: SHA,
      changedPaths: ["src/lib/presets/lower-third.json"],
    })
  );
});

Deno.test("not-applicable is affected-only and cannot carry routing advisories", () => {
  const run = SupersRenderMatrixRunSchema.parse({
    schemaVersion: 1,
    status: "not-applicable",
    scope: "affected",
    workItem: "imjlwx0s",
    sourceRevision: REVISION,
    expectedTreeFingerprint: SHA,
    changedPathsDigest: SHA,
    reason: "no-deliverable-render-impact",
    advisories: [],
  });
  assert.equal(run.status, "not-applicable");
  assert.throws(() =>
    SupersRenderMatrixRunSchema.parse({ ...run, scope: "full" })
  );
  assert.throws(() =>
    SupersRenderMatrixRunSchema.parse({
      ...run,
      advisories: [{ blocking: true }],
    })
  );
});

Deno.test("not-applicable execution does not require a full-repository fingerprint", async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const result = await executeSupersRenderMatrixVerification(
    {
      schemaVersion: 1,
      scope: "affected",
      workItem: "wnwicydv",
      expectedTreeFingerprint: SHA,
      expectedSourceRevision: REVISION,
      changedPaths: ["vite.config.ts"],
      renderRequired: false,
    },
    {
      repoDir: await Deno.realPath("."),
      logger: { info: () => undefined },
      writeResource: (_specName, name, data) => {
        recorded.push(data);
        return Promise.resolve({ name });
      },
      createFileWriter: () => {
        throw new Error(
          "not-applicable verification cannot create evidence files",
        );
      },
    },
  );

  assert.equal(result.dataHandles.length, 1);
  assert.equal(recorded[0]?.status, "not-applicable");
  assert.equal(recorded[0]?.sourceRevision, REVISION);
  assert.equal(recorded[0]?.expectedTreeFingerprint, SHA);
});

Deno.test("completed run proves bounded internal fanout and exact freshness receipts", () => {
  const run = SupersRenderMatrixRunSchema.parse({
    schemaVersion: 1,
    status: "completed",
    scope: "full",
    workItem: "imjlwx0s",
    sourceRevision: REVISION,
    expectedTreeFingerprint: SHA,
    registrySnapshotName: "snapshot",
    registrySnapshotDigest: SHA,
    manifestName: "manifest",
    manifestDigest: SHA,
    bundleName: "bundle",
    bundleDigest: SHA,
    evidenceArchiveName: "evidence",
    evidenceArchiveDigest: SHA,
    startedAt: "2026-08-15T00:00:00.000Z",
    completedAt: "2026-08-15T00:01:00.000Z",
    executionMode: "bounded-internal-fanout",
    freshness: {
      localBefore: SHA,
      servedBefore: SHA,
      servedAfter: SHA,
      localAfter: SHA,
    },
    counts: {
      presets: 1,
      packs: 1,
      orientations: 2,
      samples: 5,
      cells: 10,
      passed: 9,
      failed: 0,
      unavailable: 1,
    },
    outcome: "unavailable",
    advisories: [],
  });
  assert.equal(run.status, "completed");
  if (run.status !== "completed") throw new Error("Expected a completed run");
  assert.equal(run.executionMode, "bounded-internal-fanout");
});
