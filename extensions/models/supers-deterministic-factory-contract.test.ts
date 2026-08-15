import assert from "node:assert/strict";

import {
  createSupersDeterministicContractHash,
  createSupersIntegratedTreeFingerprint,
  SUPERS_DETERMINISTIC_RULE_INVENTORY,
  SupersAdvisoryVisualObservationSchema,
  SupersDeterministicRenderCheckSchema,
  type SupersDeterministicRenderFailureCode,
  SupersDeterministicRenderFailureCodeSchema,
  SupersFactoryEpicLaneLeaseSchema,
  SupersFactoryIntegrationReceiptSchema,
  SupersHumanAestheticDecisionSchema,
  SupersRenderMatrixCoordinateSchema,
  verifySupersFactoryIntegrationReceipt,
  verifySupersHumanAestheticDecision,
  verifySupersRenderMatrixBundle,
} from "./supers-deterministic-factory-contract.ts";

const SHA = "a".repeat(64);
const SECOND_SHA = "b".repeat(64);
const GIT_REVISION = "c".repeat(40);

function evidence(): Record<string, unknown> {
  return {
    kind: "dom",
    path: ".tmp-verification/lower-third.json",
    sha256: SHA,
    region: null,
  };
}

async function coordinate(
  orientation: "horizontal" | "vertical",
): Promise<Record<string, unknown>> {
  const content = {
    schemaVersion: 1,
    sourceRevision: GIT_REVISION,
    engineFingerprint: SHA,
    presetSlug: "lower-third",
    presetFingerprint: SHA,
    packId: "syntax",
    packFingerprint: SECOND_SHA,
    orientation,
    width: orientation === "horizontal" ? 3840 : 2160,
    height: orientation === "horizontal" ? 2160 : 3840,
    sample: {
      kind: "checkpoint",
      sampleId: "settled",
      frameIndex: 30,
      timestampMicroseconds: 1_000_000,
    },
  };
  return {
    ...content,
    cellId: await createSupersDeterministicContractHash(content),
  };
}

function evaluatedCheck(
  code: SupersDeterministicRenderFailureCode,
  width = 3840,
  height = 2160,
): Record<string, unknown> {
  if (
    code !== "target-resolution-mismatch" && code !== "title-safe-violation"
  ) {
    return {
      checkId: code,
      code,
      outcome: "unavailable",
      unavailableReason: "measurement-not-implemented",
      evidence: [evidence()],
    };
  }
  const base = {
    checkId: code,
    code,
    outcome: "pass",
    evidence: [evidence()],
  };
  return code === "target-resolution-mismatch"
    ? { ...base, measurement: { actualWidth: width, actualHeight: height } }
    : { ...base, measurement: { affectedPixelCount: 0 } };
}

function allChecks(width: number, height: number): Record<string, unknown>[] {
  return SupersDeterministicRenderFailureCodeSchema.options.map((code) =>
    evaluatedCheck(code, width, height)
  );
}

async function verifiedFixture(): Promise<{
  manifest: Record<string, unknown>;
  bundle: Record<string, unknown>;
}> {
  const coordinates = [
    await coordinate("horizontal"),
    await coordinate("vertical"),
  ];
  const manifestContent = {
    schemaVersion: 1,
    sourceRevision: GIT_REVISION,
    engineFingerprint: SHA,
    scope: "full",
    presets: [{
      slug: "lower-third",
      fingerprint: SHA,
      samples: [{
        kind: "checkpoint",
        sampleId: "settled",
        frameIndex: 30,
        timestampMicroseconds: 1_000_000,
      }],
    }],
    packs: [{ id: "syntax", fingerprint: SECOND_SHA }],
    orientations: ["horizontal", "vertical"],
    requiredCheckCodes: SupersDeterministicRenderFailureCodeSchema.options,
    coordinates,
  };
  const manifestDigest = await createSupersDeterministicContractHash(
    manifestContent,
  );
  const cells = coordinates.map((entry) => {
    const dimensions = entry as { width: number; height: number };
    return {
      schemaVersion: 1,
      coordinate: entry,
      outcome: "unavailable",
      checks: allChecks(dimensions.width, dimensions.height),
    };
  });
  const bundleContent = {
    schemaVersion: 1,
    manifestDigest,
    sourceRevision: GIT_REVISION,
    cells,
    outcome: "unavailable",
  };
  return {
    manifest: { ...manifestContent, manifestDigest },
    bundle: {
      ...bundleContent,
      bundleDigest: await createSupersDeterministicContractHash(bundleContent),
    },
  };
}

Deno.test("epic lane contracts close integration states and released dispositions", () => {
  const lease = {
    schemaVersion: 1,
    leaseId: SHA,
    rootEpicId: "factory-redesign",
    activeTaskId: "typed-contracts",
    factoryName: "supers-delivery",
    worktreePath: "/tmp/supers-factory-redesign",
    baseRevision: GIT_REVISION,
    sourceRevision: GIT_REVISION,
    treeFingerprint: SHA,
    state: "leased",
    integration: null,
  };
  assert.equal(SupersFactoryEpicLaneLeaseSchema.parse(lease).state, "leased");
  assert.throws(() =>
    SupersFactoryEpicLaneLeaseSchema.parse({
      ...lease,
      recommendation: "merge-it",
    })
  );
  assert.throws(() =>
    SupersFactoryEpicLaneLeaseSchema.parse({
      ...lease,
      state: "released",
      integration: { disposition: "integrated", integratedRevision: null },
    })
  );
  assert.throws(() =>
    SupersFactoryEpicLaneLeaseSchema.parse({
      ...lease,
      state: "released",
      integration: {
        disposition: "abandoned",
        integratedRevision: GIT_REVISION,
      },
    })
  );
});

Deno.test("Pi integration receipts bind exact handoff and target identities", async () => {
  const content = {
    schemaVersion: 1 as const,
    rootEpicId: "factory-redesign",
    activeTaskId: "typed-contracts",
    factoryName: "supers-delivery",
    handoffManifestDigest: SHA,
    targetBaselineRevision: GIT_REVISION,
    childRevisionEvidence: {
      status: "verified" as const,
      childCommittedRevision: "d".repeat(40),
    },
    disposition: "integrated" as const,
    baseCommit: GIT_REVISION,
    patchDigest: SECOND_SHA,
    changedPaths: ["extensions/models/factory-contract.ts"],
    integratedRevision: "e".repeat(40),
    integratedTreeFingerprint: SHA,
    rejectionReason: "none" as const,
  };
  const receipt = {
    ...content,
    receiptId: await createSupersDeterministicContractHash(content),
  };
  assert.equal(
    (await verifySupersFactoryIntegrationReceipt(receipt)).disposition,
    "integrated",
  );
  await assert.rejects(() =>
    verifySupersFactoryIntegrationReceipt({
      ...receipt,
      targetBaselineRevision: "f".repeat(40),
    })
  );
  assert.throws(() =>
    SupersFactoryIntegrationReceiptSchema.parse({
      ...receipt,
      disposition: "rejected",
      integratedRevision: "e".repeat(40),
      integratedTreeFingerprint: SHA,
      rejectionReason: "patch-conflict",
    })
  );
  assert.throws(() =>
    SupersFactoryIntegrationReceiptSchema.parse({
      ...receipt,
      changedPaths: ["z.ts", "a.ts"],
    })
  );
  assert.throws(() =>
    SupersFactoryIntegrationReceiptSchema.parse({
      ...receipt,
      childRevisionEvidence: {
        status: "not-provided",
        childCommittedRevision: null,
      },
    })
  );
});

Deno.test("integrated tree fingerprint hashes exact NUL-delimited listing bytes", async () => {
  const listing = new TextEncoder().encode(
    "100644 blob 0123456789012345678901234567890123456789\ta.ts\0",
  );
  const directDigest = await crypto.subtle.digest("SHA-256", listing);
  const expected = [...new Uint8Array(directDigest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  assert.equal(await createSupersIntegratedTreeFingerprint(listing), expected);
  assert.notEqual(
    await createSupersIntegratedTreeFingerprint(
      new Uint8Array([...listing, "\n".charCodeAt(0)]),
    ),
    expected,
  );
});

Deno.test("rejected Pi handoffs do not claim unavailable integration facts", async () => {
  const content = {
    schemaVersion: 1 as const,
    rootEpicId: "factory-redesign",
    activeTaskId: "typed-contracts",
    factoryName: "supers-delivery",
    handoffManifestDigest: SHA,
    targetBaselineRevision: GIT_REVISION,
    childRevisionEvidence: {
      status: "not-provided" as const,
      childCommittedRevision: null,
    },
    disposition: "rejected" as const,
    baseCommit: GIT_REVISION,
    patchDigest: null,
    changedPaths: [],
    integratedRevision: null,
    integratedTreeFingerprint: null,
    rejectionReason: "manifest-invalid" as const,
  };
  const receipt = {
    ...content,
    receiptId: await createSupersDeterministicContractHash(content),
  };
  assert.equal(
    (await verifySupersFactoryIntegrationReceipt(receipt)).disposition,
    "rejected",
  );
});

Deno.test("render coordinates enforce native orientation resolution", async () => {
  const horizontal = await coordinate("horizontal");
  assert.equal(
    SupersRenderMatrixCoordinateSchema.parse(horizontal).width,
    3840,
  );
  assert.throws(() =>
    SupersRenderMatrixCoordinateSchema.parse({
      ...horizontal,
      orientation: "vertical",
    })
  );
});

Deno.test("evaluated outcomes derive from typed measurements only", () => {
  assert.equal(
    SupersDeterministicRenderCheckSchema.parse(
      evaluatedCheck("title-safe-violation"),
    ).outcome,
    "pass",
  );
  assert.throws(() =>
    SupersDeterministicRenderCheckSchema.parse({
      checkId: "title-safe-violation",
      code: "title-safe-violation",
      outcome: "fail",
      measurement: { opinion: "looks bad" },
      evidence: [evidence()],
    })
  );
  assert.throws(() =>
    SupersDeterministicRenderCheckSchema.parse({
      ...evaluatedCheck("title-safe-violation"),
      outcome: "fail",
    })
  );
  assert.throws(() =>
    SupersDeterministicRenderCheckSchema.parse({
      ...evaluatedCheck("contrast-below-floor"),
      measurement: {
        measuredRatio: 1,
        textClass: "body",
        callerSelectedMinimum: 0,
      },
    })
  );
  assert.throws(() =>
    SupersDeterministicRenderCheckSchema.parse({
      checkId: "target-resolution-mismatch",
      code: "target-resolution-mismatch",
      outcome: "not-applicable",
      reason: "no-text",
      evidence: [evidence()],
    })
  );
});

Deno.test("implementation gaps cannot produce pass verdicts", () => {
  assert.throws(() =>
    SupersDeterministicRenderCheckSchema.parse({
      checkId: "font-not-ready",
      code: "font-not-ready",
      outcome: "pass",
      measurement: { pendingFontCount: 0 },
      evidence: [evidence()],
    })
  );
});

Deno.test("verified full matrix binds every axis, check, revision, and digest", async () => {
  const fixture = await verifiedFixture();
  const verified = await verifySupersRenderMatrixBundle(
    fixture.manifest,
    fixture.bundle,
  );
  assert.equal(verified.cells.length, 2);

  const missingCellBundle = structuredClone(fixture.bundle);
  (missingCellBundle.cells as unknown[]).pop();
  await assert.rejects(() =>
    verifySupersRenderMatrixBundle(fixture.manifest, missingCellBundle)
  );

  const missingCheckBundle = structuredClone(fixture.bundle);
  const firstCell =
    (missingCheckBundle.cells as Array<{ checks: unknown[] }>)[0];
  firstCell.checks.pop();
  await assert.rejects(() =>
    verifySupersRenderMatrixBundle(fixture.manifest, missingCheckBundle)
  );

  const tamperedCoordinateBundle = structuredClone(fixture.bundle);
  const coordinate = (tamperedCoordinateBundle.cells as Array<{
    coordinate: { packFingerprint: string };
  }>)[0].coordinate;
  coordinate.packFingerprint = SHA;
  await assert.rejects(() =>
    verifySupersRenderMatrixBundle(fixture.manifest, tamperedCoordinateBundle)
  );

  const relaxedThresholdBundle = structuredClone(fixture.bundle);
  const contrast = (relaxedThresholdBundle.cells as Array<{
    checks: Array<Record<string, unknown>>;
  }>)[0].checks.find((entry) => entry.code === "contrast-below-floor");
  assert.ok(contrast);
  contrast.measurement = {
    measuredRatio: 1,
    textClass: "body",
    callerSelectedMinimum: 0,
  };
  await assert.rejects(() =>
    verifySupersRenderMatrixBundle(fixture.manifest, relaxedThresholdBundle)
  );
});

Deno.test("full matrix compares complete transition sample identities", async () => {
  const fixture = await verifiedFixture();
  const manifest = structuredClone(fixture.manifest) as {
    manifestDigest: string;
    presets: Array<{ samples: Array<Record<string, unknown>> }>;
    coordinates: Array<Record<string, unknown>>;
  };
  const bundle = structuredClone(fixture.bundle) as {
    bundleDigest: string;
    manifestDigest: string;
    cells: Array<{ coordinate: Record<string, unknown> }>;
  };
  const declaredSample = {
    kind: "transition-window",
    transitionId: "declared-transition",
    sampleId: "transition-frame",
    frameIndex: 30,
    timestampMicroseconds: 1_000_000,
  };
  const renderedSample = {
    ...declaredSample,
    transitionId: "different-transition",
  };
  manifest.presets[0].samples = [declaredSample];
  for (const [index, entry] of manifest.coordinates.entries()) {
    const { cellId: _previousCellId, ...coordinateContent } = entry;
    const content = { ...coordinateContent, sample: renderedSample };
    const updated = {
      ...content,
      cellId: await createSupersDeterministicContractHash(content),
    };
    manifest.coordinates[index] = updated;
    bundle.cells[index].coordinate = updated;
  }
  const { manifestDigest: _previousManifestDigest, ...manifestContent } =
    manifest;
  manifest.manifestDigest = await createSupersDeterministicContractHash(
    manifestContent,
  );
  bundle.manifestDigest = manifest.manifestDigest;
  const { bundleDigest: _previousBundleDigest, ...bundleContent } = bundle;
  bundle.bundleDigest = await createSupersDeterministicContractHash(
    bundleContent,
  );
  await assert.rejects(() => verifySupersRenderMatrixBundle(manifest, bundle));
});

Deno.test("advisory observations have no blocking or routing authority", () => {
  const observation = SupersAdvisoryVisualObservationSchema.parse({
    schemaVersion: 1,
    observationId: SHA,
    cellId: SHA,
    category: "pack-grammar",
    summary: "The composition may not feel native to this Pack.",
    evidence: [evidence()],
    blocking: false,
    routingAuthority: "none",
  });
  assert.equal(observation.routingAuthority, "none");
  assert.throws(() =>
    SupersAdvisoryVisualObservationSchema.parse({
      ...observation,
      recommendation: "revise",
    })
  );
});

Deno.test("human decisions require a trusted approval receipt bound to evidence", async () => {
  const fixture = await verifiedFixture();
  const bundle = await verifySupersRenderMatrixBundle(
    fixture.manifest,
    fixture.bundle,
  );
  const decision = SupersHumanAestheticDecisionSchema.parse({
    schemaVersion: 1,
    decisionId: SHA,
    evidenceBundleDigest: bundle.bundleDigest,
    approvalReceiptId: SHA,
    authenticatedActorId: "scott",
    decision: "reject",
    note: "The motion hierarchy still needs work.",
  });
  assert.equal(
    verifySupersHumanAestheticDecision(decision, bundle).authenticatedActorId,
    "scott",
  );
  assert.throws(() =>
    SupersHumanAestheticDecisionSchema.parse({
      ...decision,
      authority: "human-aesthetic",
    })
  );
  assert.throws(() =>
    verifySupersHumanAestheticDecision(
      { ...decision, evidenceBundleDigest: SECOND_SHA },
      bundle,
    )
  );
});

Deno.test("every failure code has one canonical implementation inventory entry", () => {
  const codes = SupersDeterministicRenderFailureCodeSchema.options;
  const inventoryCodes = SUPERS_DETERMINISTIC_RULE_INVENTORY.map((entry) =>
    entry.code
  );
  assert.deepEqual([...inventoryCodes].sort(), [...codes].sort());
  assert.equal(new Set(inventoryCodes).size, inventoryCodes.length);
  assert.deepEqual(
    SUPERS_DETERMINISTIC_RULE_INVENTORY
      .filter((entry) => entry.implementation === "existing")
      .map((entry) => entry.code)
      .sort(),
    ["target-resolution-mismatch", "title-safe-violation"],
  );
});
