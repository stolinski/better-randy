import { z } from "npm:zod@4.4.3";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const REPOSITORY_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/;

const Sha256Schema = z.string().regex(SHA256_PATTERN);
const GitRevisionSchema = z.string().regex(GIT_REVISION_PATTERN);
const DomainIdSchema = z.string().regex(DOMAIN_ID_PATTERN);
const RepositoryPathSchema = z.string().min(1).max(1_000).regex(
  REPOSITORY_PATH_PATTERN,
);
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonNegativeNumberSchema = z.number().finite().nonnegative();

const FactoryEpicLaneIdentityFields = {
  schemaVersion: z.literal(1),
  leaseId: Sha256Schema,
  rootEpicId: DomainIdSchema,
  activeTaskId: DomainIdSchema,
  factoryName: DomainIdSchema,
  worktreePath: z.string().min(1).max(2_000),
  baseRevision: GitRevisionSchema,
  sourceRevision: GitRevisionSchema,
  treeFingerprint: Sha256Schema,
};

const QueuedIntegrationSchema = z.strictObject({
  targetRevision: GitRevisionSchema,
  candidateFingerprint: Sha256Schema,
});

const ReleasedIntegrationSchema = z.discriminatedUnion("disposition", [
  z.strictObject({
    disposition: z.literal("integrated"),
    integratedRevision: GitRevisionSchema,
  }),
  z.strictObject({
    disposition: z.literal("abandoned"),
    integratedRevision: z.null(),
  }),
]);

/**
 * One lease belongs to one root epic and one isolated worktree. Closed states
 * prevent prose or caller recommendations from granting integration authority.
 */
export const SupersFactoryEpicLaneLeaseSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...FactoryEpicLaneIdentityFields,
    state: z.literal("leased"),
    integration: z.null(),
  }),
  z.strictObject({
    ...FactoryEpicLaneIdentityFields,
    state: z.literal("integration-queued"),
    integration: QueuedIntegrationSchema,
  }),
  z.strictObject({
    ...FactoryEpicLaneIdentityFields,
    state: z.literal("integrating"),
    integration: QueuedIntegrationSchema.extend({
      integrationAttemptId: Sha256Schema,
      integrationBaseRevision: GitRevisionSchema,
    }),
  }),
  z.strictObject({
    ...FactoryEpicLaneIdentityFields,
    state: z.literal("released"),
    integration: ReleasedIntegrationSchema,
  }),
  z.strictObject({
    ...FactoryEpicLaneIdentityFields,
    state: z.literal("recovery-required"),
    integration: z.strictObject({
      reason: z.enum([
        "missing-worktree",
        "lease-conflict",
        "stale-source-revision",
        "integration-conflict",
      ]),
    }),
  }),
]);

export type SupersFactoryEpicLaneLease = z.infer<
  typeof SupersFactoryEpicLaneLeaseSchema
>;

export const SupersRenderOrientationSchema = z.enum([
  "horizontal",
  "vertical",
]);

const RenderSampleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("checkpoint"),
    sampleId: DomainIdSchema,
    frameIndex: NonNegativeIntegerSchema,
    timestampMicroseconds: NonNegativeIntegerSchema,
  }),
  z.strictObject({
    kind: z.literal("transition-window"),
    sampleId: DomainIdSchema,
    transitionId: DomainIdSchema,
    frameIndex: NonNegativeIntegerSchema,
    timestampMicroseconds: NonNegativeIntegerSchema,
  }),
]);

const RenderMatrixCoordinateFields = {
  schemaVersion: z.literal(1),
  sourceRevision: GitRevisionSchema,
  engineFingerprint: Sha256Schema,
  presetSlug: DomainIdSchema,
  presetFingerprint: Sha256Schema,
  packId: DomainIdSchema,
  packFingerprint: Sha256Schema,
  orientation: SupersRenderOrientationSchema,
  width: z.union([z.literal(3840), z.literal(2160)]),
  height: z.union([z.literal(2160), z.literal(3840)]),
  sample: RenderSampleSchema,
};

/** Exact identity of one deterministic render-matrix sample. */
export const SupersRenderMatrixCoordinateSchema = z.strictObject({
  ...RenderMatrixCoordinateFields,
  cellId: Sha256Schema,
}).superRefine((coordinate, context) => {
  const expected = coordinate.orientation === "horizontal"
    ? { width: 3840, height: 2160 }
    : { width: 2160, height: 3840 };
  if (
    coordinate.width !== expected.width || coordinate.height !== expected.height
  ) {
    context.addIssue({
      code: "custom",
      path: ["width"],
      message:
        `${coordinate.orientation} renders must be ${expected.width}x${expected.height}`,
    });
  }
});

export type SupersRenderMatrixCoordinate = z.infer<
  typeof SupersRenderMatrixCoordinateSchema
>;

const DETERMINISTIC_RENDER_FAILURE_CODES = [
  "target-resolution-mismatch",
  "font-not-ready",
  "title-safe-violation",
  "vertical-platform-safe-area-violation",
  "readable-content-clipped",
  "readable-content-occluded",
  "contrast-below-floor",
  "cap-height-below-floor",
  "output-class-mismatch",
  "text-edge-softness",
  "shadow-banding",
  "tonal-banding",
  "edge-aliasing",
  "reading-window-too-short",
  "visibility-discontinuity",
  "layout-instability",
  "nondeterministic-replay",
] as const;

/** Closed codes are the only cell-level facts allowed to authorize rework. */
export const SupersDeterministicRenderFailureCodeSchema = z.enum(
  DETERMINISTIC_RENDER_FAILURE_CODES,
);

export type SupersDeterministicRenderFailureCode = z.infer<
  typeof SupersDeterministicRenderFailureCodeSchema
>;

const EvidenceReferenceSchema = z.strictObject({
  kind: z.enum(["static", "dom", "capture", "probe", "export"]),
  path: RepositoryPathSchema,
  sha256: Sha256Schema,
  region: z.strictObject({
    x: NonNegativeIntegerSchema,
    y: NonNegativeIntegerSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).nullable(),
});

const EvaluatedCheckFields = {
  checkId: DomainIdSchema,
  outcome: z.enum(["pass", "fail"]),
  evidence: z.array(EvidenceReferenceSchema).min(1),
};

const AffectedPixelMeasurementSchema = z.strictObject({
  affectedPixelCount: NonNegativeIntegerSchema,
});
const BandCountMeasurementSchema = z.strictObject({
  bandCount: NonNegativeIntegerSchema,
});

const EvaluatedRenderCheckSchema = z.union([
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("target-resolution-mismatch"),
    measurement: z.strictObject({
      actualWidth: NonNegativeIntegerSchema,
      actualHeight: NonNegativeIntegerSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("font-not-ready"),
    measurement: z.strictObject({ pendingFontCount: NonNegativeIntegerSchema }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("title-safe-violation"),
    measurement: AffectedPixelMeasurementSchema,
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("vertical-platform-safe-area-violation"),
    measurement: AffectedPixelMeasurementSchema,
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("readable-content-clipped"),
    measurement: AffectedPixelMeasurementSchema,
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("readable-content-occluded"),
    measurement: AffectedPixelMeasurementSchema,
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("contrast-below-floor"),
    measurement: z.strictObject({
      measuredRatio: NonNegativeNumberSchema,
      textClass: z.enum(["body", "large"]),
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("cap-height-below-floor"),
    measurement: z.strictObject({
      measuredPixels: NonNegativeNumberSchema,
      textRole: DomainIdSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("output-class-mismatch"),
    measurement: z.strictObject({
      expectedClass: z.enum(["transparent", "opaque"]),
      actualClass: z.enum(["transparent", "opaque"]),
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("text-edge-softness"),
    measurement: z.strictObject({
      normalizedMaximumStep: NonNegativeNumberSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("shadow-banding"),
    measurement: BandCountMeasurementSchema,
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("tonal-banding"),
    measurement: BandCountMeasurementSchema,
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("edge-aliasing"),
    measurement: z.strictObject({
      hardStairstepCount: NonNegativeIntegerSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("reading-window-too-short"),
    measurement: z.strictObject({
      availableMilliseconds: NonNegativeNumberSchema,
      requiredMilliseconds: NonNegativeNumberSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("visibility-discontinuity"),
    measurement: z.strictObject({
      measuredDipRatio: NonNegativeNumberSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("layout-instability"),
    measurement: z.strictObject({
      maximumElementDeltaPixels: NonNegativeNumberSchema,
    }),
  }),
  z.strictObject({
    ...EvaluatedCheckFields,
    code: z.literal("nondeterministic-replay"),
    measurement: z.strictObject({
      changedPixelRatio: NonNegativeNumberSchema,
    }),
  }),
]);

const UnavailableRenderCheckSchema = z.strictObject({
  checkId: DomainIdSchema,
  code: SupersDeterministicRenderFailureCodeSchema,
  outcome: z.literal("unavailable"),
  unavailableReason: z.enum([
    "capture-failed",
    "probe-failed",
    "measurement-not-implemented",
    "evidence-stale",
  ]),
  evidence: z.array(EvidenceReferenceSchema).min(1),
});

const NotApplicableCheckFields = {
  checkId: DomainIdSchema,
  outcome: z.literal("not-applicable"),
  evidence: z.array(EvidenceReferenceSchema).min(1),
};
const NotApplicableRenderCheckSchema = z.union([
  z.strictObject({
    ...NotApplicableCheckFields,
    code: z.enum([
      "font-not-ready",
      "title-safe-violation",
      "vertical-platform-safe-area-violation",
      "readable-content-clipped",
      "readable-content-occluded",
      "contrast-below-floor",
      "cap-height-below-floor",
      "text-edge-softness",
    ]),
    reason: z.literal("no-text"),
  }),
  z.strictObject({
    ...NotApplicableCheckFields,
    code: z.literal("shadow-banding"),
    reason: z.literal("no-shadow"),
  }),
  z.strictObject({
    ...NotApplicableCheckFields,
    code: z.literal("tonal-banding"),
    reason: z.literal("no-tonal-region"),
  }),
  z.strictObject({
    ...NotApplicableCheckFields,
    code: z.literal("edge-aliasing"),
    reason: z.literal("no-non-axis-edge"),
  }),
  z.strictObject({
    ...NotApplicableCheckFields,
    code: z.literal("reading-window-too-short"),
    reason: z.literal("no-reading-content"),
  }),
  z.strictObject({
    ...NotApplicableCheckFields,
    code: z.literal("visibility-discontinuity"),
    reason: z.literal("no-transition-window"),
  }),
]);

const IMPLEMENTED_FAILURE_CODES = new Set<SupersDeterministicRenderFailureCode>(
  [
    "target-resolution-mismatch",
    "title-safe-violation",
  ],
);

function expectedEvaluatedOutcome(
  check: z.infer<typeof EvaluatedRenderCheckSchema>,
): "pass" | "fail" {
  switch (check.code) {
    case "target-resolution-mismatch":
      return [3840, 2160].includes(check.measurement.actualWidth) &&
          [3840, 2160].includes(check.measurement.actualHeight) &&
          check.measurement.actualWidth !== check.measurement.actualHeight
        ? "pass"
        : "fail";
    case "font-not-ready":
      return check.measurement.pendingFontCount === 0 ? "pass" : "fail";
    case "title-safe-violation":
    case "vertical-platform-safe-area-violation":
    case "readable-content-clipped":
    case "readable-content-occluded":
      return check.measurement.affectedPixelCount === 0 ? "pass" : "fail";
    case "contrast-below-floor":
      return check.measurement.measuredRatio >=
          (check.measurement.textClass === "large" ? 3 : 4.5)
        ? "pass"
        : "fail";
    case "cap-height-below-floor":
      return "fail";
    case "output-class-mismatch":
      return check.measurement.actualClass === check.measurement.expectedClass
        ? "pass"
        : "fail";
    case "text-edge-softness":
      return check.measurement.normalizedMaximumStep >= 0.3 ? "pass" : "fail";
    case "shadow-banding":
    case "tonal-banding":
      return check.measurement.bandCount === 0 ? "pass" : "fail";
    case "edge-aliasing":
      return check.measurement.hardStairstepCount === 0 ? "pass" : "fail";
    case "reading-window-too-short":
      return "fail";
    case "visibility-discontinuity":
      return check.measurement.measuredDipRatio <= 0.25 ? "pass" : "fail";
    case "layout-instability":
    case "nondeterministic-replay":
      return "fail";
  }
}

export const SupersDeterministicRenderCheckSchema = z.union([
  EvaluatedRenderCheckSchema,
  UnavailableRenderCheckSchema,
  NotApplicableRenderCheckSchema,
]).superRefine((check, context) => {
  if (check.outcome === "pass" || check.outcome === "fail") {
    if (!IMPLEMENTED_FAILURE_CODES.has(check.code)) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message:
          `${check.code} is not fully deterministic and must be unavailable or not-applicable`,
      });
    }
    const expected = expectedEvaluatedOutcome(check);
    if (check.outcome !== expected) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message:
          `Check outcome must be derived from its measurement (${expected})`,
      });
    }
  }
});

export type SupersDeterministicRenderCheck = z.infer<
  typeof SupersDeterministicRenderCheckSchema
>;

export const SupersRenderMatrixCellVerdictSchema = z.strictObject({
  schemaVersion: z.literal(1),
  coordinate: SupersRenderMatrixCoordinateSchema,
  outcome: z.enum(["pass", "fail", "unavailable"]),
  checks: z.array(SupersDeterministicRenderCheckSchema).min(1),
}).superRefine((cell, context) => {
  const identities = cell.checks.map((check) =>
    `${check.checkId}:${check.code}`
  );
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: "custom",
      path: ["checks"],
      message: "Cell checks must have unique checkId/code identities",
    });
  }
  const derivedOutcome = cell.checks.some((check) => check.outcome === "fail")
    ? "fail"
    : cell.checks.some((check) => check.outcome === "unavailable")
    ? "unavailable"
    : "pass";
  if (cell.outcome !== derivedOutcome) {
    context.addIssue({
      code: "custom",
      path: ["outcome"],
      message: `Cell outcome must be derived from checks (${derivedOutcome})`,
    });
  }
});

export type SupersRenderMatrixCellVerdict = z.infer<
  typeof SupersRenderMatrixCellVerdictSchema
>;

/** Subjective observations are retained for human triage only. */
export const SupersAdvisoryVisualObservationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  observationId: Sha256Schema,
  cellId: Sha256Schema,
  category: z.enum([
    "composition",
    "hierarchy",
    "motion-taste",
    "pack-grammar",
    "finish",
  ]),
  summary: z.string().min(1).max(4_000),
  evidence: z.array(EvidenceReferenceSchema).min(1),
  blocking: z.literal(false),
  routingAuthority: z.literal("none"),
});

export type SupersAdvisoryVisualObservation = z.infer<
  typeof SupersAdvisoryVisualObservationSchema
>;

/**
 * This record is authoritative only when read from the Factory's trusted human
 * approval resource. Parsing caller input as this shape does not authenticate it.
 */
export const SupersHumanAestheticDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  decisionId: Sha256Schema,
  evidenceBundleDigest: Sha256Schema,
  approvalReceiptId: Sha256Schema,
  authenticatedActorId: DomainIdSchema,
  decision: z.enum(["accept", "reject"]),
  note: z.string().max(4_000),
});

export type SupersHumanAestheticDecision = z.infer<
  typeof SupersHumanAestheticDecisionSchema
>;

/** Verify evidence binding after loading the decision from the trusted approval resource. */
export function verifySupersHumanAestheticDecision(
  rawDecision: unknown,
  verifiedBundle: SupersRenderMatrixBundle,
): SupersHumanAestheticDecision {
  const decision = SupersHumanAestheticDecisionSchema.parse(rawDecision);
  if (decision.evidenceBundleDigest !== verifiedBundle.bundleDigest) {
    throw new TypeError(
      "Human aesthetic decision targets a different evidence bundle",
    );
  }
  return decision;
}

const MatrixPresetSchema = z.strictObject({
  slug: DomainIdSchema,
  fingerprint: Sha256Schema,
  samples: z.array(RenderSampleSchema).min(1),
});
const MatrixPackSchema = z.strictObject({
  id: DomainIdSchema,
  fingerprint: Sha256Schema,
});

const RenderMatrixManifestContentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceRevision: GitRevisionSchema,
  engineFingerprint: Sha256Schema,
  scope: z.enum(["affected", "full"]),
  presets: z.array(MatrixPresetSchema).min(1),
  packs: z.array(MatrixPackSchema).min(1),
  orientations: z.array(SupersRenderOrientationSchema).min(1),
  requiredCheckCodes: z.array(SupersDeterministicRenderFailureCodeSchema).min(
    1,
  ),
  coordinates: z.array(SupersRenderMatrixCoordinateSchema).min(1),
});

export const SupersRenderMatrixManifestSchema = z.strictObject({
  ...RenderMatrixManifestContentSchema.shape,
  manifestDigest: Sha256Schema,
});

export type SupersRenderMatrixManifest = z.infer<
  typeof SupersRenderMatrixManifestSchema
>;

export const SupersRenderMatrixBundleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bundleDigest: Sha256Schema,
  manifestDigest: Sha256Schema,
  sourceRevision: GitRevisionSchema,
  cells: z.array(SupersRenderMatrixCellVerdictSchema).min(1),
  outcome: z.enum(["pass", "fail", "unavailable"]),
});

export type SupersRenderMatrixBundle = z.infer<
  typeof SupersRenderMatrixBundleSchema
>;

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | {
  [key: string]: CanonicalJson;
};

function canonicalize(value: unknown): CanonicalJson {
  if (
    value === null || typeof value === "boolean" ||
    typeof value === "string"
  ) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON needs finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

/** Create the canonical digest used by coordinates, manifests, and bundles. */
export async function createSupersDeterministicContractHash(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function withoutProperty<T extends Record<string, unknown>>(
  value: T,
  property: keyof T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== property),
  );
}

async function verifyCoordinateIdentity(
  coordinate: SupersRenderMatrixCoordinate,
): Promise<void> {
  const expected = await createSupersDeterministicContractHash(
    withoutProperty(coordinate, "cellId"),
  );
  if (coordinate.cellId !== expected) {
    throw new TypeError("Render matrix cellId does not match its coordinate");
  }
}

function matrixAxisKey(
  presetSlug: string,
  packId: string,
  orientation: "horizontal" | "vertical",
  sample: z.infer<typeof RenderSampleSchema>,
): string {
  return JSON.stringify(
    canonicalize({ presetSlug, packId, orientation, sample }),
  );
}

function expectedFullCoordinates(
  manifest: SupersRenderMatrixManifest,
): string[] {
  const ids: string[] = [];
  for (const preset of manifest.presets) {
    for (const pack of manifest.packs) {
      for (const orientation of manifest.orientations) {
        for (const sample of preset.samples) {
          ids.push(matrixAxisKey(preset.slug, pack.id, orientation, sample));
        }
      }
    }
  }
  return ids.sort();
}

function actualCoordinateAxes(
  coordinates: readonly SupersRenderMatrixCoordinate[],
): string[] {
  return coordinates.map((coordinate) =>
    matrixAxisKey(
      coordinate.presetSlug,
      coordinate.packId,
      coordinate.orientation,
      coordinate.sample,
    )
  ).sort();
}

/**
 * Verify the independently generated manifest, exact matrix, normalized
 * outcomes, and every content-bound digest before a Factory may route on it.
 */
export async function verifySupersRenderMatrixBundle(
  rawManifest: unknown,
  rawBundle: unknown,
): Promise<SupersRenderMatrixBundle> {
  const manifest = SupersRenderMatrixManifestSchema.parse(rawManifest);
  const bundle = SupersRenderMatrixBundleSchema.parse(rawBundle);
  const manifestDigest = await createSupersDeterministicContractHash(
    withoutProperty(manifest, "manifestDigest"),
  );
  if (
    manifest.manifestDigest !== manifestDigest ||
    bundle.manifestDigest !== manifestDigest
  ) {
    throw new TypeError("Render matrix manifest digest mismatch");
  }
  if (bundle.sourceRevision !== manifest.sourceRevision) {
    throw new TypeError("Render matrix source revision mismatch");
  }
  const registeredCodes = [...DETERMINISTIC_RENDER_FAILURE_CODES].sort();
  const requiredCodes = [...new Set(manifest.requiredCheckCodes)].sort();
  if (requiredCodes.join("\n") !== registeredCodes.join("\n")) {
    throw new TypeError(
      "Manifest must require every registered deterministic check",
    );
  }
  if (manifest.scope === "full") {
    const orientations = [...new Set(manifest.orientations)].sort();
    if (orientations.join("\n") !== "horizontal\nvertical") {
      throw new TypeError("Full matrix must include horizontal and vertical");
    }
    if (
      expectedFullCoordinates(manifest).join("\n") !==
        actualCoordinateAxes(manifest.coordinates).join("\n")
    ) {
      throw new TypeError(
        "Full matrix coordinates do not equal the declared cross-product",
      );
    }
  }
  for (const coordinate of manifest.coordinates) {
    await verifyCoordinateIdentity(coordinate);
    if (
      coordinate.sourceRevision !== manifest.sourceRevision ||
      coordinate.engineFingerprint !== manifest.engineFingerprint
    ) {
      throw new TypeError("Matrix coordinate provenance is stale or mixed");
    }
    const preset = manifest.presets.find((entry) =>
      entry.slug === coordinate.presetSlug
    );
    const pack = manifest.packs.find((entry) => entry.id === coordinate.packId);
    if (
      preset?.fingerprint !== coordinate.presetFingerprint ||
      pack?.fingerprint !== coordinate.packFingerprint
    ) {
      throw new TypeError(
        "Matrix coordinate Preset or Pack fingerprint mismatch",
      );
    }
  }
  const expectedCellIds = manifest.coordinates.map((coordinate) =>
    coordinate.cellId
  ).sort();
  const actualCellIds = bundle.cells.map((cell) => cell.coordinate.cellId)
    .sort();
  if (
    new Set(expectedCellIds).size !== expectedCellIds.length ||
    new Set(actualCellIds).size !== actualCellIds.length ||
    expectedCellIds.join("\n") !== actualCellIds.join("\n")
  ) {
    throw new TypeError(
      "Rendered cells must exactly equal unique manifest cells",
    );
  }
  for (const cell of bundle.cells) {
    await verifyCoordinateIdentity(cell.coordinate);
    const cellCodes = cell.checks.map((check) => check.code).sort();
    if (
      new Set(cellCodes).size !== cellCodes.length ||
      cellCodes.join("\n") !== requiredCodes.join("\n")
    ) {
      throw new TypeError(
        "Every cell must record every required check exactly once",
      );
    }
    const resolutionCheck = cell.checks.find((check) =>
      check.code === "target-resolution-mismatch"
    );
    if (
      !resolutionCheck ||
      (resolutionCheck.outcome !== "pass" &&
        resolutionCheck.outcome !== "fail") ||
      resolutionCheck.code !== "target-resolution-mismatch"
    ) {
      throw new TypeError("Target resolution must always be measured");
    }
    if (
      resolutionCheck.measurement.actualWidth !== cell.coordinate.width ||
      resolutionCheck.measurement.actualHeight !== cell.coordinate.height
    ) {
      throw new TypeError(
        "Target resolution measurement contradicts its coordinate",
      );
    }
  }
  const derivedOutcome = bundle.cells.some((cell) => cell.outcome === "fail")
    ? "fail"
    : bundle.cells.some((cell) => cell.outcome === "unavailable")
    ? "unavailable"
    : "pass";
  if (bundle.outcome !== derivedOutcome) {
    throw new TypeError(
      `Bundle outcome must be derived from cells (${derivedOutcome})`,
    );
  }
  const bundleDigest = await createSupersDeterministicContractHash(
    withoutProperty(bundle, "bundleDigest"),
  );
  if (bundle.bundleDigest !== bundleDigest) {
    throw new TypeError("Render matrix bundle digest mismatch");
  }
  return bundle;
}

export type SupersDeterministicRuleInventoryEntry = {
  code: SupersDeterministicRenderFailureCode;
  owner: string;
  implementation: "existing" | "partial" | "gap";
  evidenceKind: "static" | "dom" | "pixel" | "temporal" | "replay";
  notes: string;
};

/** Gaps can emit only unavailable/not-applicable until their owner lands. */
export const SUPERS_DETERMINISTIC_RULE_INVENTORY:
  readonly SupersDeterministicRuleInventoryEntry[] = [
    {
      code: "target-resolution-mismatch",
      owner: "scripts/probe-dimensions.ts",
      implementation: "existing",
      evidenceKind: "pixel",
      notes: "Backing store and native target dimensions.",
    },
    {
      code: "font-not-ready",
      owner: "document.fonts",
      implementation: "gap",
      evidenceKind: "dom",
      notes: "Must precede every text measurement.",
    },
    {
      code: "title-safe-violation",
      owner: "src/lib/platform/preset-rubric.ts",
      implementation: "existing",
      evidenceKind: "dom",
      notes: "Readable bounds against G2.",
    },
    {
      code: "vertical-platform-safe-area-violation",
      owner: "src/lib/platform/preset-rubric.ts",
      implementation: "partial",
      evidenceKind: "dom",
      notes: "Complete readable-element coverage is still required.",
    },
    {
      code: "readable-content-clipped",
      owner: "src/lib/platform/runtime-audit.ts",
      implementation: "partial",
      evidenceKind: "dom",
      notes: "Current audit measures bounds but not every Pipeline.",
    },
    {
      code: "readable-content-occluded",
      owner: "unimplemented render geometry audit",
      implementation: "gap",
      evidenceKind: "dom",
      notes: "Requires declared intentional-overlap exclusions.",
    },
    {
      code: "contrast-below-floor",
      owner: "src/lib/platform/preset-rubric.ts",
      implementation: "partial",
      evidenceKind: "pixel",
      notes:
        "Static checks exist; local rendered-background measurement is incomplete.",
    },
    {
      code: "cap-height-below-floor",
      owner: "src/lib/platform/runtime-audit.ts",
      implementation: "gap",
      evidenceKind: "dom",
      notes: "Mapped roles only; ceilings remain human taste.",
    },
    {
      code: "output-class-mismatch",
      owner: "scripts/probe-export-decode.ts",
      implementation: "gap",
      evidenceKind: "pixel",
      notes: "Transparent and opaque expectations need one normalized result.",
    },
    {
      code: "text-edge-softness",
      owner: "scripts/probe-text-edge.ts",
      implementation: "partial",
      evidenceKind: "pixel",
      notes: "Region selection must become deterministic.",
    },
    {
      code: "shadow-banding",
      owner: "scripts/probe-banding.ts",
      implementation: "partial",
      evidenceKind: "pixel",
      notes: "Shadow-region selection must become deterministic.",
    },
    {
      code: "tonal-banding",
      owner: "scripts/probe-banding.ts",
      implementation: "partial",
      evidenceKind: "pixel",
      notes: "Tonal-region selection must become deterministic.",
    },
    {
      code: "edge-aliasing",
      owner: "scripts/probe-edge-aa.ts",
      implementation: "partial",
      evidenceKind: "pixel",
      notes: "Edge-region selection must become deterministic.",
    },
    {
      code: "reading-window-too-short",
      owner: "src/lib/platform/preset-rubric.ts",
      implementation: "gap",
      evidenceKind: "static",
      notes: "Only objective timing floors; taste ceilings stay advisory.",
    },
    {
      code: "visibility-discontinuity",
      owner: "scripts/probe-temporal-energy.ts",
      implementation: "partial",
      evidenceKind: "temporal",
      notes: "Generalize beyond authored optical-transition regions.",
    },
    {
      code: "layout-instability",
      owner: "unimplemented frame geometry comparison",
      implementation: "gap",
      evidenceKind: "temporal",
      notes: "Compare stable element identities at exact frames.",
    },
    {
      code: "nondeterministic-replay",
      owner: "unimplemented normalized replay comparator",
      implementation: "gap",
      evidenceKind: "replay",
      notes: "Compare identical coordinate/evidence runs by content hash.",
    },
  ];
