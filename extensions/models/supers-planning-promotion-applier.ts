/**
 * Recoverable Supers planning-item promotion saga.
 *
 * Documentation and Dex destinations share one stable planning identity, one
 * repository lock, and one durable roll-forward journal. A destination is
 * always written and verified before authority changes; source cleanup happens
 * only after that cutover.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  type DexApprovedPlan,
  DexApprovedPlanSchema,
  DexPlanApplierError,
  type DexPlanApplyResult,
  DexPlanApplyResultSchema,
} from "./dex-plan-applier-adapter.ts";
import {
  DEFAULT_DEX_REPOSITORY_LOCK,
  type DexRepositoryLock,
  type DexRepositoryLockLease,
} from "./dex-repository-lock.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PLANNING_ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const JOURNAL_DIRECTORY = ".swamp/supers-planning-promotions";

const RevisionSchema = z.string().regex(SHA256_PATTERN);
const PlanningItemIdSchema = z.string().regex(PLANNING_ITEM_ID_PATTERN);
const RepositoryPathSchema = z.string().min(1).max(1_000);
const PromotionOperationSchema = z.enum([
  "capture-idea",
  "idea-to-roadmap",
  "roadmap-to-planning",
  "planning-to-dex",
]);

export const SupersPlanningDocumentWriteSchema = z.strictObject({
  path: RepositoryPathSchema,
  expectedRevision: RevisionSchema.nullable(),
  content: z.string().max(2_000_000),
  revision: RevisionSchema,
});

export const SupersPlanningDocumentDeleteSchema = z.strictObject({
  path: RepositoryPathSchema,
  expectedRevision: RevisionSchema,
});

/** Source cleanup may delete a tier document or rewrite a shared tier document. */
export const SupersPlanningDocumentCleanupSchema = z.union([
  SupersPlanningDocumentDeleteSchema,
  SupersPlanningDocumentWriteSchema.extend({
    expectedRevision: RevisionSchema,
  }),
]);

const SupersPlanningIndexWriteSchema = SupersPlanningDocumentWriteSchema.extend(
  { action: z.literal("write") },
);
const SupersPlanningIndexDeleteSchema = SupersPlanningDocumentDeleteSchema
  .extend({ action: z.literal("delete") });
export const SupersPlanningIndexMutationSchema = z.discriminatedUnion(
  "action",
  [SupersPlanningIndexWriteSchema, SupersPlanningIndexDeleteSchema],
);

const ApprovalSchema = z.strictObject({ digest: RevisionSchema });
const CommonDocumentApplyFields = {
  schemaVersion: z.literal(2),
  planningItemId: PlanningItemIdSchema,
  decision: z.literal("apply"),
  destination: SupersPlanningDocumentWriteSchema,
  indexMutations: z.array(SupersPlanningIndexMutationSchema).max(20),
};

const CaptureIdeaSchema = z.strictObject({
  ...CommonDocumentApplyFields,
  operation: z.literal("capture-idea"),
  source: z.null(),
  graph: z.null(),
  approval: z.null(),
});
const IdeaToRoadmapSchema = z.strictObject({
  ...CommonDocumentApplyFields,
  operation: z.literal("idea-to-roadmap"),
  source: SupersPlanningDocumentDeleteSchema,
  graph: z.null(),
  approval: ApprovalSchema,
});
const RoadmapToPlanningSchema = z.strictObject({
  ...CommonDocumentApplyFields,
  operation: z.literal("roadmap-to-planning"),
  source: SupersPlanningDocumentCleanupSchema,
  graph: z.null(),
  approval: ApprovalSchema,
});
const PlanningToDexObjectSchema = z.strictObject({
  schemaVersion: z.literal(2),
  planningItemId: PlanningItemIdSchema,
  operation: z.literal("planning-to-dex"),
  decision: z.literal("apply"),
  source: SupersPlanningDocumentDeleteSchema,
  destination: z.null(),
  indexMutations: z.array(SupersPlanningIndexMutationSchema).max(20),
  graph: DexApprovedPlanSchema,
  approval: ApprovalSchema,
});
const PlanningToDexSchema = PlanningToDexObjectSchema.superRefine(
  (promotion, context) => {
    if (promotion.graph.planId !== promotion.planningItemId) {
      context.addIssue({
        code: "custom",
        path: ["graph", "planId"],
        message: "Dex planId must equal the stable planningItemId",
      });
    }
  },
);

/** Complete pre-approval mutation preview authored and reviewed by Planning. */
export const SupersPlanningPromotionPreviewSchema = z.discriminatedUnion(
  "operation",
  [
    CaptureIdeaSchema.omit({ decision: true, approval: true }),
    IdeaToRoadmapSchema.omit({ decision: true, approval: true }),
    RoadmapToPlanningSchema.omit({ decision: true, approval: true }),
    PlanningToDexObjectSchema.omit({ decision: true, approval: true })
      .superRefine((promotion, context) => {
        if (promotion.graph.planId !== promotion.planningItemId) {
          context.addIssue({
            code: "custom",
            path: ["graph", "planId"],
            message: "Dex planId must equal the stable planningItemId",
          });
        }
      }),
  ],
);

export const SupersPlanningPromotionApplySchema = z.discriminatedUnion(
  "operation",
  [
    CaptureIdeaSchema,
    IdeaToRoadmapSchema,
    RoadmapToPlanningSchema,
    PlanningToDexSchema,
  ],
);

const RejectPromotionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  decision: z.literal("reject"),
  reason: z.string().min(1).max(2_000),
});
const ParkPromotionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  decision: z.literal("park"),
  reason: z.string().min(1).max(2_000),
});
const NoOpPromotionSchema = z.discriminatedUnion("decision", [
  RejectPromotionSchema,
  ParkPromotionSchema,
]);

function noOpSchemasForOperation<
  Operation extends z.infer<typeof PromotionOperationSchema>,
>(operation: Operation) {
  return [
    RejectPromotionSchema.extend({ operation: z.literal(operation) }),
    ParkPromotionSchema.extend({ operation: z.literal(operation) }),
  ] as const;
}

const captureIdeaNoOps = noOpSchemasForOperation("capture-idea");
const ideaToRoadmapNoOps = noOpSchemasForOperation("idea-to-roadmap");
const roadmapToPlanningNoOps = noOpSchemasForOperation("roadmap-to-planning");
const planningToDexNoOps = noOpSchemasForOperation("planning-to-dex");

/** Exact arguments for the idempotent capture handler. */
export const SupersPlanningCaptureIdeaArgumentsSchema = z.union([
  CaptureIdeaSchema,
  ...captureIdeaNoOps,
]);
/** Exact arguments for the idea-to-Roadmap promotion handler. */
export const SupersPlanningIdeaToRoadmapArgumentsSchema = z.union([
  IdeaToRoadmapSchema,
  ...ideaToRoadmapNoOps,
]);
/** Exact arguments for the Roadmap-to-Planning promotion handler. */
export const SupersPlanningRoadmapToPlanningArgumentsSchema = z.union([
  RoadmapToPlanningSchema,
  ...roadmapToPlanningNoOps,
]);
/** Exact arguments for the Planning-to-Dex promotion handler. */
export const SupersPlanningToDexArgumentsSchema = z.union([
  PlanningToDexSchema,
  ...planningToDexNoOps,
]);

export const SupersPlanningPromotionArgumentsSchema = z.union([
  SupersPlanningPromotionApplySchema,
  NoOpPromotionSchema,
]);

const JournalStateSchema = z.enum([
  "prepared",
  "destination-written",
  "destination-verified",
  "committed",
  "source-cleaned",
  "audited",
]);
const AuthorityStateSchema = z.enum([
  "unchanged",
  "uncommitted",
  "source-authoritative",
  "destination-authoritative",
  "dex-authoritative",
]);
const CleanupDispositionSchema = z.enum([
  "not-required",
  "pending",
  "completed",
]);
export const SupersPlanningPromotionRepairGuidanceSchema = z.enum([
  "none",
  "retry-same-payload",
  "request-fresh-approval",
  "request-corrected-payload",
  "inspect-source-drift",
  "inspect-destination-drift",
  "inspect-index-drift",
  "inspect-dex-drift",
  "repair-journal",
]);

const PromotionHashesSchema = z.strictObject({
  promotionDigest: RevisionSchema,
  sourceRevision: RevisionSchema.nullable(),
  destinationRevision: RevisionSchema.nullable(),
  indexMutationsDigest: RevisionSchema,
  dexPlanDigest: RevisionSchema.nullable(),
});
const JournalFailureSchema = z.strictObject({
  errorCode: z.string().min(1).max(100),
  repairGuidance: SupersPlanningPromotionRepairGuidanceSchema,
});

export const SupersPlanningPromotionJournalSchema = z.strictObject({
  schemaVersion: z.literal(2),
  transactionId: RevisionSchema,
  idempotencyKey: RevisionSchema,
  approvalDigest: RevisionSchema,
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  state: JournalStateSchema,
  authorityState: AuthorityStateSchema,
  cleanupDisposition: CleanupDispositionSchema,
  repairGuidance: SupersPlanningPromotionRepairGuidanceSchema,
  hashes: PromotionHashesSchema,
  dexResult: DexPlanApplyResultSchema.nullable(),
  auditReceiptDigest: RevisionSchema.nullable(),
  lastFailure: JournalFailureSchema.nullable(),
});

const AppliedAuditReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  receiptId: RevisionSchema,
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  status: z.literal("audited"),
  transactionId: RevisionSchema,
  idempotencyKey: RevisionSchema,
  approvalDigest: RevisionSchema.nullable(),
  journalDigest: RevisionSchema,
  decisionDigest: z.null(),
  authorityState: z.enum([
    "destination-authoritative",
    "dex-authoritative",
  ]),
  cleanupDisposition: z.enum(["not-required", "completed"]),
  repairGuidance: z.literal("none"),
  hashes: PromotionHashesSchema,
  dexResult: DexPlanApplyResultSchema.nullable(),
});
const NoOpAuditReceiptBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  receiptId: RevisionSchema,
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  transactionId: z.null(),
  idempotencyKey: z.null(),
  approvalDigest: z.null(),
  journalDigest: z.null(),
  decisionDigest: RevisionSchema,
  authorityState: z.literal("unchanged"),
  cleanupDisposition: z.literal("not-required"),
  repairGuidance: z.literal("none"),
  hashes: z.null(),
  dexResult: z.null(),
});
const RejectedAuditReceiptSchema = NoOpAuditReceiptBaseSchema.extend({
  status: z.literal("rejected"),
});
const ParkedAuditReceiptSchema = NoOpAuditReceiptBaseSchema.extend({
  status: z.literal("parked"),
});
export const SupersPlanningPromotionAuditReceiptSchema = z.discriminatedUnion(
  "status",
  [
    AppliedAuditReceiptSchema,
    RejectedAuditReceiptSchema,
    ParkedAuditReceiptSchema,
  ],
);

const AppliedPromotionResultSchema = z.strictObject({
  schemaVersion: z.literal(2),
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  status: z.literal("audited"),
  transactionId: RevisionSchema,
  idempotencyKey: RevisionSchema,
  approvalDigest: RevisionSchema.nullable(),
  authorityState: z.enum([
    "destination-authoritative",
    "dex-authoritative",
  ]),
  cleanupDisposition: z.enum(["not-required", "completed"]),
  repairGuidance: z.literal("none"),
  hashes: PromotionHashesSchema,
  dexResult: DexPlanApplyResultSchema.nullable(),
  auditReceipt: AppliedAuditReceiptSchema,
});
const NoOpPromotionResultBaseSchema = z.strictObject({
  schemaVersion: z.literal(2),
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  transactionId: z.null(),
  idempotencyKey: z.null(),
  approvalDigest: z.null(),
  authorityState: z.literal("unchanged"),
  cleanupDisposition: z.literal("not-required"),
  repairGuidance: z.literal("none"),
  hashes: z.null(),
  dexResult: z.null(),
});
const RejectedPromotionResultSchema = NoOpPromotionResultBaseSchema.extend({
  status: z.literal("rejected"),
  auditReceipt: RejectedAuditReceiptSchema,
});
const ParkedPromotionResultSchema = NoOpPromotionResultBaseSchema.extend({
  status: z.literal("parked"),
  auditReceipt: ParkedAuditReceiptSchema,
});
export const SupersPlanningPromotionResultSchema = z.discriminatedUnion(
  "status",
  [
    AppliedPromotionResultSchema,
    RejectedPromotionResultSchema,
    ParkedPromotionResultSchema,
  ],
);

export type SupersPlanningPromotionArguments = z.infer<
  typeof SupersPlanningPromotionArgumentsSchema
>;
export type SupersPlanningPromotionPreview = z.infer<
  typeof SupersPlanningPromotionPreviewSchema
>;
export type SupersPlanningPromotionApply = z.infer<
  typeof SupersPlanningPromotionApplySchema
>;
export type SupersPlanningPromotionJournal = z.infer<
  typeof SupersPlanningPromotionJournalSchema
>;
export type SupersPlanningPromotionAuditReceipt = z.infer<
  typeof SupersPlanningPromotionAuditReceiptSchema
>;
export type SupersPlanningPromotionResult = z.infer<
  typeof SupersPlanningPromotionResultSchema
>;
export type SupersPlanningPromotionRepairGuidance = z.infer<
  typeof SupersPlanningPromotionRepairGuidanceSchema
>;

export interface SupersPlanningPromotionFileSystem {
  readTextFile(path: string): Promise<string | null>;
  writeTextFileAtomic(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

export interface SupersPlanningPromotionDexAdapter {
  applyApprovedPlan(
    repoDir: string,
    plan: DexApprovedPlan,
    transactionId: string,
    lease: DexRepositoryLockLease | undefined,
  ): Promise<DexPlanApplyResult>;
  verifyApprovedPlan(
    repoDir: string,
    plan: DexApprovedPlan,
    expectedResult: DexPlanApplyResult,
    lease: DexRepositoryLockLease | undefined,
  ): Promise<DexPlanApplyResult>;
}

export type SupersPlanningPromotionDependencies = {
  fileSystem?: SupersPlanningPromotionFileSystem;
  dexAdapter?: SupersPlanningPromotionDexAdapter;
  repositoryLock?: DexRepositoryLock;
};

export type SupersPlanningPromotionErrorCode =
  | "invalid-path"
  | "invalid-revision"
  | "stale-source"
  | "stale-destination"
  | "stale-index"
  | "stale-dex"
  | "stale-approval"
  | "dex-adapter-required"
  | "dex-application-failed"
  | "dex-verification-failed"
  | "journal-conflict"
  | "journal-invalid"
  | "conflicting-paths";

function repairGuidanceForError(
  errorCode: SupersPlanningPromotionErrorCode,
): SupersPlanningPromotionRepairGuidance {
  switch (errorCode) {
    case "stale-source":
      return "inspect-source-drift";
    case "stale-destination":
      return "inspect-destination-drift";
    case "stale-index":
      return "inspect-index-drift";
    case "stale-dex":
    case "dex-verification-failed":
      return "inspect-dex-drift";
    case "stale-approval":
      return "request-fresh-approval";
    case "invalid-path":
    case "invalid-revision":
    case "conflicting-paths":
    case "dex-adapter-required":
      return "request-corrected-payload";
    case "journal-conflict":
    case "journal-invalid":
      return "repair-journal";
    case "dex-application-failed":
      return "retry-same-payload";
  }
}

export class SupersPlanningPromotionError extends Error {
  readonly repairGuidance: SupersPlanningPromotionRepairGuidance;
  authorityState:
    | z.infer<typeof AuthorityStateSchema>
    | "unknown" = "unknown";
  cleanupDisposition:
    | z.infer<typeof CleanupDispositionSchema>
    | "unknown" = "unknown";

  constructor(
    readonly errorCode: SupersPlanningPromotionErrorCode,
    message: string,
    repairGuidance = repairGuidanceForError(errorCode),
  ) {
    super(message);
    this.name = "SupersPlanningPromotionError";
    this.repairGuidance = repairGuidance;
  }
}

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | {
  [key: string]: CanonicalJson;
};

function canonicalize(value: unknown): CanonicalJson {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot hash a non-finite number");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: { [key: string]: CanonicalJson } = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) result[key] = canonicalize(entry);
    }
    return result;
  }
  throw new Error("Cannot hash a non-JSON value");
}

/** SHA-256 over stable, recursively key-sorted JSON. */
export async function createSupersPlanningHash(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function approvalPayload(
  promotion: SupersPlanningPromotionApply | SupersPlanningPromotionPreview,
): CanonicalJson {
  return canonicalize({
    schemaVersion: promotion.schemaVersion,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    source: promotion.source,
    destination: promotion.destination,
    indexMutations: promotion.indexMutations,
    graph: promotion.graph,
  });
}

/** Digest the complete approved boundary, including revisions and Dex plan. */
export async function createSupersPlanningApprovalDigest(
  promotion: SupersPlanningPromotionApply | SupersPlanningPromotionPreview,
): Promise<string> {
  return await createSupersPlanningHash(approvalPayload(promotion));
}

/** Attach the reviewed approval digest without changing any previewed effect. */
export function createSupersPlanningApprovedPromotion(
  rawPreview: SupersPlanningPromotionPreview,
  approvalDigest: string | null,
): SupersPlanningPromotionApply {
  const preview = SupersPlanningPromotionPreviewSchema.parse(rawPreview);
  if (preview.operation === "capture-idea") {
    if (approvalDigest !== null) {
      throw new SupersPlanningPromotionError(
        "stale-approval",
        "Idea capture cannot carry graduation approval",
      );
    }
    return SupersPlanningPromotionApplySchema.parse({
      ...preview,
      decision: "apply",
      approval: null,
    });
  }
  if (approvalDigest === null) {
    throw new SupersPlanningPromotionError(
      "stale-approval",
      "Planning graduation requires the reviewed bundle digest",
    );
  }
  return SupersPlanningPromotionApplySchema.parse({
    ...preview,
    decision: "apply",
    approval: { digest: approvalDigest },
  });
}

async function createLegacySupersPlanningApprovalDigest(
  promotion: SupersPlanningPromotionApply,
): Promise<string> {
  return await createSupersPlanningHash({
    schemaVersion: 1,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    source: promotion.source,
    destination: promotion.destination,
    indexMutations: promotion.indexMutations,
    graph: promotion.graph,
  });
}

/** Stable operation identity; changed content under this key is a conflict. */
export async function createSupersPlanningIdempotencyKey(
  planningItemId: string,
  operation: z.infer<typeof PromotionOperationSchema>,
): Promise<string> {
  return await createSupersPlanningHash({
    namespace: "supers-planning-promotion",
    version: 2,
    planningItemId,
    operation,
  });
}

async function createPromotionHashes(
  promotion: SupersPlanningPromotionApply,
  promotionDigest: string,
): Promise<z.infer<typeof PromotionHashesSchema>> {
  return PromotionHashesSchema.parse({
    promotionDigest,
    sourceRevision: promotion.source?.expectedRevision ?? null,
    destinationRevision: promotion.destination?.revision ?? null,
    indexMutationsDigest: await createSupersPlanningHash(
      promotion.indexMutations,
    ),
    dexPlanDigest: promotion.graph === null
      ? null
      : await createSupersPlanningHash(promotion.graph),
  });
}

function safeRelativePath(path: string): string {
  if (
    path.startsWith("/") || path.includes("\\") || path.includes("\0") ||
    path.split("/").some((segment) =>
      segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new SupersPlanningPromotionError(
      "invalid-path",
      `Unsafe repository path: ${path}`,
    );
  }
  return path;
}

function repositoryPath(repoDir: string, relativePath: string): string {
  const safe = safeRelativePath(relativePath);
  const root = repoDir.replace(/\/+$/, "");
  return `${root}/${safe}`;
}

function assertDistinctPromotionPaths(
  promotion: SupersPlanningPromotionApply,
): void {
  const roles: Array<{ path: string; role: string }> = [];
  if (promotion.source !== null) {
    roles.push({
      path: safeRelativePath(promotion.source.path),
      role: "source",
    });
  }
  if (promotion.destination !== null) {
    roles.push({
      path: safeRelativePath(promotion.destination.path),
      role: "destination",
    });
  }
  for (const [index, mutation] of promotion.indexMutations.entries()) {
    roles.push({
      path: safeRelativePath(mutation.path),
      role: `index mutation ${index}`,
    });
  }
  const firstRoleByPath = new Map<string, string>();
  for (const entry of roles) {
    const firstRole = firstRoleByPath.get(entry.path);
    if (firstRole !== undefined) {
      throw new SupersPlanningPromotionError(
        "conflicting-paths",
        `Promotion path ${entry.path} is used by both ${firstRole} and ${entry.role}`,
      );
    }
    firstRoleByPath.set(entry.path, entry.role);
  }
}

async function textRevision(content: string): Promise<string> {
  return await createSupersPlanningHash(content);
}

async function assertDeclaredRevision(
  write: z.infer<typeof SupersPlanningDocumentWriteSchema>,
): Promise<void> {
  if (await textRevision(write.content) !== write.revision) {
    throw new SupersPlanningPromotionError(
      "invalid-revision",
      `Declared revision does not match content for ${write.path}`,
    );
  }
}

async function currentRevision(
  fileSystem: SupersPlanningPromotionFileSystem,
  path: string,
): Promise<string | null> {
  const content = await fileSystem.readTextFile(path);
  return content === null ? null : await textRevision(content);
}

function journalPath(repoDir: string, idempotencyKey: string): string {
  return repositoryPath(repoDir, `${JOURNAL_DIRECTORY}/${idempotencyKey}.json`);
}

function legacyJournalPath(repoDir: string, transactionId: string): string {
  return repositoryPath(repoDir, `${JOURNAL_DIRECTORY}/${transactionId}.json`);
}

async function writeJournal(
  fileSystem: SupersPlanningPromotionFileSystem,
  path: string,
  journal: SupersPlanningPromotionJournal,
): Promise<SupersPlanningPromotionJournal> {
  const parsed = SupersPlanningPromotionJournalSchema.parse(journal);
  await fileSystem.writeTextFileAtomic(path, `${JSON.stringify(parsed)}\n`);
  return parsed;
}

function stateAtLeast(
  state: SupersPlanningPromotionJournal["state"],
  expected: SupersPlanningPromotionJournal["state"],
): boolean {
  return JournalStateSchema.options.indexOf(state) >=
    JournalStateSchema.options.indexOf(expected);
}

function initialAuthorityState(
  promotion: SupersPlanningPromotionApply,
): SupersPlanningPromotionJournal["authorityState"] {
  return promotion.source === null ? "uncommitted" : "source-authoritative";
}

function committedAuthorityState(
  promotion: SupersPlanningPromotionApply,
): "destination-authoritative" | "dex-authoritative" {
  return promotion.operation === "planning-to-dex"
    ? "dex-authoritative"
    : "destination-authoritative";
}

function initialCleanupDisposition(
  promotion: SupersPlanningPromotionApply,
): SupersPlanningPromotionJournal["cleanupDisposition"] {
  return promotion.source === null ? "not-required" : "pending";
}

function sourcePostimageRevision(
  source: z.infer<typeof SupersPlanningDocumentCleanupSchema>,
): string | null {
  return "content" in source ? source.revision : null;
}

async function assertSourceState(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
  expectedState: "preimage" | "preimage-or-postimage" | "postimage",
): Promise<void> {
  if (promotion.source === null) return;
  if ("content" in promotion.source) {
    await assertDeclaredRevision(promotion.source);
  }
  const revision = await currentRevision(
    fileSystem,
    repositoryPath(repoDir, promotion.source.path),
  );
  const postimageRevision = sourcePostimageRevision(promotion.source);
  const valid = expectedState === "preimage"
    ? revision === promotion.source.expectedRevision
    : expectedState === "preimage-or-postimage"
    ? revision === promotion.source.expectedRevision ||
      revision === postimageRevision
    : revision === postimageRevision;
  if (!valid) {
    throw new SupersPlanningPromotionError(
      "stale-source",
      `Source state changed: ${promotion.source.path}`,
    );
  }
}

async function assertDocumentDestinationState(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
  requirePostimage: boolean,
): Promise<void> {
  if (promotion.destination === null) return;
  await assertDeclaredRevision(promotion.destination);
  const revision = await currentRevision(
    fileSystem,
    repositoryPath(repoDir, promotion.destination.path),
  );
  const valid = requirePostimage
    ? revision === promotion.destination.revision
    : revision === promotion.destination.expectedRevision ||
      revision === promotion.destination.revision;
  if (!valid) {
    throw new SupersPlanningPromotionError(
      "stale-destination",
      `Destination revision changed: ${promotion.destination.path}`,
    );
  }
}

async function assertIndexStates(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
  requirePostimage: boolean,
): Promise<void> {
  for (const mutation of promotion.indexMutations) {
    const revision = await currentRevision(
      fileSystem,
      repositoryPath(repoDir, mutation.path),
    );
    if (mutation.action === "write") {
      await assertDeclaredRevision(mutation);
      const valid = requirePostimage
        ? revision === mutation.revision
        : revision === mutation.expectedRevision ||
          revision === mutation.revision;
      if (!valid) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index revision changed: ${mutation.path}`,
        );
      }
    } else {
      const valid = requirePostimage
        ? revision === null
        : revision === mutation.expectedRevision || revision === null;
      if (!valid) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index revision changed: ${mutation.path}`,
        );
      }
    }
  }
}

async function validateRepositorySnapshot(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
  state: SupersPlanningPromotionJournal["state"],
): Promise<void> {
  await assertSourceState(
    promotion,
    fileSystem,
    repoDir,
    stateAtLeast(state, "source-cleaned")
      ? "postimage"
      : stateAtLeast(state, "committed")
      ? "preimage-or-postimage"
      : "preimage",
  );
  await assertDocumentDestinationState(
    promotion,
    fileSystem,
    repoDir,
    stateAtLeast(state, "destination-written"),
  );
  await assertIndexStates(
    promotion,
    fileSystem,
    repoDir,
    stateAtLeast(state, "committed"),
  );
}

async function applyIndexMutations(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
): Promise<void> {
  for (const mutation of promotion.indexMutations) {
    const path = repositoryPath(repoDir, mutation.path);
    const revision = await currentRevision(fileSystem, path);
    if (mutation.action === "write") {
      if (
        revision !== mutation.expectedRevision && revision !== mutation.revision
      ) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index changed before recovery: ${mutation.path}`,
        );
      }
      if (revision !== mutation.revision) {
        await fileSystem.writeTextFileAtomic(path, mutation.content);
      }
    } else {
      if (revision !== mutation.expectedRevision && revision !== null) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index changed before recovery: ${mutation.path}`,
        );
      }
      if (revision !== null) await fileSystem.removeFile(path);
    }
  }
  await assertIndexStates(promotion, fileSystem, repoDir, true);
}

async function createDenoFileSystem(
  repoDir: string,
): Promise<SupersPlanningPromotionFileSystem> {
  const requestedRoot = repoDir.replace(/\/+$/, "");
  const canonicalRoot = await Deno.realPath(repoDir);

  function canonicalRepositoryPath(path: string): string {
    const relative = path === requestedRoot
      ? ""
      : path.startsWith(`${requestedRoot}/`)
      ? path.slice(requestedRoot.length + 1)
      : null;
    if (
      relative === null ||
      relative.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      throw new SupersPlanningPromotionError(
        "invalid-path",
        "Path escapes repository root",
      );
    }
    const target = relative.length === 0
      ? canonicalRoot
      : `${canonicalRoot}/${relative}`;
    if (!(target === canonicalRoot || target.startsWith(`${canonicalRoot}/`))) {
      throw new SupersPlanningPromotionError(
        "invalid-path",
        "Path escapes repository root",
      );
    }
    return target;
  }

  async function verifyPath(
    path: string,
    allowMissingLeaf: boolean,
  ): Promise<string> {
    const target = canonicalRepositoryPath(path);
    const relative = target === canonicalRoot
      ? ""
      : target.slice(canonicalRoot.length + 1);
    const segments = relative.length === 0 ? [] : relative.split("/");
    const verifiedSegments = allowMissingLeaf
      ? segments.slice(0, -1)
      : segments;
    let cursor = canonicalRoot;
    for (const segment of verifiedSegments) {
      cursor = `${cursor}/${segment}`;
      try {
        const info = await Deno.lstat(cursor);
        if (info.isSymlink) {
          throw new SupersPlanningPromotionError(
            "invalid-path",
            "Symlinked promotion paths are forbidden",
          );
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) break;
        throw error;
      }
    }
    return target;
  }

  async function syncDirectory(path: string): Promise<void> {
    const directory = await Deno.open(path, { read: true });
    try {
      await directory.sync();
    } finally {
      directory.close();
    }
  }

  return {
    readTextFile: async (path): Promise<string | null> => {
      const target = await verifyPath(path, true);
      try {
        const info = await Deno.lstat(target);
        if (!info.isFile || info.isSymlink) {
          throw new SupersPlanningPromotionError(
            "invalid-path",
            "Promotion source must be a regular file",
          );
        }
        return await Deno.readTextFile(target);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
      }
    },
    writeTextFileAtomic: async (path, content): Promise<void> => {
      const target = await verifyPath(path, true);
      const slash = target.lastIndexOf("/");
      const parent = target.slice(0, slash);
      await Deno.mkdir(parent, { recursive: true });
      await verifyPath(path, true);
      const temporary = `${target}.tmp-${crypto.randomUUID()}`;
      const file = await Deno.open(temporary, {
        createNew: true,
        read: true,
        write: true,
        mode: 0o600,
      });
      try {
        const bytes = new TextEncoder().encode(content);
        let offset = 0;
        while (offset < bytes.length) {
          offset += await file.write(bytes.subarray(offset));
        }
        await file.sync();
      } finally {
        file.close();
      }
      try {
        await Deno.rename(temporary, target);
        await syncDirectory(parent);
      } catch (error) {
        await Deno.remove(temporary).catch(() => undefined);
        throw error;
      }
    },
    removeFile: async (path): Promise<void> => {
      const target = await verifyPath(path, false);
      const parent = target.slice(0, target.lastIndexOf("/"));
      try {
        await Deno.remove(target);
        await syncDirectory(parent);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    },
  };
}

const LegacyDexApplyResultSchema = z.strictObject({
  taskIdsByClientRef: z.record(z.string(), z.string().min(1).max(128)),
});
const LegacyJournalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  transactionId: RevisionSchema,
  approvalDigest: RevisionSchema,
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  state: JournalStateSchema,
  dexResult: LegacyDexApplyResultSchema.nullable(),
});

async function readOrCreateJournal(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
  transactionId: string,
  idempotencyKey: string,
  approvalDigest: string,
  legacyApprovalDigest: string,
  legacyTransactionId: string,
  hashes: z.infer<typeof PromotionHashesSchema>,
): Promise<{ path: string; journal: SupersPlanningPromotionJournal }> {
  const path = journalPath(repoDir, idempotencyKey);
  let content = await fileSystem.readTextFile(path);
  let legacy = false;
  if (content === null) {
    const candidates = new Set([
      legacyJournalPath(repoDir, transactionId),
      legacyJournalPath(repoDir, legacyTransactionId),
    ]);
    candidates.delete(path);
    for (const candidate of candidates) {
      content = await fileSystem.readTextFile(candidate);
      if (content !== null) {
        legacy = true;
        break;
      }
    }
  }

  if (content === null) {
    await validateRepositorySnapshot(
      promotion,
      fileSystem,
      repoDir,
      "prepared",
    );
    const journal = await writeJournal(fileSystem, path, {
      schemaVersion: 2,
      transactionId,
      idempotencyKey,
      approvalDigest,
      planningItemId: promotion.planningItemId,
      operation: promotion.operation,
      state: "prepared",
      authorityState: initialAuthorityState(promotion),
      cleanupDisposition: initialCleanupDisposition(promotion),
      repairGuidance: "retry-same-payload",
      hashes,
      dexResult: null,
      auditReceiptDigest: null,
      lastFailure: null,
    });
    return { path, journal };
  }

  let journal: SupersPlanningPromotionJournal;
  try {
    const current = SupersPlanningPromotionJournalSchema.safeParse(
      JSON.parse(content),
    );
    if (current.success) {
      journal = current.data;
    } else {
      const previous = LegacyJournalSchema.parse(JSON.parse(content));
      if (
        previous.transactionId !== legacyTransactionId ||
        previous.approvalDigest !== legacyApprovalDigest ||
        previous.planningItemId !== promotion.planningItemId ||
        previous.operation !== promotion.operation
      ) {
        throw new SupersPlanningPromotionError(
          "journal-conflict",
          "Legacy promotion journal does not match the current stable identity",
        );
      }
      if (previous.dexResult !== null) {
        throw new SupersPlanningPromotionError(
          "journal-conflict",
          "A legacy Dex promotion journal requires manual recovery",
        );
      }
      journal = SupersPlanningPromotionJournalSchema.parse({
        schemaVersion: 2,
        transactionId,
        idempotencyKey,
        approvalDigest,
        planningItemId: previous.planningItemId,
        operation: previous.operation,
        state: previous.state,
        authorityState: stateAtLeast(previous.state, "committed")
          ? committedAuthorityState(promotion)
          : initialAuthorityState(promotion),
        cleanupDisposition: promotion.source === null
          ? "not-required"
          : stateAtLeast(previous.state, "source-cleaned")
          ? "completed"
          : "pending",
        repairGuidance: previous.state === "audited"
          ? "none"
          : "retry-same-payload",
        hashes,
        dexResult: null,
        auditReceiptDigest: null,
        lastFailure: null,
      });
    }
  } catch (error) {
    if (error instanceof SupersPlanningPromotionError) throw error;
    throw new SupersPlanningPromotionError(
      "journal-invalid",
      "Promotion journal is malformed",
    );
  }

  if (
    journal.transactionId !== transactionId ||
    journal.idempotencyKey !== idempotencyKey ||
    journal.approvalDigest !== approvalDigest ||
    journal.operation !== promotion.operation ||
    journal.planningItemId !== promotion.planningItemId ||
    journal.hashes.promotionDigest !== hashes.promotionDigest
  ) {
    const conflict = new SupersPlanningPromotionError(
      "journal-conflict",
      "Stable promotion identity was already used with different content",
    );
    conflict.authorityState = journal.authorityState;
    conflict.cleanupDisposition = journal.cleanupDisposition;
    throw conflict;
  }
  try {
    if (legacy) journal = await writeJournal(fileSystem, path, journal);
    await validateRepositorySnapshot(
      promotion,
      fileSystem,
      repoDir,
      journal.state,
    );
  } catch (error) {
    const normalized = error instanceof SupersPlanningPromotionError
      ? error
      : new SupersPlanningPromotionError(
        "journal-invalid",
        "Promotion journal recovery could not be persisted",
      );
    normalized.authorityState = journal.authorityState;
    normalized.cleanupDisposition = journal.cleanupDisposition;
    throw normalized;
  }
  return { path, journal };
}

async function createAppliedAuditReceipt(
  journal: SupersPlanningPromotionJournal,
): Promise<z.infer<typeof AppliedAuditReceiptSchema>> {
  const sourceCleanedJournal = SupersPlanningPromotionJournalSchema.parse({
    ...journal,
    state: "source-cleaned",
    repairGuidance: "retry-same-payload",
    auditReceiptDigest: null,
    lastFailure: null,
  });
  const payload = {
    schemaVersion: 1 as const,
    planningItemId: journal.planningItemId,
    operation: journal.operation,
    status: "audited" as const,
    transactionId: journal.transactionId,
    idempotencyKey: journal.idempotencyKey,
    approvalDigest: journal.operation === "capture-idea"
      ? null
      : journal.approvalDigest,
    journalDigest: await createSupersPlanningHash(sourceCleanedJournal),
    decisionDigest: null,
    authorityState: journal.authorityState === "dex-authoritative"
      ? "dex-authoritative" as const
      : "destination-authoritative" as const,
    cleanupDisposition: journal.cleanupDisposition === "completed"
      ? "completed" as const
      : "not-required" as const,
    repairGuidance: "none" as const,
    hashes: journal.hashes,
    dexResult: journal.dexResult,
  };
  return AppliedAuditReceiptSchema.parse({
    ...payload,
    receiptId: await createSupersPlanningHash(payload),
  });
}

async function createNoOpResult(
  promotion: z.infer<typeof NoOpPromotionSchema>,
): Promise<SupersPlanningPromotionResult> {
  const status = promotion.decision === "reject" ? "rejected" : "parked";
  const decisionDigest = await createSupersPlanningHash(promotion);
  const receiptPayload = {
    schemaVersion: 1 as const,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    status,
    transactionId: null,
    idempotencyKey: null,
    approvalDigest: null,
    journalDigest: null,
    decisionDigest,
    authorityState: "unchanged" as const,
    cleanupDisposition: "not-required" as const,
    repairGuidance: "none" as const,
    hashes: null,
    dexResult: null,
  };
  const auditReceipt = SupersPlanningPromotionAuditReceiptSchema.parse({
    ...receiptPayload,
    receiptId: await createSupersPlanningHash(receiptPayload),
  });
  return SupersPlanningPromotionResultSchema.parse({
    schemaVersion: 2,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    status,
    transactionId: null,
    idempotencyKey: null,
    approvalDigest: null,
    authorityState: "unchanged",
    cleanupDisposition: "not-required",
    repairGuidance: "none",
    hashes: null,
    dexResult: null,
    auditReceipt,
  });
}

function sameDexResult(
  left: DexPlanApplyResult,
  right: DexPlanApplyResult,
): boolean {
  return JSON.stringify(canonicalize(left)) ===
    JSON.stringify(canonicalize(right));
}

function normalizeDexFailure(
  error: unknown,
  phase: "application" | "verification",
): SupersPlanningPromotionError {
  if (error instanceof SupersPlanningPromotionError) return error;
  const repairGuidance = error instanceof DexPlanApplierError &&
      error.retryDisposition !== "retry"
    ? "inspect-dex-drift"
    : phase === "application"
    ? "retry-same-payload"
    : "inspect-dex-drift";
  return new SupersPlanningPromotionError(
    phase === "application"
      ? "dex-application-failed"
      : "dex-verification-failed",
    phase === "application"
      ? "Dex plan application did not reach a verified destination"
      : "Dex plan verification did not confirm the approved graph",
    repairGuidance,
  );
}

async function recordJournalFailure(
  fileSystem: SupersPlanningPromotionFileSystem,
  path: string,
  journal: SupersPlanningPromotionJournal,
  error: SupersPlanningPromotionError,
): Promise<void> {
  if (journal.state === "audited") return;
  await writeJournal(fileSystem, path, {
    ...journal,
    repairGuidance: error.repairGuidance,
    lastFailure: {
      errorCode: error.errorCode,
      repairGuidance: error.repairGuidance,
    },
  });
}

async function executeLockedPromotion(
  promotion: SupersPlanningPromotionApply,
  repoDir: string,
  fileSystem: SupersPlanningPromotionFileSystem,
  dexAdapter: SupersPlanningPromotionDexAdapter | undefined,
  lease: DexRepositoryLockLease | undefined,
): Promise<SupersPlanningPromotionResult> {
  assertDistinctPromotionPaths(promotion);
  const approvalDigest = await createSupersPlanningApprovalDigest(promotion);
  if (
    promotion.operation !== "capture-idea" &&
    promotion.approval.digest !== approvalDigest
  ) {
    throw new SupersPlanningPromotionError(
      "stale-approval",
      "Approval does not bind the current promotion payload",
    );
  }
  if (promotion.operation === "planning-to-dex" && dexAdapter === undefined) {
    throw new SupersPlanningPromotionError(
      "dex-adapter-required",
      "planning-to-dex requires the existing Dex Plan Applier adapter",
    );
  }

  const idempotencyKey = await createSupersPlanningIdempotencyKey(
    promotion.planningItemId,
    promotion.operation,
  );
  const transactionId = await createSupersPlanningHash({
    planningItemId: promotion.planningItemId,
    approvalDigest,
  });
  const legacyApprovalDigest = await createLegacySupersPlanningApprovalDigest(
    promotion,
  );
  const legacyTransactionId = await createSupersPlanningHash({
    planningItemId: promotion.planningItemId,
    approvalDigest: legacyApprovalDigest,
  });
  const hashes = await createPromotionHashes(promotion, approvalDigest);
  const loaded = await readOrCreateJournal(
    promotion,
    fileSystem,
    repoDir,
    transactionId,
    idempotencyKey,
    approvalDigest,
    legacyApprovalDigest,
    legacyTransactionId,
    hashes,
  );
  let journal = loaded.journal;
  let verifiedDexResult: DexPlanApplyResult | null = null;

  const verifyDestinationPostimage = async (): Promise<void> => {
    if (promotion.destination !== null) {
      await assertDocumentDestinationState(
        promotion,
        fileSystem,
        repoDir,
        true,
      );
      return;
    }
    if (journal.dexResult === null || dexAdapter === undefined) {
      throw new SupersPlanningPromotionError(
        "dex-verification-failed",
        "Dex destination has no durable result mapping",
      );
    }
    if (verifiedDexResult !== null) {
      if (!sameDexResult(verifiedDexResult, journal.dexResult)) {
        throw new SupersPlanningPromotionError(
          "stale-dex",
          "Dex destination mapping changed during promotion",
        );
      }
      return;
    }
    try {
      verifiedDexResult = await dexAdapter.verifyApprovedPlan(
        repoDir,
        promotion.graph,
        journal.dexResult,
        lease,
      );
    } catch (error) {
      throw normalizeDexFailure(error, "verification");
    }
    if (!sameDexResult(verifiedDexResult, journal.dexResult)) {
      throw new SupersPlanningPromotionError(
        "stale-dex",
        "Dex destination no longer matches the approved result mapping",
      );
    }
  };

  try {
    if (!stateAtLeast(journal.state, "destination-written")) {
      if (promotion.destination !== null) {
        await assertDocumentDestinationState(
          promotion,
          fileSystem,
          repoDir,
          false,
        );
        const destination = repositoryPath(
          repoDir,
          promotion.destination.path,
        );
        if (
          await currentRevision(fileSystem, destination) !==
            promotion.destination.revision
        ) {
          await fileSystem.writeTextFileAtomic(
            destination,
            promotion.destination.content,
          );
        }
      } else {
        if (dexAdapter === undefined) {
          throw new SupersPlanningPromotionError(
            "dex-adapter-required",
            "planning-to-dex requires the existing Dex Plan Applier adapter",
          );
        }
        try {
          journal = {
            ...journal,
            dexResult: await dexAdapter.applyApprovedPlan(
              repoDir,
              promotion.graph,
              transactionId,
              lease,
            ),
          };
        } catch (error) {
          throw normalizeDexFailure(error, "application");
        }
      }
      journal = await writeJournal(fileSystem, loaded.path, {
        ...journal,
        state: "destination-written",
        repairGuidance: "retry-same-payload",
        lastFailure: null,
      });
    }

    if (!stateAtLeast(journal.state, "destination-verified")) {
      await verifyDestinationPostimage();
      journal = await writeJournal(fileSystem, loaded.path, {
        ...journal,
        state: "destination-verified",
        repairGuidance: "retry-same-payload",
        lastFailure: null,
      });
    }

    if (!stateAtLeast(journal.state, "committed")) {
      await verifyDestinationPostimage();
      await applyIndexMutations(promotion, fileSystem, repoDir);
      await verifyDestinationPostimage();
      journal = await writeJournal(fileSystem, loaded.path, {
        ...journal,
        state: "committed",
        authorityState: committedAuthorityState(promotion),
        cleanupDisposition: initialCleanupDisposition(promotion),
        repairGuidance: "retry-same-payload",
        lastFailure: null,
      });
    }

    if (!stateAtLeast(journal.state, "source-cleaned")) {
      await verifyDestinationPostimage();
      await assertIndexStates(promotion, fileSystem, repoDir, true);
      if (promotion.source !== null) {
        const source = repositoryPath(repoDir, promotion.source.path);
        const revision = await currentRevision(fileSystem, source);
        const postimageRevision = sourcePostimageRevision(promotion.source);
        if (
          revision !== promotion.source.expectedRevision &&
          revision !== postimageRevision
        ) {
          throw new SupersPlanningPromotionError(
            "stale-source",
            "Source changed before cleanup",
          );
        }
        if (revision === promotion.source.expectedRevision) {
          if ("content" in promotion.source) {
            await assertDeclaredRevision(promotion.source);
            await fileSystem.writeTextFileAtomic(
              source,
              promotion.source.content,
            );
          } else {
            await fileSystem.removeFile(source);
          }
        }
        if (await currentRevision(fileSystem, source) !== postimageRevision) {
          throw new SupersPlanningPromotionError(
            "stale-source",
            "Source cleanup could not be verified",
          );
        }
      }
      journal = await writeJournal(fileSystem, loaded.path, {
        ...journal,
        state: "source-cleaned",
        cleanupDisposition: promotion.source === null
          ? "not-required"
          : "completed",
        repairGuidance: "retry-same-payload",
        lastFailure: null,
      });
    }

    await validateRepositorySnapshot(
      promotion,
      fileSystem,
      repoDir,
      "source-cleaned",
    );
    await verifyDestinationPostimage();
    await assertIndexStates(promotion, fileSystem, repoDir, true);
    const auditReceipt = await createAppliedAuditReceipt(journal);
    if (
      !stateAtLeast(journal.state, "audited") ||
      journal.auditReceiptDigest === null
    ) {
      journal = await writeJournal(fileSystem, loaded.path, {
        ...journal,
        state: "audited",
        repairGuidance: "none",
        auditReceiptDigest: auditReceipt.receiptId,
        lastFailure: null,
      });
    }
    if (journal.auditReceiptDigest !== auditReceipt.receiptId) {
      throw new SupersPlanningPromotionError(
        "journal-conflict",
        "Audit receipt does not match the durable promotion journal",
      );
    }

    return SupersPlanningPromotionResultSchema.parse({
      schemaVersion: 2,
      planningItemId: promotion.planningItemId,
      operation: promotion.operation,
      status: "audited",
      transactionId,
      idempotencyKey,
      approvalDigest: promotion.operation === "capture-idea"
        ? null
        : approvalDigest,
      authorityState: journal.authorityState,
      cleanupDisposition: journal.cleanupDisposition,
      repairGuidance: "none",
      hashes,
      dexResult: journal.dexResult,
      auditReceipt,
    });
  } catch (error) {
    const normalized = error instanceof SupersPlanningPromotionError
      ? error
      : new SupersPlanningPromotionError(
        "journal-invalid",
        "Promotion could not persist or recover its durable journal",
      );
    normalized.authorityState = journal.authorityState;
    normalized.cleanupDisposition = journal.cleanupDisposition;
    await recordJournalFailure(
      fileSystem,
      loaded.path,
      journal,
      normalized,
    ).catch(() => undefined);
    throw normalized;
  }
}

/** Apply or recover one planning promotion while holding the shared Dex lock. */
export async function executeSupersPlanningPromotion(
  rawArguments: SupersPlanningPromotionArguments,
  repoDir: string,
  dependencies: SupersPlanningPromotionDependencies = {},
): Promise<SupersPlanningPromotionResult> {
  const arguments_ = SupersPlanningPromotionArgumentsSchema.parse(rawArguments);
  if (arguments_.decision !== "apply") {
    return await createNoOpResult(arguments_);
  }

  const promotion = SupersPlanningPromotionApplySchema.parse(arguments_);
  // macOS may expose the same directory through `/var` and `/private/var`.
  const executionRepoDir = dependencies.fileSystem === undefined
    ? await Deno.realPath(repoDir)
    : repoDir;
  const fileSystem = dependencies.fileSystem ??
    await createDenoFileSystem(executionRepoDir);
  const lock = dependencies.repositoryLock ?? DEFAULT_DEX_REPOSITORY_LOCK;
  let committedResult: SupersPlanningPromotionResult | null = null;
  try {
    return await lock.runExclusive(
      executionRepoDir,
      async (lease) => {
        const result = await executeLockedPromotion(
          promotion,
          executionRepoDir,
          fileSystem,
          dependencies.dexAdapter,
          lease,
        );
        committedResult = result;
        return result;
      },
    );
  } catch (error) {
    // A cleanup error after the audited journal is durable cannot revoke the
    // already-committed authority result. An identical replay will verify it.
    if (committedResult !== null) return committedResult;
    throw error;
  }
}
