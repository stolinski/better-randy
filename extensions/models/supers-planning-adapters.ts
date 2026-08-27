/**
 * Read-only Supers adapters for the repository-neutral Dex Planning Factory.
 *
 * The collector is the only adapter that reads repository files or invokes
 * the official Dex CLI. Later adapters consume its stored source snapshot so
 * tracker matching and documentation policy never re-fetch known facts.
 */
import { z } from "npm:zod@4.4.3";

import {
  normalizeDexReviewedPlanForApplication,
} from "./dex-planning-factory-compiler.ts";
import {
  DexApprovedPlanSchema,
  DexPlanApplyCheckpointSchema,
  DexPlanApplyReceiptSchema,
  DexPlanApplyResultSchema,
} from "./dex-plan-applier-adapter.ts";
import { runBoundedDexProcess } from "./dex-bounded-process.ts";
import {
  createDexReadyLeafApprovalFingerprint,
  createDexReadyLeafAuthorizationSignature,
  DexReadyLeafApprovalSchema,
  DexReadyLeafClaimSchema,
} from "./dex-ready-leaf-handoff.ts";
import {
  SentryRepairIntentEnvelopeSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  createSupersPlanningApprovalDigest,
  createSupersPlanningHash,
  SupersPlanningPromotionAuditReceiptSchema,
  SupersPlanningPromotionPreviewSchema,
  SupersPlanningPromotionResultSchema,
} from "./supers-planning-promotion-applier.ts";
import {
  SupersPlanningPromotionReceiptResourceSchema,
} from "./supers-planning-promotion.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CLIENT_REF_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PLAN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_SOURCE_DOCUMENTS = 250;
const MAX_DEX_TASKS = 500;
const DEX_TASK_INVENTORY_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_CONTEXT_REFS = 75;
const MAX_RELATED_TASKS = 25;
const SUMMARY_MAX_LENGTH = 800;

const PlanningRunwaySchema = z.strictObject({
  activeLanes: z.array(z.strictObject({
    rootEpicId: z.string().min(1).max(128),
    activeTaskId: z.string().min(1).max(128),
    activeTaskName: z.string().min(1).max(51_200),
  })).max(MAX_DEX_TASKS),
  readyLanes: z.array(z.strictObject({
    rootEpicId: z.string().min(1).max(128),
    nextTaskId: z.string().min(1).max(128),
    nextTaskName: z.string().min(1).max(51_200),
    topPriority: z.number().int().min(0).max(100),
    readyLeafCount: z.number().int().min(1),
  })).max(MAX_DEX_TASKS),
  // Compatibility projections only; lane arrays are authoritative.
  activeTaskId: z.string().max(128),
  activeTaskName: z.string().max(51_200),
  activeEpicId: z.string().max(128),
  nextTaskId: z.string().max(128),
  nextTaskName: z.string().max(51_200),
  topPriority: z.number().int().min(-1).max(100),
  readyLeafCount: z.number().int().min(0),
});

const PlanningStateReferenceSchema = z.strictObject({
  dataReference: z.string().min(1),
  generatedAt: z.string().min(1),
  clean: z.boolean(),
  runway: PlanningRunwaySchema,
});

const SourceDocumentSchema = z.strictObject({
  path: z.string().min(1),
  revision: z.string().regex(SHA256_PATTERN),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
  status: z.string().min(1).max(300),
});

const RoadmapSourceSchema = SourceDocumentSchema.extend({
  sections: z.array(z.string().min(1).max(300)).max(100),
});

const DexTaskSnapshotSchema = z.strictObject({
  id: z.string().regex(TASK_ID_PATTERN).max(128),
  parentId: z.string().regex(TASK_ID_PATTERN).max(128).nullable(),
  name: z.string().min(1).max(51_200),
  description: z.string().max(51_200),
  priority: z.number().int().min(0).max(100),
  completed: z.boolean(),
  started: z.boolean(),
  blockedBy: z.array(z.string().regex(TASK_ID_PATTERN).max(128)).max(
    MAX_DEX_TASKS,
  ),
  blocks: z.array(z.string().regex(TASK_ID_PATTERN).max(128)).max(
    MAX_DEX_TASKS,
  ),
});

export const SupersPlanningSourceSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  objective: z.string().min(1).max(51_200),
  objectiveRevision: z.string().min(1).max(300),
  planningState: PlanningStateReferenceSchema,
  roadmap: RoadmapSourceSchema,
  adrIndex: SourceDocumentSchema,
  adrs: z.array(SourceDocumentSchema).max(MAX_SOURCE_DOCUMENTS),
  briefsIndex: SourceDocumentSchema,
  briefs: z.array(SourceDocumentSchema).max(MAX_SOURCE_DOCUMENTS),
  ideasIndex: SourceDocumentSchema,
  ideas: z.array(SourceDocumentSchema).max(MAX_SOURCE_DOCUMENTS),
  historyIndex: SourceDocumentSchema,
  history: z.array(SourceDocumentSchema).max(MAX_SOURCE_DOCUMENTS),
  currentStateDocuments: z.array(SourceDocumentSchema).max(10),
  dexTasks: z.array(DexTaskSnapshotSchema).max(MAX_DEX_TASKS),
  repairIntent: SentryRepairIntentEnvelopeSchema.nullable(),
  fingerprint: z.string().regex(SHA256_PATTERN),
});

const UnresolvedDecisionSchema = z.strictObject({
  id: z.string().min(1).max(120),
  question: z.string().min(1).max(2_000),
  reason: z.string().min(1).max(2_000),
});

export const SupersPlanningInventoryArgumentsSchema = z.strictObject({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  planningState: PlanningStateReferenceSchema,
  repairIntents: z.array(SentryRepairIntentEnvelopeSchema).max(1).default([]),
  unresolvedDecisions: z.array(UnresolvedDecisionSchema).max(20).default([]),
});

const PlanningContextReferenceSchema = z.strictObject({
  kind: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  reference: z.string().min(1).max(1_000),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

export const SupersPlanningInventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  objective: z.string().min(1).max(51_200),
  contextRefs: z.array(PlanningContextReferenceSchema).max(MAX_CONTEXT_REFS),
  unresolvedDecisions: z.array(UnresolvedDecisionSchema).max(20),
  clarificationRequired: z.boolean(),
  sourceSnapshotName: z.string().min(1).max(300),
  sourceSnapshotFingerprint: z.string().regex(SHA256_PATTERN),
  fingerprint: z.string().regex(SHA256_PATTERN),
});

export const SupersTrackerInventoryArgumentsSchema = z.strictObject({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  inventory: SupersPlanningInventorySchema,
  sourceSnapshot: SupersPlanningSourceSnapshotSchema,
});

const RelatedTaskSchema = z.strictObject({
  id: z.string().regex(TASK_ID_PATTERN).max(128),
  name: z.string().min(1).max(51_200),
  status: z.enum(["completed", "active", "ready", "blocked", "pending"]),
  relationship: z.enum([
    "current",
    "ancestor",
    "descendant",
    "dependency",
    "lexical-overlap",
  ]),
});

export const SupersTrackerInventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  relatedTasks: z.array(RelatedTaskSchema).max(MAX_RELATED_TASKS),
  duplicateRisk: z.boolean(),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
  sourceSnapshotFingerprint: z.string().regex(SHA256_PATTERN),
  planningInventoryFingerprint: z.string().regex(SHA256_PATTERN),
  fingerprint: z.string().regex(SHA256_PATTERN),
});

export const DocumentationDirectiveSchema = z.strictObject({
  operation: z.enum(["create", "update", "retire", "no-change"]),
  documentKind: z.enum([
    "roadmap",
    "adr",
    "brief",
    "idea",
    "history",
    "current-state",
  ]),
  target: z.string().min(1).max(500),
  rationale: z.string().min(1).max(2_000),
});

const DocumentationIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("ready"),
  objective: z.string().min(1).max(51_200),
  outcome: z.string().min(1).max(51_200),
  inScope: z.array(z.string().min(1)).max(250),
  outOfScope: z.array(z.string().min(1)).max(250),
  constraints: z.array(z.string().min(1)).max(250),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).max(250),
  tasteDecisions: z.array(z.string().min(1)).max(250),
  documentationDirectives: z.array(DocumentationDirectiveSchema).min(1).max(
    100,
  ),
  revision: z.number().int().min(1),
  summary: z.string().min(1).max(51_200),
});

export const SupersDocumentationEffectsArgumentsSchema = z.strictObject({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  inventory: SupersPlanningInventorySchema,
  trackerInventory: SupersTrackerInventorySchema,
  intent: DocumentationIntentSchema,
  sourceSnapshot: SupersPlanningSourceSnapshotSchema,
});

export const SupersDocumentationEffectsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  effects: z.array(DocumentationDirectiveSchema).min(1).max(100),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
  sourceSnapshotFingerprint: z.string().regex(SHA256_PATTERN),
  planningInventoryFingerprint: z.string().regex(SHA256_PATTERN),
  trackerInventoryFingerprint: z.string().regex(SHA256_PATTERN),
  intentFingerprint: z.string().regex(SHA256_PATTERN),
  fingerprint: z.string().regex(SHA256_PATTERN),
});

export type SupersPlanningSourceSnapshot = z.infer<
  typeof SupersPlanningSourceSnapshotSchema
>;
export type SupersPlanningInventoryArguments = z.infer<
  typeof SupersPlanningInventoryArgumentsSchema
>;
export type SupersPlanningInventory = z.infer<
  typeof SupersPlanningInventorySchema
>;
export type SupersTrackerInventoryArguments = z.infer<
  typeof SupersTrackerInventoryArgumentsSchema
>;
export type SupersTrackerInventory = z.infer<
  typeof SupersTrackerInventorySchema
>;
export type SupersDocumentationEffectsArguments = z.infer<
  typeof SupersDocumentationEffectsArgumentsSchema
>;
export type SupersDocumentationEffects = z.infer<
  typeof SupersDocumentationEffectsSchema
>;

const SupersReviewedCreateTaskSchema = z.strictObject({
  clientRef: z.string().regex(CLIENT_REF_PATTERN).max(64),
  name: z.string().min(1).max(51_200),
  description: z.string().min(1).max(51_200),
  priority: z.number().int().min(0).max(100),
  parentKind: z.enum(["root", "reference"]),
  parentClientRef: z.string().max(64),
  blockedBy: z.array(z.string().regex(CLIENT_REF_PATTERN).max(64)).max(250),
});
const SupersReviewedAttachmentSchema = z.strictObject({
  clientRef: z.string().regex(CLIENT_REF_PATTERN).max(64),
  selectorKind: z.enum(["id", "exactName"]),
  selectorValue: z.string().min(1).max(51_200),
  expectedName: z.string().min(1).max(51_200),
  expectedDescription: z.string().max(51_200),
  expectedPriority: z.number().int().min(0).max(100),
  parentKind: z.enum(["preserve", "root", "reference"]),
  parentClientRef: z.string().max(64),
  addBlockedBy: z.array(z.string().regex(CLIENT_REF_PATTERN).max(64)).max(250),
});
export const SupersReviewedPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planId: z.string().regex(PLAN_ID_PATTERN),
  createTasks: z.array(SupersReviewedCreateTaskSchema).max(250),
  attachExistingTasks: z.array(SupersReviewedAttachmentSchema).max(250),
});
export const SupersPlanningApplicationBundleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.enum([
    "capture-idea",
    "idea-to-roadmap",
    "roadmap-to-planning",
    "planning-to-dex",
  ]),
  approvalRequired: z.boolean(),
  expectsDexMappings: z.boolean(),
  payload: SupersPlanningPromotionPreviewSchema,
  payloadHash: z.string().regex(SHA256_PATTERN),
  sourceSnapshotFingerprint: z.string().regex(SHA256_PATTERN),
  documentationEffectsFingerprint: z.string().regex(SHA256_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

export const SupersPlanningApplicationBundleValidationArgumentsSchema = z
  .strictObject({
    workItem: z.string().regex(TASK_ID_PATTERN).max(128),
    inventory: SupersPlanningInventorySchema,
    trackerInventory: SupersTrackerInventorySchema,
    documentationEffects: SupersDocumentationEffectsSchema,
    reviewedPlan: SupersReviewedPlanSchema,
    applicationBundle: SupersPlanningApplicationBundleSchema,
    sourceSnapshot: SupersPlanningSourceSnapshotSchema,
  });

export const SupersPlanningApplicationBundleValidationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("validated"),
  kind: z.enum([
    "capture-idea",
    "idea-to-roadmap",
    "roadmap-to-planning",
    "planning-to-dex",
  ]),
  approvalRequired: z.boolean(),
  expectsDexMappings: z.boolean(),
  payloadHash: z.string().regex(SHA256_PATTERN),
  sourceSnapshotFingerprint: z.string().regex(SHA256_PATTERN),
  documentationEffectsFingerprint: z.string().regex(SHA256_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

export const SupersPlanBoundaryArgumentsSchema = z.strictObject({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  reviewedPlan: SupersReviewedPlanSchema,
  plan: DexApprovedPlanSchema,
  planningInventory: SupersPlanningInventorySchema,
  sourceSnapshot: SupersPlanningSourceSnapshotSchema,
});
export const SupersPlanBoundarySchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("matched"),
  planId: z.string().regex(PLAN_ID_PATTERN),
  reviewedPlanHash: z.string().regex(SHA256_PATTERN),
  applicationPlanHash: z.string().regex(SHA256_PATTERN),
  sentryRepairIntentFingerprint: z.string().regex(SHA256_PATTERN).nullable(),
});

export const SupersPlanApplicationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["succeeded", "failed"]),
  planId: z.string().regex(PLAN_ID_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  idempotencyKey: z.string().regex(SHA256_PATTERN),
  attempt: z.number().int().min(1),
  checkpointDataName: z.string().min(1),
  receiptDataName: z.string().min(1),
  resultDataName: z.string(),
  mappings: z.array(z.strictObject({
    clientRef: z.string().regex(CLIENT_REF_PATTERN).max(64),
    dexTaskId: z.string().regex(TASK_ID_PATTERN).max(128),
    disposition: z.enum(["created", "attachedExisting"]),
  })).max(250),
  retryDisposition: z.enum([
    "none",
    "retry",
    "do-not-retry",
    "manual-review",
  ]),
  errorCode: z.string(),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

export const SupersPlanApplicationNormalizationArgumentsSchema = z
  .strictObject({
    workItem: z.string().regex(TASK_ID_PATTERN).max(128),
    approvedPlan: DexApprovedPlanSchema,
    checkpoint: DexPlanApplyCheckpointSchema.nullable(),
    receipt: DexPlanApplyReceiptSchema,
    receiptDataName: z.string().min(1),
    result: DexPlanApplyResultSchema.nullable(),
    resultDataName: z.string(),
  });

export const SupersPromotionApplicationNormalizationArgumentsSchema = z
  .strictObject({
    workItem: z.string().regex(TASK_ID_PATTERN).max(128),
    reviewedPlan: SupersReviewedPlanSchema,
    applicationBundle: SupersPlanningApplicationBundleSchema,
    applicationBundleValidation:
      SupersPlanningApplicationBundleValidationSchema,
    promotionResult: SupersPlanningPromotionResultSchema.nullable(),
    promotionResultDataName: z.string(),
    promotionReceipt: SupersPlanningPromotionReceiptResourceSchema,
    promotionReceiptDataName: z.string().min(1),
  });

export const SupersPromotionApplicationAuditArgumentsSchema = z.strictObject({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  reviewedPlan: SupersReviewedPlanSchema,
  applicationBundle: SupersPlanningApplicationBundleSchema,
  applicationBundleValidation: SupersPlanningApplicationBundleValidationSchema,
  application: SupersPlanApplicationSchema,
  documentationEffects: SupersDocumentationEffectsSchema,
  promotionResult: SupersPlanningPromotionResultSchema,
  promotionReceipt: SupersPlanningPromotionAuditReceiptSchema,
});

export const SupersPlanningApplicationAuditArgumentsSchema = z.strictObject({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  approvedPlan: DexApprovedPlanSchema,
  application: SupersPlanApplicationSchema,
  documentationEffects: SupersDocumentationEffectsSchema,
});

export const SupersPlanningApplicationAuditSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["passed", "failed"]),
  planId: z.string().regex(PLAN_ID_PATTERN),
  verifiedTaskIds: z.array(z.string().regex(TASK_ID_PATTERN).max(128)).max(250),
  unresolvedIssues: z.array(z.string().min(1).max(500)).max(250),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

export const SupersPlanningHandoffSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["ready", "no-ready-work", "human-gate"]),
  planId: z.string().regex(PLAN_ID_PATTERN),
  candidateTaskId: z.string().regex(TASK_ID_PATTERN).max(128).optional(),
  approvedEpicTaskId: z.string().regex(TASK_ID_PATTERN).max(128).optional(),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
});

const SupersHandoffPlanSchema = z.union([
  SupersReviewedPlanSchema,
  DexApprovedPlanSchema,
]);

const SupersGraphProposalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  plan: SupersHandoffPlanSchema,
  planHash: z.string().regex(SHA256_PATTERN),
  documentationEffectsFingerprint: z.string().regex(SHA256_PATTERN),
  summary: z.string().min(1),
});

const SupersApprovedPlanArtifactSchema = z.strictObject({
  schemaVersion: z.literal(1),
  plan: SupersHandoffPlanSchema,
  planHash: z.string().regex(SHA256_PATTERN),
  proposalPlanHash: z.string().regex(SHA256_PATTERN),
  approvalGateId: z.string().min(1),
  summary: z.string().min(1),
});

const SupersPlanningHumanApprovalSchema = z.strictObject({
  gateId: z.string().min(1),
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  decision: z.literal("approved"),
  actor: z.string().min(1),
  note: z.string().max(2_000).optional(),
  stageId: z.literal("plan-review"),
  cycle: z.number().int().min(1),
  decidedAt: z.string().datetime(),
});

// Swamp includes evaluated global arguments during method validation; the outer
// schema strips that runtime field while every nested provenance object stays strict.
export const SupersDeliveryHandoffPreparationArgumentsSchema = z.object({
  planningWorkItem: z.string().regex(TASK_ID_PATTERN).max(128),
  proposalCycle: z.number().int().min(1),
  graphProposal: SupersGraphProposalSchema,
  approvedPlan: SupersApprovedPlanArtifactSchema,
  humanApproval: SupersPlanningHumanApprovalSchema,
  application: SupersPlanApplicationSchema,
  planningAudit: SupersPlanningApplicationAuditSchema,
  planningHandoff: SupersPlanningHandoffSchema,
});

export const SupersDeliveryHandoffApprovalSchema = DexReadyLeafApprovalSchema;

const DeliveryFactoryStateSchema = z.object({
  workItem: z.string().regex(TASK_ID_PATTERN).max(128),
  status: z.enum(["active", "terminal"]),
});

export const SupersDeliveryHandoffOutcomeArgumentsSchema = z.object({
  approval: SupersDeliveryHandoffApprovalSchema,
  claim: DexReadyLeafClaimSchema,
  factoryStates: z.array(DeliveryFactoryStateSchema).max(2),
});

export const SupersDeliveryHandoffOutcomeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["started", "resumed", "no-ready-work", "human-gate"]),
  planningWorkItem: z.string().regex(TASK_ID_PATTERN).max(128),
  planId: z.string().regex(PLAN_ID_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  approvalFingerprint: z.string().regex(SHA256_PATTERN),
  selectedTaskId: z.string().regex(TASK_ID_PATTERN).max(128).nullable(),
  claimStatus: z.enum(["claimed", "resumed", "no-ready-work", "human-gate"]),
  claimReason: z.string().min(1),
  factoryStatus: z.enum(["active", "terminal"]).nullable(),
  summary: z.string().min(1).max(SUMMARY_MAX_LENGTH),
  fingerprint: z.string().regex(SHA256_PATTERN),
});

export type SupersPlanningApplicationBundleValidationArguments = z.infer<
  typeof SupersPlanningApplicationBundleValidationArgumentsSchema
>;
export type SupersPlanningApplicationBundleValidation = z.infer<
  typeof SupersPlanningApplicationBundleValidationSchema
>;
export type SupersPromotionApplicationNormalizationArguments = z.infer<
  typeof SupersPromotionApplicationNormalizationArgumentsSchema
>;
export type SupersPromotionApplicationAuditArguments = z.infer<
  typeof SupersPromotionApplicationAuditArgumentsSchema
>;
export type SupersPlanApplicationNormalizationArguments = z.infer<
  typeof SupersPlanApplicationNormalizationArgumentsSchema
>;
export type SupersPlanApplication = z.infer<
  typeof SupersPlanApplicationSchema
>;
export type SupersPlanningApplicationAuditArguments = z.infer<
  typeof SupersPlanningApplicationAuditArgumentsSchema
>;
export type SupersPlanningApplicationAudit = z.infer<
  typeof SupersPlanningApplicationAuditSchema
>;
export type SupersDeliveryHandoffPreparationArguments = z.infer<
  typeof SupersDeliveryHandoffPreparationArgumentsSchema
>;
export type SupersDeliveryHandoffApproval = z.infer<
  typeof SupersDeliveryHandoffApprovalSchema
>;
export type SupersDeliveryHandoffOutcomeArguments = z.infer<
  typeof SupersDeliveryHandoffOutcomeArgumentsSchema
>;
export type SupersDeliveryHandoffOutcome = z.infer<
  typeof SupersDeliveryHandoffOutcomeSchema
>;

type MarkdownSources = Omit<
  SupersPlanningSourceSnapshot,
  | "schemaVersion"
  | "objective"
  | "objectiveRevision"
  | "planningState"
  | "dexTasks"
  | "repairIntent"
  | "fingerprint"
>;

type RawDexTask = {
  id?: unknown;
  parent_id?: unknown;
  parentId?: unknown;
  name?: unknown;
  description?: unknown;
  priority?: unknown;
  completed?: unknown;
  started_at?: unknown;
  startedAt?: unknown;
  blockedBy?: unknown;
  blocked_by?: unknown;
  blocks?: unknown;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const COMMON_TOKENS = new Set([
  "about",
  "after",
  "against",
  "build",
  "from",
  "have",
  "implement",
  "into",
  "planning",
  "provide",
  "repository",
  "supers",
  "that",
  "their",
  "these",
  "this",
  "through",
  "with",
]);

async function readRepositoryTextFile(
  repoDir: string,
  path: string,
): Promise<string> {
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    segments.some((segment) =>
      segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new Error(`Invalid planning source path: ${path}`);
  }
  try {
    const root = await Deno.realPath(repoDir);
    let parent = root;
    for (const segment of segments.slice(0, -1)) {
      parent = `${parent}/${segment}`;
      if ((await Deno.lstat(parent)).isSymlink) {
        throw new Error("symlink");
      }
    }
    const absolutePath = `${root}/${path}`;
    const info = await Deno.lstat(absolutePath);
    if (!info.isFile || info.isSymlink || info.size > 256 * 1024) {
      throw new Error("invalid file");
    }
    const realPath = await Deno.realPath(absolutePath);
    if (!realPath.startsWith(`${root}/`)) throw new Error("outside repository");
    return await Deno.readTextFile(realPath);
  } catch {
    throw new Error(`Could not read planning source: ${path}`);
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Immutable resource name for one work item and source fingerprint. */
export function supersPlanningSnapshotResourceName(
  workItem: string,
  fingerprint: string,
): string {
  return `supers-planning-source-snapshot-${workItem}-${fingerprint}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${
      entries.map(([key, item]) =>
        `${JSON.stringify(key)}:${canonicalJson(item)}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value);
}

async function assertContentFingerprint(
  value: { fingerprint: string } & Record<string, unknown>,
  label: string,
): Promise<void> {
  const { fingerprint, ...content } = value;
  if (await sha256Hex(canonicalJson(content)) !== fingerprint) {
    throw new Error(`${label} fingerprint does not match its content`);
  }
}

function boundedSummary(markdown: string): string {
  const paragraph = markdown
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s+.*$/gm, "").replace(/\s+/g, " ").trim())
    .find((part) => part.length > 0) ?? "Indexed planning document.";
  return paragraph.slice(0, SUMMARY_MAX_LENGTH);
}

function markdownTitle(markdown: string, fallback: string): string {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (title || fallback).slice(0, 300);
}

async function sourceDocumentFromMarkdown(
  path: string,
  markdown: string,
  status = "current",
  summaryOverride?: string,
): Promise<z.infer<typeof SourceDocumentSchema>> {
  return SourceDocumentSchema.parse({
    path,
    revision: await createSupersPlanningHash(markdown),
    title: markdownTitle(markdown, path),
    summary: (summaryOverride ?? boundedSummary(markdown)).slice(
      0,
      SUMMARY_MAX_LENGTH,
    ),
    status,
  });
}

async function sourceDocument(
  repoDir: string,
  path: string,
  status = "current",
  summaryOverride?: string,
): Promise<z.infer<typeof SourceDocumentSchema>> {
  return sourceDocumentFromMarkdown(
    path,
    await readRepositoryTextFile(repoDir, path),
    status,
    summaryOverride,
  );
}

async function markdownPaths(
  repoDir: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  try {
    for await (const entry of Deno.readDir(`${repoDir}/${folder}`)) {
      if (entry.isSymlink) throw new Error("symlink");
      if (entry.isFile && entry.name !== "README.md") {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(entry.name)) {
          throw new Error("invalid filename");
        }
        paths.push(`${folder}/${entry.name}`);
        if (paths.length > MAX_SOURCE_DOCUMENTS) {
          throw new Error("too many files");
        }
      }
    }
  } catch {
    throw new Error(`Could not read planning source folder: ${folder}`);
  }
  return paths.sort();
}

function parseAdrIndex(markdown: string): Array<{
  id: string;
  href: string;
  status: string;
  decision: string;
}> {
  const entries: Array<
    { id: string; href: string; status: string; decision: string }
  > = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(
      /^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/,
    );
    if (!match) continue;
    if (!/^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(match[2])) {
      throw new Error("ADR index contains an invalid planning source path");
    }
    entries.push({
      id: match[1],
      href: match[2],
      status: match[3].trim(),
      decision: match[4].trim(),
    });
  }
  return entries;
}

function parseIndexEntries(markdown: string): Array<{
  href: string;
  label: string;
  summary: string;
}> {
  const entries: Array<{ href: string; label: string; summary: string }> = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^- \[`?([^\]`]+)`?\]\(([^)]+)\)\s*[—-]\s*(.+)$/);
    if (!match) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(match[2])) {
      throw new Error("Planning index contains an invalid source path");
    }
    entries.push({ href: match[2], label: match[1], summary: match[3].trim() });
  }
  return entries;
}

/** Read the repository planning tiers once and retain content revisions. */
export async function readSupersPlanningMarkdownSources(
  repoDir: string,
): Promise<MarkdownSources> {
  const roadmapPath = "docs/roadmap.md";
  const roadmapMarkdown = await readRepositoryTextFile(repoDir, roadmapPath);
  const roadmapBase = await sourceDocumentFromMarkdown(
    roadmapPath,
    roadmapMarkdown,
  );
  const roadmap = RoadmapSourceSchema.parse({
    ...roadmapBase,
    sections: roadmapMarkdown
      .split("\n")
      .flatMap((line) => {
        const match = line.match(/^#{2,4}\s+(.+)$/);
        return match ? [match[1].trim().slice(0, 300)] : [];
      })
      .slice(0, 100),
  });

  const adrIndexPath = "docs/adr/README.md";
  const adrIndexMarkdown = await readRepositoryTextFile(repoDir, adrIndexPath);
  const adrIndex = await sourceDocumentFromMarkdown(
    adrIndexPath,
    adrIndexMarkdown,
  );
  const adrEntries = parseAdrIndex(adrIndexMarkdown);
  if (adrEntries.length > MAX_SOURCE_DOCUMENTS) {
    throw new Error("ADR index exceeds the planning source limit");
  }
  const adrs = await Promise.all(
    adrEntries.map((entry) =>
      sourceDocument(
        repoDir,
        `docs/adr/${entry.href}`,
        entry.status,
        entry.decision,
      )
    ),
  );

  const briefsIndexPath = "docs/briefs/README.md";
  const briefsIndex = await sourceDocument(repoDir, briefsIndexPath);
  const briefs = await Promise.all(
    (await markdownPaths(repoDir, "docs/briefs")).map((path) =>
      sourceDocument(repoDir, path, "active")
    ),
  );

  const ideasIndexPath = "docs/ideas/README.md";
  const ideasIndexMarkdown = await readRepositoryTextFile(
    repoDir,
    ideasIndexPath,
  );
  const ideasIndex = await sourceDocumentFromMarkdown(
    ideasIndexPath,
    ideasIndexMarkdown,
  );
  const ideaEntries = parseIndexEntries(ideasIndexMarkdown);
  if (ideaEntries.length > MAX_SOURCE_DOCUMENTS) {
    throw new Error("Ideas index exceeds the planning source limit");
  }
  const ideas = await Promise.all(
    ideaEntries.map((entry) =>
      sourceDocument(
        repoDir,
        `docs/ideas/${entry.href}`,
        "speculative",
        entry.summary,
      )
    ),
  );

  const historyIndexPath = "docs/history/README.md";
  const historyIndexMarkdown = await readRepositoryTextFile(
    repoDir,
    historyIndexPath,
  );
  const historyIndex = await sourceDocumentFromMarkdown(
    historyIndexPath,
    historyIndexMarkdown,
  );
  const historyEntries = parseIndexEntries(historyIndexMarkdown);
  if (historyEntries.length > MAX_SOURCE_DOCUMENTS) {
    throw new Error("History index exceeds the planning source limit");
  }
  const history = await Promise.all(
    historyEntries.map((entry) =>
      sourceDocument(
        repoDir,
        `docs/history/${entry.href}`,
        "historical",
        entry.summary,
      )
    ),
  );
  const currentStateDocuments = await Promise.all(
    [
      "docs/CONTEXT.md",
      "docs/preset-format.md",
      "docs/engine-architecture.md",
    ].map((path) => sourceDocument(repoDir, path, "current")),
  );

  return {
    roadmap,
    adrIndex,
    adrs: adrs.sort((left, right) => left.path.localeCompare(right.path)),
    briefsIndex,
    briefs: briefs.sort((left, right) => left.path.localeCompare(right.path)),
    ideasIndex,
    ideas: ideas.sort((left, right) => left.path.localeCompare(right.path)),
    historyIndex,
    history: history.sort((left, right) => left.path.localeCompare(right.path)),
    currentStateDocuments: currentStateDocuments.sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
  };
}

function taskStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Dex task ${field} must be an array of task IDs`);
  }
  return [...value].sort() as string[];
}

/** Normalize official `dex list --all --json` output into a strict snapshot. */
export function normalizeSupersDexTasks(
  value: unknown,
): Array<z.infer<typeof DexTaskSnapshotSchema>> {
  if (!Array.isArray(value)) {
    throw new Error("Dex task inventory was not an array");
  }
  return value.map((rawValue) => {
    const raw = rawValue as RawDexTask;
    return DexTaskSnapshotSchema.parse({
      id: raw.id,
      parentId: raw.parent_id ?? raw.parentId ?? null,
      name: raw.name,
      description: raw.description ?? "",
      priority: raw.priority,
      completed: raw.completed,
      started: (raw.started_at ?? raw.startedAt ?? null) !== null,
      blockedBy: taskStringArray(raw.blockedBy ?? raw.blocked_by, "blockedBy"),
      blocks: taskStringArray(raw.blocks, "blocks"),
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
}

/** Invoke only the official read-only Dex inventory command with hard bounds. */
export async function readSupersDexTaskSnapshot(
  repoDir: string,
): Promise<Array<z.infer<typeof DexTaskSnapshotSchema>>> {
  const output = await runBoundedDexProcess(
    repoDir,
    ["list", "--all", "--json"],
    null,
    {
      timeoutMs: 30_000,
      maxOutputBytes: DEX_TASK_INVENTORY_MAX_OUTPUT_BYTES,
    },
  );
  if (output.code !== 0) throw new Error("Dex planning inventory failed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(output.stdout)) as unknown;
  } catch {
    throw new Error("Dex planning inventory returned invalid JSON");
  }
  return normalizeSupersDexTasks(parsed);
}

/** Assemble and fingerprint the single source snapshot consumed by later adapters. */
export async function buildSupersPlanningSourceSnapshot(
  args: SupersPlanningInventoryArguments,
  markdown: MarkdownSources,
  dexTasks: Array<z.infer<typeof DexTaskSnapshotSchema>>,
): Promise<SupersPlanningSourceSnapshot> {
  const objectiveTask = dexTasks.find((task) => task.id === args.workItem);
  const repairIntent = args.repairIntents[0] ?? null;
  if (
    repairIntent !== null &&
    repairIntent.planningWorkItem !== args.workItem
  ) {
    throw new Error(
      "Sentry repair intent does not match the Planning work item",
    );
  }
  if (
    repairIntent !== null &&
    repairIntent.intent.queueIntent !== "confirmed-repair"
  ) {
    throw new Error(
      "Sentry reproduction intent cannot enter Planning before reproduction",
    );
  }
  // New-idea intake intentionally starts before an approved Dex graph exists.
  // Sentry repair intake supplies its exact typed objective; ordinary intake
  // continues to use the work-item slug until clarification enriches it.
  const objective = repairIntent !== null
    ? [
      `Repair ${repairIntent.intent.shortId}: ${repairIntent.intent.title}`,
      `Scope: ${repairIntent.intent.scope.join("; ")}`,
      `Acceptance: ${repairIntent.intent.acceptanceCriteria.join("; ")}`,
    ].join("\n")
    : objectiveTask
    ? objectiveTask.description.trim() || objectiveTask.name
    : args.workItem.replace(/[-_]+/g, " ").trim();
  const objectiveRevision = repairIntent !== null
    ? `sentry-repair:${repairIntent.fingerprint}`
    : objectiveTask
    ? `dex:${args.workItem}@sha256:${await sha256Hex(
      canonicalJson(objectiveTask),
    )}`
    : `intake:${args.workItem}@sha256:${await sha256Hex(
      canonicalJson({ workItem: args.workItem }),
    )}`;
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    objective,
    objectiveRevision,
    planningState: args.planningState,
    ...markdown,
    dexTasks,
    repairIntent,
  };
  return SupersPlanningSourceSnapshotSchema.parse({
    ...withoutFingerprint,
    fingerprint: await sha256Hex(canonicalJson(withoutFingerprint)),
  });
}

function tokens(value: string): Set<string> {
  return new Set(
    value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) =>
      token.length >= 4 && !COMMON_TOKENS.has(token)
    ) ?? [],
  );
}

function overlapScore(objectiveTokens: Set<string>, value: string): number {
  if (objectiveTokens.size === 0) return 0;
  const valueTokens = tokens(value);
  let matches = 0;
  for (const token of objectiveTokens) if (valueTokens.has(token)) matches += 1;
  return matches / objectiveTokens.size;
}

function contextReference(
  kind: string,
  source: z.infer<typeof SourceDocumentSchema>,
): z.infer<typeof PlanningContextReferenceSchema> {
  return PlanningContextReferenceSchema.parse({
    kind,
    name: source.title,
    reference: `${source.path}@sha256:${source.revision}`,
    summary: `${source.status}: ${source.summary}`.slice(0, SUMMARY_MAX_LENGTH),
  });
}

/** Derive the exact Planning Factory planning-inventory artifact. */
export async function deriveSupersPlanningInventory(
  args: SupersPlanningInventoryArguments,
  sourceSnapshot: SupersPlanningSourceSnapshot,
): Promise<SupersPlanningInventory> {
  const objectiveTokens = tokens(sourceSnapshot.objective);
  const relevant = [
    ...sourceSnapshot.adrs.map((source) => ({ kind: "adr", source })),
    ...sourceSnapshot.briefs.map((source) => ({ kind: "brief", source })),
    ...sourceSnapshot.ideas.map((source) => ({ kind: "idea", source })),
    ...sourceSnapshot.history.map((source) => ({ kind: "history", source })),
  ].map((entry) => ({
    ...entry,
    score: overlapScore(
      objectiveTokens,
      `${entry.source.title} ${entry.source.summary}`,
    ),
  })).filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      left.source.path.localeCompare(right.source.path)
    )
    .slice(0, 20);

  const repairIntentContext = sourceSnapshot.repairIntent === null
    ? []
    : [PlanningContextReferenceSchema.parse({
      kind: "sentry-repair-intent",
      name: sourceSnapshot.repairIntent.intent.shortId,
      reference:
        `swamp:data/supers-sentry-repair-planning-handoff/${sourceSnapshot.repairIntent.fingerprint}`,
      summary:
        `release=${sourceSnapshot.repairIntent.intent.currentRelease}; recommendation=${sourceSnapshot.repairIntent.intent.recommendation}; scope=${
          sourceSnapshot.repairIntent.intent.scope.join("; ")
        }`
          .slice(0, SUMMARY_MAX_LENGTH),
    })];
  const coreContextRefs = [
    ...repairIntentContext,
    contextReference("roadmap", sourceSnapshot.roadmap),
    contextReference("adr-index", sourceSnapshot.adrIndex),
    contextReference("briefs-index", sourceSnapshot.briefsIndex),
    contextReference("ideas-index", sourceSnapshot.ideasIndex),
    contextReference("history-index", sourceSnapshot.historyIndex),
    ...sourceSnapshot.currentStateDocuments.map((source) =>
      contextReference("current-state", source)
    ),
    PlanningContextReferenceSchema.parse({
      kind: "planning-runway",
      name: "planning-latest.runway",
      reference: sourceSnapshot.planningState.dataReference,
      summary: `active=${
        sourceSnapshot.planningState.runway.activeTaskId || "none"
      }; next=${
        sourceSnapshot.planningState.runway.nextTaskId || "none"
      }; ready=${sourceSnapshot.planningState.runway.readyLeafCount}; clean=${sourceSnapshot.planningState.clean}`,
    }),
    PlanningContextReferenceSchema.parse({
      kind: "dex-graph",
      name: "Dex task snapshot",
      reference: `swamp:data/repo-audit/${
        supersPlanningSnapshotResourceName(
          args.workItem,
          sourceSnapshot.fingerprint,
        )
      }`,
      summary: `${sourceSnapshot.dexTasks.length} official Dex task records; ${
        sourceSnapshot.dexTasks.filter((task) => !task.completed).length
      } open.`,
    }),
  ];
  const contextualRefs = [
    ...sourceSnapshot.briefs.map((source) =>
      contextReference("active-brief", source)
    ),
    ...relevant.map((entry) => contextReference(entry.kind, entry.source)),
  ];
  const uniqueContextualRefs = [...new Map(
    contextualRefs.map((reference) => [reference.reference, reference]),
  ).values()];
  const contextRefs = [
    ...coreContextRefs,
    ...uniqueContextualRefs.slice(0, MAX_CONTEXT_REFS - coreContextRefs.length),
  ];

  const withoutFingerprint = {
    schemaVersion: 1 as const,
    objective: sourceSnapshot.objective,
    contextRefs,
    unresolvedDecisions: args.unresolvedDecisions,
    clarificationRequired: args.unresolvedDecisions.length > 0,
    sourceSnapshotName: supersPlanningSnapshotResourceName(
      args.workItem,
      sourceSnapshot.fingerprint,
    ),
    sourceSnapshotFingerprint: sourceSnapshot.fingerprint,
  };
  return SupersPlanningInventorySchema.parse({
    ...withoutFingerprint,
    fingerprint: await sha256Hex(canonicalJson(withoutFingerprint)),
  });
}

function dexTaskStatus(
  task: z.infer<typeof DexTaskSnapshotSchema>,
): z.infer<typeof RelatedTaskSchema>["status"] {
  if (task.completed) return "completed";
  if (task.started) return "active";
  if (task.blockedBy.length > 0) return "blocked";
  return "ready";
}

function descendants(
  tasks: Array<z.infer<typeof DexTaskSnapshotSchema>>,
  workItem: string,
): Set<string> {
  const result = new Set<string>();
  const queue = [workItem];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const task of tasks) {
      if (task.parentId === parent && !result.has(task.id)) {
        result.add(task.id);
        queue.push(task.id);
      }
    }
  }
  return result;
}

function ancestors(
  tasks: Array<z.infer<typeof DexTaskSnapshotSchema>>,
  workItem: string,
): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const result = new Set<string>();
  let cursor = byId.get(workItem)?.parentId ?? null;
  while (cursor && !result.has(cursor)) {
    result.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return result;
}

/** Derive duplicate candidates from the stored Dex graph without another read. */
export async function deriveSupersTrackerInventory(
  args: SupersTrackerInventoryArguments,
): Promise<SupersTrackerInventory> {
  await assertContentFingerprint({ ...args.sourceSnapshot }, "Source snapshot");
  await assertContentFingerprint({ ...args.inventory }, "Planning inventory");
  const expectedSnapshotName = supersPlanningSnapshotResourceName(
    args.workItem,
    args.sourceSnapshot.fingerprint,
  );
  if (
    args.inventory.objective !== args.sourceSnapshot.objective ||
    args.inventory.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint ||
    args.inventory.sourceSnapshotName !== expectedSnapshotName
  ) {
    throw new Error(
      "Planning inventory does not match the stored source snapshot",
    );
  }
  const objectiveTokens = tokens(args.sourceSnapshot.objective);
  const ancestorIds = ancestors(args.sourceSnapshot.dexTasks, args.workItem);
  const descendantIds = descendants(
    args.sourceSnapshot.dexTasks,
    args.workItem,
  );
  const current = args.sourceSnapshot.dexTasks.find((task) =>
    task.id === args.workItem
  );
  const dependencyIds = new Set([
    ...(current?.blockedBy ?? []),
    ...(current?.blocks ?? []),
  ]);

  const candidates = args.sourceSnapshot.dexTasks.flatMap((task) => {
    let relationship: z.infer<typeof RelatedTaskSchema>["relationship"] | null =
      null;
    let structuralRank = 0;
    const score = overlapScore(
      objectiveTokens,
      `${task.name} ${task.description}`,
    );
    if (task.id === args.workItem) {
      relationship = "current";
      structuralRank = 5;
    } else if (ancestorIds.has(task.id)) {
      relationship = "ancestor";
      structuralRank = 4;
    } else if (descendantIds.has(task.id)) {
      relationship = "descendant";
      structuralRank = 4;
    } else if (dependencyIds.has(task.id)) {
      relationship = "dependency";
      structuralRank = 3;
    } else if (score >= 0.2) {
      relationship = "lexical-overlap";
      structuralRank = score;
    }
    if (!relationship) return [];
    const duplicate = relationship === "lexical-overlap" &&
      score >= 0.5 &&
      !task.completed;
    return [{
      task,
      relationship,
      score,
      duplicate,
      rank: duplicate ? 4.5 : structuralRank,
    }];
  });
  const duplicateCandidates = candidates.filter((candidate) =>
    candidate.duplicate
  );
  const boundedCandidates = candidates.sort((left, right) =>
    right.rank - left.rank || right.score - left.score ||
    left.task.id.localeCompare(right.task.id)
  ).slice(0, MAX_RELATED_TASKS);
  const relatedTasks = boundedCandidates.map((candidate) =>
    RelatedTaskSchema.parse({
      id: candidate.task.id,
      name: candidate.task.name,
      status: dexTaskStatus(candidate.task),
      relationship: candidate.relationship,
    })
  );
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    relatedTasks,
    duplicateRisk: duplicateCandidates.length > 0,
    summary: duplicateCandidates.length > 0
      ? `${duplicateCandidates.length} open lexical duplicate candidate(s) require plan review.`
      : `${relatedTasks.length} related Dex task(s) found; no open lexical duplicate candidate crossed the threshold.`,
    sourceSnapshotFingerprint: args.sourceSnapshot.fingerprint,
    planningInventoryFingerprint: args.inventory.fingerprint,
  };
  return SupersTrackerInventorySchema.parse({
    ...withoutFingerprint,
    fingerprint: await sha256Hex(canonicalJson(withoutFingerprint)),
  });
}

function isAllowedDocumentationTarget(
  kind: z.infer<typeof DocumentationDirectiveSchema>["documentKind"],
  target: string,
): boolean {
  if (
    target.includes("..") || target.startsWith("/") || target.includes("\\")
  ) return false;
  const patterns: Record<typeof kind, RegExp> = {
    roadmap: /^docs\/roadmap\.md$/,
    adr: /^docs\/adr\/(?:README|\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    brief: /^docs\/briefs\/(?:README|[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    idea: /^docs\/ideas\/(?:README|[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    history: /^docs\/history\/(?:README|[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    "current-state":
      /^docs\/(?:CONTEXT|preset-format|engine-architecture)\.md$/,
  };
  return patterns[kind].test(target);
}

function existingPlanningPaths(
  snapshot: SupersPlanningSourceSnapshot,
): Set<string> {
  return new Set([
    snapshot.roadmap.path,
    snapshot.adrIndex.path,
    ...snapshot.adrs.map((source) => source.path),
    snapshot.briefsIndex.path,
    ...snapshot.briefs.map((source) => source.path),
    snapshot.ideasIndex.path,
    ...snapshot.ideas.map((source) => source.path),
    snapshot.historyIndex.path,
    ...snapshot.history.map((source) => source.path),
    ...snapshot.currentStateDocuments.map((source) => source.path),
  ]);
}

function requiredIndexTarget(
  kind: z.infer<typeof DocumentationDirectiveSchema>["documentKind"],
): string | null {
  if (kind === "adr") return "docs/adr/README.md";
  if (kind === "brief") return "docs/briefs/README.md";
  if (kind === "idea") return "docs/ideas/README.md";
  if (kind === "history") return "docs/history/README.md";
  return null;
}

/** Validate and fingerprint a proposal; this function never writes documents. */
export async function deriveSupersDocumentationEffects(
  args: SupersDocumentationEffectsArguments,
): Promise<SupersDocumentationEffects> {
  await assertContentFingerprint({ ...args.sourceSnapshot }, "Source snapshot");
  await assertContentFingerprint({ ...args.inventory }, "Planning inventory");
  await assertContentFingerprint(
    { ...args.trackerInventory },
    "Tracker inventory",
  );
  const expectedSnapshotName = supersPlanningSnapshotResourceName(
    args.workItem,
    args.sourceSnapshot.fingerprint,
  );
  if (
    args.inventory.objective !== args.sourceSnapshot.objective ||
    args.inventory.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint ||
    args.inventory.sourceSnapshotName !== expectedSnapshotName
  ) {
    throw new Error(
      "Planning inventory does not match the stored source snapshot",
    );
  }
  if (
    args.trackerInventory.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint ||
    args.trackerInventory.planningInventoryFingerprint !==
      args.inventory.fingerprint
  ) {
    throw new Error(
      "Tracker inventory does not match the planning artifact chain",
    );
  }
  if (args.intent.objective !== args.inventory.objective) {
    throw new Error(
      "Clarified intent does not preserve the planning objective",
    );
  }
  const trackedIds = new Set(
    args.trackerInventory.relatedTasks.map((task) => task.id),
  );
  const sourceHasWorkItem = args.sourceSnapshot.dexTasks.some((task) =>
    task.id === args.workItem
  );
  if (sourceHasWorkItem && !trackedIds.has(args.workItem)) {
    throw new Error(
      "Tracker inventory does not identify the current planning work item",
    );
  }
  const existingPaths = existingPlanningPaths(args.sourceSnapshot);
  const seen = new Set<string>();
  for (const directive of args.intent.documentationDirectives) {
    if (
      !isAllowedDocumentationTarget(directive.documentKind, directive.target)
    ) {
      throw new Error(
        "Documentation directive target is outside the Supers planning tiers",
      );
    }
    if (seen.has(directive.target)) {
      throw new Error("Documentation directives must have unique targets");
    }
    seen.add(directive.target);
    const exists = existingPaths.has(directive.target);
    if (directive.operation === "create" && exists) {
      throw new Error("Documentation create target already exists");
    }
    if (
      ["update", "retire", "no-change"].includes(directive.operation) && !exists
    ) {
      throw new Error("Documentation non-create target does not exist");
    }
    const targetIsIndex = directive.target.endsWith("/README.md");
    if (
      directive.operation === "retire" &&
      (directive.documentKind === "roadmap" || targetIsIndex)
    ) {
      throw new Error("Roadmap and planning indexes cannot be retired");
    }
    const indexTarget = requiredIndexTarget(directive.documentKind);
    if (
      indexTarget &&
      directive.target !== indexTarget &&
      ["create", "retire"].includes(directive.operation) &&
      !args.intent.documentationDirectives.some((candidate) =>
        candidate.target === indexTarget && candidate.operation === "update"
      )
    ) {
      throw new Error(
        "Documentation create or retire requires an index update directive",
      );
    }
  }

  const effects = [...args.intent.documentationDirectives]
    .sort((left, right) => left.target.localeCompare(right.target));
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    effects,
    summary:
      `${effects.length} documentation effect(s) validated against the Supers planning-tier policy; no documents were mutated.`,
    sourceSnapshotFingerprint: args.sourceSnapshot.fingerprint,
    planningInventoryFingerprint: args.inventory.fingerprint,
    trackerInventoryFingerprint: args.trackerInventory.fingerprint,
    intentFingerprint: await sha256Hex(canonicalJson(args.intent)),
  };
  return SupersDocumentationEffectsSchema.parse({
    ...withoutFingerprint,
    fingerprint: await sha256Hex(canonicalJson(withoutFingerprint)),
  });
}

function planningSnapshotDocumentRevisions(
  snapshot: SupersPlanningSourceSnapshot,
): Map<string, string> {
  return new Map(
    [
      snapshot.roadmap,
      snapshot.adrIndex,
      ...snapshot.adrs,
      snapshot.briefsIndex,
      ...snapshot.briefs,
      snapshot.ideasIndex,
      ...snapshot.ideas,
      snapshot.historyIndex,
      ...snapshot.history,
      ...snapshot.currentStateDocuments,
    ].map((document) => [document.path, document.revision]),
  );
}

async function assertPromotionWriteRevision(
  write: { path: string; content: string; revision: string },
): Promise<void> {
  if (await createSupersPlanningHash(write.content) !== write.revision) {
    throw new Error(`Promotion write revision is invalid for ${write.path}`);
  }
}

function assertPromotionPathRevision(
  revisions: Map<string, string>,
  path: string,
  expectedRevision: string | null,
): void {
  if ((revisions.get(path) ?? null) !== expectedRevision) {
    throw new Error(
      `Promotion preimage does not match the source snapshot: ${path}`,
    );
  }
}

function assertSinglePromotionIndex(
  payload: z.infer<typeof SupersPlanningPromotionPreviewSchema>,
  expectedPath: string,
): void {
  if (
    payload.indexMutations.length !== 1 ||
    payload.indexMutations[0]?.action !== "write" ||
    payload.indexMutations[0].path !== expectedPath
  ) {
    throw new Error(
      `${payload.operation} requires one exact ${expectedPath} index write`,
    );
  }
}

function assertPromotionRoutePolicy(
  payload: z.infer<typeof SupersPlanningPromotionPreviewSchema>,
  reviewedPlan: z.infer<typeof SupersReviewedPlanSchema>,
): void {
  const taskCount = reviewedPlan.createTasks.length +
    reviewedPlan.attachExistingTasks.length;
  const ideaPath = /^docs\/ideas\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
  const planningPath = /^docs\/briefs\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
  switch (payload.operation) {
    case "capture-idea":
      if (
        payload.source !== null || payload.destination === null ||
        !ideaPath.test(payload.destination.path) || payload.graph !== null ||
        taskCount !== 0
      ) {
        throw new Error(
          "Idea capture must create one Idea document without source or Dex work",
        );
      }
      assertSinglePromotionIndex(payload, "docs/ideas/README.md");
      return;
    case "idea-to-roadmap":
      if (
        "content" in payload.source || !ideaPath.test(payload.source.path) ||
        payload.destination.path !== "docs/roadmap.md" ||
        payload.graph !== null || taskCount !== 0
      ) {
        throw new Error(
          "Idea-to-Roadmap must delete one Idea, rewrite Roadmap, and create no Dex work",
        );
      }
      assertSinglePromotionIndex(payload, "docs/ideas/README.md");
      return;
    case "roadmap-to-planning":
      if (
        !("content" in payload.source) ||
        payload.source.path !== "docs/roadmap.md" ||
        !planningPath.test(payload.destination.path) ||
        payload.graph !== null || taskCount !== 0
      ) {
        throw new Error(
          "Roadmap-to-Planning must rewrite Roadmap, create one Brief, and create no Dex work",
        );
      }
      assertSinglePromotionIndex(payload, "docs/briefs/README.md");
      return;
    case "planning-to-dex":
      if (
        "content" in payload.source ||
        !planningPath.test(payload.source.path) ||
        payload.destination !== null || taskCount === 0
      ) {
        throw new Error(
          "Planning-to-Dex must delete one Brief and carry a complete Dex graph",
        );
      }
      assertSinglePromotionIndex(payload, "docs/briefs/README.md");
      return;
  }
}

function assertPromotionBundleValidationMatches(
  bundle: z.infer<typeof SupersPlanningApplicationBundleSchema>,
  validation: SupersPlanningApplicationBundleValidation,
): void {
  if (
    validation.status !== "validated" ||
    validation.kind !== bundle.kind ||
    validation.approvalRequired !== bundle.approvalRequired ||
    validation.expectsDexMappings !== bundle.expectsDexMappings ||
    validation.payloadHash !== bundle.payloadHash ||
    validation.sourceSnapshotFingerprint !==
      bundle.sourceSnapshotFingerprint ||
    validation.documentationEffectsFingerprint !==
      bundle.documentationEffectsFingerprint ||
    validation.planHash !== bundle.planHash
  ) {
    throw new Error("Application bundle validation does not match its preview");
  }
}

/** Validate one complete Supers promotion preview without mutating any tier. */
export async function validateSupersPlanningApplicationBundle(
  rawArgs: SupersPlanningApplicationBundleValidationArguments,
): Promise<SupersPlanningApplicationBundleValidation> {
  const args = SupersPlanningApplicationBundleValidationArgumentsSchema.parse(
    rawArgs,
  );
  await assertContentFingerprint({ ...args.sourceSnapshot }, "Source snapshot");
  await assertContentFingerprint({ ...args.inventory }, "Planning inventory");
  await assertContentFingerprint(
    { ...args.trackerInventory },
    "Tracker inventory",
  );
  await assertContentFingerprint(
    { ...args.documentationEffects },
    "Documentation effects",
  );
  const bundle = args.applicationBundle;
  const payload = bundle.payload;
  if (
    args.inventory.sourceSnapshotName !==
      supersPlanningSnapshotResourceName(
        args.workItem,
        args.sourceSnapshot.fingerprint,
      ) ||
    args.inventory.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint ||
    args.trackerInventory.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint ||
    args.documentationEffects.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint ||
    bundle.sourceSnapshotFingerprint !== args.sourceSnapshot.fingerprint ||
    bundle.documentationEffectsFingerprint !==
      args.documentationEffects.fingerprint
  ) {
    throw new Error(
      "Promotion preview does not bind the immutable source chain",
    );
  }
  if (
    payload.planningItemId !== args.workItem ||
    payload.operation !== bundle.kind ||
    args.reviewedPlan.planId !== args.workItem
  ) {
    throw new Error(
      "Promotion preview does not retain its stable planning item",
    );
  }
  const approvalRequired = payload.operation !== "capture-idea";
  const expectsDexMappings = payload.operation === "planning-to-dex";
  if (
    bundle.approvalRequired !== approvalRequired ||
    bundle.expectsDexMappings !== expectsDexMappings ||
    bundle.payloadHash !==
      await createSupersPlanningApprovalDigest(payload) ||
    bundle.planHash !==
      await sha256Hex(canonicalJson(args.reviewedPlan))
  ) {
    throw new Error("Promotion preview envelope is not content-address exact");
  }
  assertPromotionRoutePolicy(payload, args.reviewedPlan);
  if (payload.operation === "planning-to-dex") {
    const normalizedPlan = DexApprovedPlanSchema.parse(
      normalizeDexReviewedPlanForApplication(args.reviewedPlan),
    );
    if (canonicalJson(normalizedPlan) !== canonicalJson(payload.graph)) {
      throw new Error("Promotion Dex graph differs from the reviewed plan");
    }
  }

  const revisions = planningSnapshotDocumentRevisions(args.sourceSnapshot);
  const paths = new Set<string>();
  const registerPath = (path: string): void => {
    if (paths.has(path)) {
      throw new Error(`Promotion path has multiple authority roles: ${path}`);
    }
    paths.add(path);
  };
  if (payload.source !== null) {
    registerPath(payload.source.path);
    assertPromotionPathRevision(
      revisions,
      payload.source.path,
      payload.source.expectedRevision,
    );
    if ("content" in payload.source) {
      await assertPromotionWriteRevision(payload.source);
    }
  }
  if (payload.destination !== null) {
    registerPath(payload.destination.path);
    assertPromotionPathRevision(
      revisions,
      payload.destination.path,
      payload.destination.expectedRevision,
    );
    await assertPromotionWriteRevision(payload.destination);
  }
  for (const mutation of payload.indexMutations) {
    registerPath(mutation.path);
    assertPromotionPathRevision(
      revisions,
      mutation.path,
      mutation.expectedRevision,
    );
    if (mutation.action === "write") {
      await assertPromotionWriteRevision(mutation);
    }
  }
  const proposedTargets = new Set(
    args.documentationEffects.effects
      .filter((effect) => effect.operation !== "no-change")
      .map((effect) => effect.target),
  );
  for (const path of paths) {
    if (!proposedTargets.has(path)) {
      throw new Error(
        `Promotion path lacks a reviewed documentation effect: ${path}`,
      );
    }
  }

  return SupersPlanningApplicationBundleValidationSchema.parse({
    schemaVersion: 1,
    status: "validated",
    kind: bundle.kind,
    approvalRequired,
    expectsDexMappings,
    payloadHash: bundle.payloadHash,
    sourceSnapshotFingerprint: bundle.sourceSnapshotFingerprint,
    documentationEffectsFingerprint: bundle.documentationEffectsFingerprint,
    planHash: bundle.planHash,
    summary:
      `${bundle.kind} preview is exact, route-valid, and bound to the immutable source chain.`,
  });
}

/** Normalize one promotion result into the portable Planning application artifact. */
export function normalizeSupersPromotionApplication(
  rawArgs: SupersPromotionApplicationNormalizationArguments,
): SupersPlanApplication {
  const args = SupersPromotionApplicationNormalizationArgumentsSchema.parse(
    rawArgs,
  );
  assertPromotionBundleValidationMatches(
    args.applicationBundle,
    args.applicationBundleValidation,
  );
  const receipt = args.promotionReceipt;
  const expectedReceiptName = `planning-promotion-receipt-${receipt.receiptId}`;
  if (
    args.workItem !== args.applicationBundle.payload.planningItemId ||
    args.promotionReceiptDataName !== expectedReceiptName
  ) {
    throw new Error("Promotion receipt does not match the application bundle");
  }
  if (receipt.status === "failed") {
    if (
      args.promotionResult !== null || args.promotionResultDataName !== "" ||
      receipt.idempotencyKey === null
    ) {
      throw new Error("Failed promotion cannot carry a successful result");
    }
    return SupersPlanApplicationSchema.parse({
      schemaVersion: 1,
      status: "failed",
      planId: args.workItem,
      planHash: args.applicationBundle.payloadHash,
      idempotencyKey: receipt.idempotencyKey,
      attempt: 1,
      checkpointDataName: expectedReceiptName,
      receiptDataName: args.promotionReceiptDataName,
      resultDataName: "",
      mappings: [],
      retryDisposition: receipt.repairGuidance === "retry-same-payload"
        ? "retry"
        : "manual-review",
      errorCode: receipt.errorCode,
      summary:
        `${args.applicationBundle.kind} failed with ${receipt.errorCode}; ${receipt.repairGuidance}.`,
    });
  }
  const result = args.promotionResult;
  if (result === null || result.status !== "audited") {
    throw new Error("Successful promotion requires one audited result");
  }
  const expectedResultName =
    `planning-promotion-result-${result.auditReceipt.receiptId}`;
  if (
    args.promotionResultDataName !== expectedResultName ||
    canonicalJson(result.auditReceipt) !== canonicalJson(receipt) ||
    result.planningItemId !== args.workItem ||
    result.operation !== args.applicationBundle.kind ||
    result.hashes?.promotionDigest !== args.applicationBundle.payloadHash ||
    result.idempotencyKey === null
  ) {
    throw new Error("Promotion result does not match its reviewed bundle");
  }
  return SupersPlanApplicationSchema.parse({
    schemaVersion: 1,
    status: "succeeded",
    planId: args.workItem,
    planHash: result.dexResult?.planHash ?? args.applicationBundle.payloadHash,
    idempotencyKey: result.idempotencyKey,
    attempt: 1,
    checkpointDataName: result.dexResult === null
      ? args.promotionReceiptDataName
      : `apply-plan-checkpoint-${result.dexResult.idempotencyKey}`,
    receiptDataName: args.promotionReceiptDataName,
    resultDataName: args.promotionResultDataName,
    mappings: result.dexResult?.mappings ?? [],
    retryDisposition: "none",
    errorCode: "",
    summary:
      `${result.operation} reached ${result.authorityState} authority with ${result.cleanupDisposition} source cleanup.`,
  });
}

/** Validate the exact compiler-emitted reviewed-plan to Plan Applier boundary. */
export async function validateSupersPlanBoundary(
  rawArgs: z.infer<typeof SupersPlanBoundaryArgumentsSchema>,
): Promise<z.infer<typeof SupersPlanBoundarySchema>> {
  const args = SupersPlanBoundaryArgumentsSchema.parse(rawArgs);
  const normalized = DexApprovedPlanSchema.parse(
    normalizeDexReviewedPlanForApplication(args.reviewedPlan),
  );
  if (canonicalJson(normalized) !== canonicalJson(args.plan)) {
    throw new Error(
      "Compiler-emitted application plan does not match the reviewed plan",
    );
  }
  await assertContentFingerprint(
    { ...args.sourceSnapshot },
    "Planning source snapshot",
  );
  if (
    args.planningInventory.sourceSnapshotName !==
      supersPlanningSnapshotResourceName(
        args.workItem,
        args.sourceSnapshot.fingerprint,
      ) ||
    args.planningInventory.sourceSnapshotFingerprint !==
      args.sourceSnapshot.fingerprint
  ) {
    throw new Error("Planning inventory does not match its source snapshot");
  }
  const repairIntent = args.sourceSnapshot.repairIntent;
  if (repairIntent !== null) {
    const createTasks = args.reviewedPlan.createTasks;
    const attachTasks = args.reviewedPlan.attachExistingTasks;
    const exactSentryId = (value: string): boolean => {
      const escaped = repairIntent.intent.shortId.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      return new RegExp(
        `(?:^|[^A-Za-z0-9_-])${escaped}(?:$|[^A-Za-z0-9_-])`,
        "i",
      ).test(value);
    };
    const createBoundary = createTasks.length === 1 && attachTasks.length === 0;
    const attachBoundary = createTasks.length === 0 && attachTasks.length === 1;
    if (
      (repairIntent.intent.recommendation === "create-task" &&
        !createBoundary) ||
      (repairIntent.intent.recommendation === "attach-existing" &&
        !attachBoundary)
    ) {
      throw new Error(
        "Sentry repair Planning must apply exactly one approved task",
      );
    }
    if (createBoundary) {
      const task = createTasks[0]!;
      if (!exactSentryId(`${task.name}\n${task.description}`)) {
        throw new Error(
          "Sentry repair task must preserve the exact Sentry short id",
        );
      }
    } else {
      const task = attachTasks[0]!;
      if (
        task.selectorKind !== "id" ||
        task.selectorValue !== repairIntent.intent.existingDexTaskId
      ) {
        throw new Error(
          "Sentry repair attachment must target the triaged Dex task",
        );
      }
      if (!exactSentryId(`${task.expectedName}\n${task.expectedDescription}`)) {
        throw new Error(
          "Sentry repair task must preserve the exact Sentry short id",
        );
      }
    }
  }
  return SupersPlanBoundarySchema.parse({
    schemaVersion: 1,
    status: "matched",
    planId: normalized.planId,
    reviewedPlanHash: await sha256Hex(canonicalJson(args.reviewedPlan)),
    applicationPlanHash: await sha256Hex(canonicalJson(normalized)),
    sentryRepairIntentFingerprint: repairIntent?.fingerprint ?? null,
  });
}

/** Normalize one Plan Applier receipt into the exact Planning Factory artifact. */
export function normalizeSupersPlanApplication(
  args: SupersPlanApplicationNormalizationArguments,
): SupersPlanApplication {
  const { approvedPlan, checkpoint, receipt, result } = args;
  const expectedCheckpointName =
    `apply-plan-checkpoint-${receipt.idempotencyKey}`;
  const expectedReceiptName = `apply-plan-receipt-${receipt.idempotencyKey}`;
  const expectedResultName = `apply-plan-result-${receipt.idempotencyKey}`;
  const approvedDispositions = new Map([
    ...(approvedPlan.epic === undefined
      ? []
      : [[approvedPlan.epic.clientRef, "created" as const] as const]),
    ...approvedPlan.tasks.map((task) =>
      [
        task.clientRef,
        task.kind === "create"
          ? "created" as const
          : "attachedExisting" as const,
      ] as const
    ),
  ]);
  if (
    receipt.planId !== approvedPlan.planId ||
    receipt.checkpointName !== expectedCheckpointName ||
    args.receiptDataName !== expectedReceiptName
  ) {
    throw new Error("Plan Applier receipt does not match the approved plan");
  }
  if (
    checkpoint !== null &&
    (checkpoint.planId !== receipt.planId ||
      checkpoint.planHash !== receipt.planHash ||
      checkpoint.idempotencyKey !== receipt.idempotencyKey ||
      checkpoint.attempt !== receipt.attempt)
  ) {
    throw new Error("Plan Applier checkpoint does not match its receipt");
  }
  if (receipt.status === "succeeded") {
    const resultMapping = result === null ? null : Object.fromEntries(
      result.mappings.map((mapping) => [mapping.clientRef, mapping.dexTaskId]),
    );
    if (
      checkpoint === null || checkpoint.status !== "succeeded" ||
      result === null ||
      result.planId !== receipt.planId ||
      result.planHash !== receipt.planHash ||
      result.idempotencyKey !== receipt.idempotencyKey ||
      result.status !== "succeeded" ||
      result.mappings.length !== approvedDispositions.size ||
      new Set(result.mappings.map((mapping) => mapping.clientRef)).size !==
        result.mappings.length ||
      new Set(result.mappings.map((mapping) => mapping.dexTaskId)).size !==
        result.mappings.length ||
      result.mappings.some((mapping) =>
        approvedDispositions.get(mapping.clientRef) !== mapping.disposition
      ) ||
      receipt.resultName !== expectedResultName ||
      args.resultDataName !== expectedResultName ||
      canonicalJson(result.taskIdsByClientRef) !==
        canonicalJson(receipt.taskIdsByClientRef) ||
      canonicalJson(checkpoint.taskIdsByClientRef) !==
        canonicalJson(receipt.taskIdsByClientRef) ||
      canonicalJson(resultMapping) !== canonicalJson(result.taskIdsByClientRef)
    ) {
      throw new Error(
        "Successful Plan Applier receipt lacks a matching result",
      );
    }
    return SupersPlanApplicationSchema.parse({
      schemaVersion: 1,
      status: "succeeded",
      planId: receipt.planId,
      planHash: receipt.planHash,
      idempotencyKey: receipt.idempotencyKey,
      attempt: receipt.attempt,
      checkpointDataName: receipt.checkpointName,
      receiptDataName: args.receiptDataName,
      resultDataName: args.resultDataName,
      mappings: result.mappings,
      retryDisposition: "none",
      errorCode: "",
      summary:
        `${result.mappings.length} approved client reference(s) mapped to verified Dex task IDs.`,
    });
  }
  if (result !== null || args.resultDataName !== "") {
    throw new Error("Failed Plan Applier receipt cannot carry a result");
  }
  if (
    checkpoint !== null &&
    (checkpoint.status !== "failed" ||
      checkpoint.retryDisposition !== receipt.retryDisposition ||
      checkpoint.errorCode !== receipt.errorCode ||
      checkpoint.failedClientRef !== receipt.failedClientRef ||
      canonicalJson(checkpoint.taskIdsByClientRef) !==
        canonicalJson(receipt.taskIdsByClientRef))
  ) {
    throw new Error(
      "Failed Plan Applier checkpoint does not match its receipt",
    );
  }
  const mappings = Object.entries(receipt.taskIdsByClientRef).map(
    ([clientRef, dexTaskId]) => {
      const disposition = approvedDispositions.get(clientRef);
      if (disposition === undefined) {
        throw new Error(
          "Plan Applier failure mapping is outside the approved plan",
        );
      }
      return { clientRef, dexTaskId, disposition };
    },
  ).sort((left, right) => left.clientRef.localeCompare(right.clientRef));
  return SupersPlanApplicationSchema.parse({
    schemaVersion: 1,
    status: "failed",
    planId: receipt.planId,
    planHash: receipt.planHash,
    idempotencyKey: receipt.idempotencyKey,
    attempt: receipt.attempt,
    checkpointDataName: receipt.checkpointName,
    receiptDataName: args.receiptDataName,
    resultDataName: "",
    mappings,
    retryDisposition: receipt.retryDisposition,
    errorCode: receipt.errorCode,
    summary:
      `Approved plan application failed with ${receipt.errorCode}; ${mappings.length} confirmed mapping(s) retained and recovery disposition is ${receipt.retryDisposition}.`,
  });
}

/** Validate the exact audited Planning chain and compact its Delivery boundary. */
export async function prepareSupersDeliveryHandoff(
  rawArgs: SupersDeliveryHandoffPreparationArguments,
  authorizationKey: string,
): Promise<SupersDeliveryHandoffApproval> {
  const args = SupersDeliveryHandoffPreparationArgumentsSchema.parse(rawArgs);
  const {
    graphProposal,
    approvedPlan,
    humanApproval,
    application,
    planningAudit,
    planningHandoff,
  } = args;
  const normalizedApprovedPlan = DexApprovedPlanSchema.parse(
    "createTasks" in approvedPlan.plan
      ? normalizeDexReviewedPlanForApplication(approvedPlan.plan)
      : approvedPlan.plan,
  );
  if (
    approvedPlan.approvalGateId !== "planning-approval" ||
    humanApproval.gateId !== "planning-approval" ||
    humanApproval.workItem !== args.planningWorkItem ||
    humanApproval.cycle !== args.proposalCycle ||
    approvedPlan.planHash !== graphProposal.planHash ||
    approvedPlan.proposalPlanHash !== graphProposal.planHash ||
    canonicalJson(approvedPlan.plan) !== canonicalJson(graphProposal.plan) ||
    application.status !== "succeeded" ||
    application.planId !== normalizedApprovedPlan.planId ||
    planningAudit.planId !== normalizedApprovedPlan.planId ||
    planningHandoff.planId !== normalizedApprovedPlan.planId
  ) {
    throw new Error(
      "Delivery handoff does not match one human-approved successful plan",
    );
  }

  const approvedTaskIds = application.mappings.map((mapping) =>
    mapping.dexTaskId
  ).sort((left, right) => left.localeCompare(right));
  const auditedTaskIds = [...planningAudit.verifiedTaskIds].sort((
    left,
    right,
  ) => left.localeCompare(right));
  const approvedClientRefs = [
    ...(normalizedApprovedPlan.epic === undefined
      ? []
      : [normalizedApprovedPlan.epic.clientRef]),
    ...normalizedApprovedPlan.tasks.map((task) => task.clientRef),
  ].sort((left, right) => left.localeCompare(right));
  const mappedClientRefs = application.mappings.map((mapping) =>
    mapping.clientRef
  ).sort((left, right) => left.localeCompare(right));
  if (
    new Set(approvedTaskIds).size !== approvedTaskIds.length ||
    canonicalJson(approvedTaskIds) !== canonicalJson(auditedTaskIds) ||
    canonicalJson(approvedClientRefs) !== canonicalJson(mappedClientRefs)
  ) {
    throw new Error("Delivery handoff mappings are not exactly audit-verified");
  }

  const mappingByClientRef = new Map(
    application.mappings.map((mapping) => [mapping.clientRef, mapping]),
  );
  const rootCreateTasks = normalizedApprovedPlan.tasks.filter((task) =>
    task.kind === "create" && task.parent.kind === "root"
  );
  const approvedEpicClientRef = normalizedApprovedPlan.epic?.clientRef ??
    (rootCreateTasks.length === 1 ? rootCreateTasks[0].clientRef : null);
  const planDerivedEpicTaskId = approvedEpicClientRef === null
    ? null
    : mappingByClientRef.get(approvedEpicClientRef)?.dexTaskId ?? null;
  const handoffEpicTaskId = planningHandoff.approvedEpicTaskId ?? null;
  const handoffEpicIsMapped = handoffEpicTaskId !== null &&
    approvedTaskIds.includes(handoffEpicTaskId) &&
    auditedTaskIds.includes(handoffEpicTaskId);
  const handoffEpicConflictsWithPlan = handoffEpicTaskId !== null &&
    planDerivedEpicTaskId !== null &&
    handoffEpicTaskId !== planDerivedEpicTaskId;
  const approvedEpicTaskId = handoffEpicTaskId === null
    ? planDerivedEpicTaskId
    : handoffEpicIsMapped && !handoffEpicConflictsWithPlan
    ? handoffEpicTaskId
    : null;
  const requestedCandidate = planningHandoff.candidateTaskId ?? null;
  const candidateIsApproved = requestedCandidate !== null &&
    approvedTaskIds.includes(requestedCandidate);
  let status = planningHandoff.status;
  let summary = planningHandoff.summary;
  if (
    planningAudit.status !== "passed" ||
    planningAudit.unresolvedIssues.length > 0
  ) {
    status = "human-gate";
    summary = "Planning audit did not authorize Delivery handoff.";
  } else if (status === "ready" && approvedEpicTaskId === null) {
    status = "human-gate";
    summary = handoffEpicTaskId === null
      ? "The approved plan did not establish one explicit epic boundary."
      : "The approved Planning handoff epic boundary is not an exact approved and audited mapping.";
  } else if (status === "ready" && !candidateIsApproved) {
    status = "human-gate";
    summary =
      "The proposed Delivery candidate is outside the approved mappings.";
  }
  const candidateTaskId = status === "ready" ? requestedCandidate : null;
  const sourceDataNames = {
    graphProposal: `artifact-${args.planningWorkItem}-dex-graph-proposal`,
    approvedPlan: `artifact-${args.planningWorkItem}-approved-plan`,
    humanApproval: `approval-${args.planningWorkItem}-planning-approval`,
    planApplication: `artifact-${args.planningWorkItem}-plan-application`,
    planningAudit: `artifact-${args.planningWorkItem}-planning-audit`,
    planningHandoff: `artifact-${args.planningWorkItem}-planning-handoff`,
  };
  const identity = {
    schemaVersion: 1 as const,
    planningWorkItem: args.planningWorkItem,
    planId: normalizedApprovedPlan.planId,
    planHash: application.planHash,
    proposalPlanHash: graphProposal.planHash,
    applicationIdempotencyKey: application.idempotencyKey,
    applicationCheckpointDataName: application.checkpointDataName,
    applicationReceiptDataName: application.receiptDataName,
    applicationResultDataName: application.resultDataName,
    graphProposalFingerprint: await sha256Hex(canonicalJson(graphProposal)),
    approvedPlanFingerprint: await sha256Hex(canonicalJson(approvedPlan)),
    applicationFingerprint: await sha256Hex(canonicalJson(application)),
    planningAuditFingerprint: await sha256Hex(canonicalJson(planningAudit)),
    humanApprovalFingerprint: await sha256Hex(canonicalJson(humanApproval)),
    planningHandoffFingerprint: await sha256Hex(
      canonicalJson(planningHandoff),
    ),
    approvalGateId: humanApproval.gateId,
    proposalCycle: args.proposalCycle,
    approvalCycle: humanApproval.cycle,
    approvedAt: humanApproval.decidedAt,
    sourceDataNames,
    status,
    candidateTaskId,
    approvedEpicTaskId,
    approvedTaskIds,
    auditedTaskIds,
    summary,
  };
  const approvalFingerprint = await createDexReadyLeafApprovalFingerprint(
    identity,
  );
  const authorizationIdentity = { ...identity, approvalFingerprint };
  return SupersDeliveryHandoffApprovalSchema.parse({
    ...authorizationIdentity,
    authorizationSignature: await createDexReadyLeafAuthorizationSignature(
      authorizationIdentity,
      authorizationKey,
    ),
  });
}

/** Converge the Dex claim and Delivery Factory state into one typed saga result. */
export async function normalizeSupersDeliveryHandoffOutcome(
  rawArgs: SupersDeliveryHandoffOutcomeArguments,
): Promise<SupersDeliveryHandoffOutcome> {
  const args = SupersDeliveryHandoffOutcomeArgumentsSchema.parse(rawArgs);
  const { approval, claim, factoryStates } = args;
  if (
    claim.planningWorkItem !== approval.planningWorkItem ||
    claim.planId !== approval.planId ||
    claim.planHash !== approval.planHash ||
    claim.approvalFingerprint !== approval.approvalFingerprint
  ) {
    throw new Error("Delivery claim does not match its Planning approval");
  }
  const selectedStates = claim.selectedTaskId === null
    ? []
    : factoryStates.filter((state) => state.workItem === claim.selectedTaskId);
  if (
    (claim.status === "claimed" || claim.status === "resumed") &&
    (claim.selectedTaskId === null || selectedStates.length !== 1)
  ) {
    throw new Error(
      "Delivery claim did not converge to exactly one Factory state",
    );
  }
  if (
    (claim.status === "no-ready-work" || claim.status === "human-gate") &&
    (claim.selectedTaskId !== null || factoryStates.length !== 0)
  ) {
    throw new Error("Non-delivery handoff unexpectedly owns Factory state");
  }

  const factoryStatus = selectedStates[0]?.status ?? null;
  let status: "started" | "resumed" | "no-ready-work" | "human-gate";
  let summary: string;
  if (claim.status === "no-ready-work") {
    status = "no-ready-work";
    summary = "No unique approved ready leaf is available for Delivery.";
  } else if (claim.status === "human-gate" || factoryStatus === "terminal") {
    status = "human-gate";
    summary = factoryStatus === "terminal"
      ? "Dex ownership conflicts with a terminal Delivery Factory state."
      : `Delivery handoff requires human review: ${claim.reason}.`;
  } else if (claim.status === "resumed") {
    status = "resumed";
    summary =
      `Resumed active Delivery Factory ownership for ${claim.selectedTaskId}.`;
  } else {
    status = "started";
    summary = `Started Delivery Factory ownership for ${claim.selectedTaskId}.`;
  }
  const identity = {
    schemaVersion: 1 as const,
    status,
    planningWorkItem: approval.planningWorkItem,
    planId: approval.planId,
    planHash: approval.planHash,
    approvalFingerprint: approval.approvalFingerprint,
    selectedTaskId: claim.selectedTaskId,
    claimStatus: claim.status,
    claimReason: claim.reason,
    factoryStatus,
    summary,
  };
  return SupersDeliveryHandoffOutcomeSchema.parse({
    ...identity,
    fingerprint: await sha256Hex(canonicalJson(identity)),
  });
}

function sortedStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

/** Audit the promotion receipt and any Planning-to-Dex graph as one boundary. */
export async function auditSupersPromotionApplication(
  rawArgs: SupersPromotionApplicationAuditArguments,
  dexTasks: SupersPlanningSourceSnapshot["dexTasks"],
): Promise<SupersPlanningApplicationAudit> {
  const args = SupersPromotionApplicationAuditArgumentsSchema.parse(rawArgs);
  assertPromotionBundleValidationMatches(
    args.applicationBundle,
    args.applicationBundleValidation,
  );
  await assertContentFingerprint(
    { ...args.documentationEffects },
    "Documentation effects",
  );
  const result = args.promotionResult;
  const receipt = args.promotionReceipt;
  if (
    args.workItem !== args.applicationBundle.payload.planningItemId ||
    args.application.status !== "succeeded" ||
    args.application.planId !== args.workItem ||
    args.application.planHash !==
      (result.dexResult?.planHash ?? args.applicationBundle.payloadHash) ||
    result.status !== "audited" ||
    result.planningItemId !== args.workItem ||
    result.operation !== args.applicationBundle.kind ||
    result.hashes?.promotionDigest !== args.applicationBundle.payloadHash ||
    canonicalJson(result.auditReceipt) !== canonicalJson(receipt) ||
    receipt.status !== "audited" ||
    receipt.repairGuidance !== "none"
  ) {
    return SupersPlanningApplicationAuditSchema.parse({
      schemaVersion: 1,
      status: "failed",
      planId: args.workItem,
      verifiedTaskIds: [],
      unresolvedIssues: [
        "Promotion result, receipt, and reviewed application bundle do not match",
      ],
      summary: "Promotion application audit found a boundary mismatch.",
    });
  }
  if (args.applicationBundle.kind !== "planning-to-dex") {
    const issues = [
      ...(args.application.mappings.length === 0 ? [] : [
        "Documentation-only promotion unexpectedly emitted Dex mappings",
      ]),
      ...(result.dexResult === null ? [] : [
        "Documentation-only promotion unexpectedly carried a Dex result",
      ]),
    ];
    return SupersPlanningApplicationAuditSchema.parse({
      schemaVersion: 1,
      status: issues.length === 0 ? "passed" : "failed",
      planId: args.workItem,
      verifiedTaskIds: [],
      unresolvedIssues: issues,
      summary: issues.length === 0
        ? `${args.applicationBundle.kind} authority and cleanup receipt are verified; no Dex work was created.`
        : "Documentation-only promotion emitted unexpected Dex evidence.",
    });
  }
  const graph = DexApprovedPlanSchema.parse(
    args.applicationBundle.payload.graph,
  );
  const graphAudit = await auditSupersPlanningApplication(
    {
      workItem: args.workItem,
      approvedPlan: graph,
      application: args.application,
      documentationEffects: args.documentationEffects,
    },
    dexTasks,
  );
  return SupersPlanningApplicationAuditSchema.parse({
    ...graphAudit,
    summary: graphAudit.status === "passed"
      ? `${graphAudit.verifiedTaskIds.length} mapped Dex task(s), promotion authority, and Planning source cleanup are verified.`
      : graphAudit.summary,
  });
}

/** Verify successful application mappings against one fresh official Dex snapshot. */
export async function auditSupersPlanningApplication(
  args: SupersPlanningApplicationAuditArguments,
  dexTasks: SupersPlanningSourceSnapshot["dexTasks"],
): Promise<SupersPlanningApplicationAudit> {
  await assertContentFingerprint(
    { ...args.documentationEffects },
    "Documentation effects",
  );
  const issues: string[] = [];
  const verifiedTaskIds: string[] = [];
  if (
    args.application.status !== "succeeded" ||
    args.application.planId !== args.approvedPlan.planId
  ) {
    issues.push("Plan application is not a success for the approved plan");
  }
  const mappings = new Map(
    args.application.mappings.map((mapping) => [mapping.clientRef, mapping]),
  );
  if (mappings.size !== args.application.mappings.length) {
    issues.push(
      "Plan application contains duplicate client-reference mappings",
    );
  }
  const plannedNodes = [
    ...(args.approvedPlan.epic === undefined ? [] : [{
      kind: "create" as const,
      clientRef: args.approvedPlan.epic.clientRef,
      name: args.approvedPlan.epic.name,
      description: args.approvedPlan.epic.description,
      priority: args.approvedPlan.epic.priority,
      parent: { kind: "root" as const },
      blockedBy: args.approvedPlan.epic.blockedBy,
    }]),
    ...args.approvedPlan.tasks.map((task) =>
      task.kind === "create" ? task : {
        kind: task.kind,
        clientRef: task.clientRef,
        name: task.expected.name,
        description: task.expected.description,
        priority: task.expected.priority,
        parent: task.parent,
        blockedBy: task.addBlockedBy,
      }
    ),
  ];
  if (mappings.size !== plannedNodes.length) {
    issues.push(
      "Plan application mapping count does not match the approved graph",
    );
  }
  const taskById = new Map(dexTasks.map((task) => [task.id, task]));
  const mappedTaskIds = new Set<string>();
  for (const node of plannedNodes) {
    const mapping = mappings.get(node.clientRef);
    if (mapping === undefined) {
      issues.push(`Missing mapping for ${node.clientRef}`);
      continue;
    }
    if (mappedTaskIds.has(mapping.dexTaskId)) {
      issues.push(`Dex task ${mapping.dexTaskId} is mapped more than once`);
      continue;
    }
    mappedTaskIds.add(mapping.dexTaskId);
    const task = taskById.get(mapping.dexTaskId);
    if (task === undefined) {
      issues.push(`Mapped Dex task ${mapping.dexTaskId} does not exist`);
      continue;
    }
    const expectedDisposition = node.kind === "create"
      ? "created"
      : "attachedExisting";
    if (mapping.disposition !== expectedDisposition) {
      issues.push(`Mapping disposition is invalid for ${node.clientRef}`);
    }
    if (
      task.name !== node.name || task.description !== node.description ||
      task.priority !== node.priority
    ) {
      issues.push(`Mapped Dex task content drifted for ${node.clientRef}`);
    }
    if (node.parent.kind !== "preserve") {
      const expectedParentId = node.parent.kind === "root"
        ? null
        : mappings.get(node.parent.clientRef)?.dexTaskId;
      if (
        expectedParentId === undefined || task.parentId !== expectedParentId
      ) {
        issues.push(`Mapped Dex parent is invalid for ${node.clientRef}`);
      }
    }
    const expectedBlockerIds = node.blockedBy.map((clientRef) =>
      mappings.get(clientRef)?.dexTaskId
    );
    if (expectedBlockerIds.some((taskId) => taskId === undefined)) {
      issues.push(`Mapped Dex blockers are incomplete for ${node.clientRef}`);
    } else if (
      node.kind === "create"
        ? JSON.stringify(sortedStrings(task.blockedBy)) !==
          JSON.stringify(sortedStrings(expectedBlockerIds as string[]))
        : !(expectedBlockerIds as string[]).every((taskId) =>
          task.blockedBy.includes(taskId)
        )
    ) {
      issues.push(`Mapped Dex blockers are invalid for ${node.clientRef}`);
    }
    if (!issues.some((issue) => issue.endsWith(node.clientRef))) {
      verifiedTaskIds.push(task.id);
    }
  }
  const unresolvedIssues = [...new Set(issues)].slice(0, 250);
  return SupersPlanningApplicationAuditSchema.parse({
    schemaVersion: 1,
    status: unresolvedIssues.length === 0 ? "passed" : "failed",
    planId: args.approvedPlan.planId,
    verifiedTaskIds: [...new Set(verifiedTaskIds)].sort(),
    unresolvedIssues,
    summary: unresolvedIssues.length === 0
      ? `${verifiedTaskIds.length} mapped Dex task(s) match the approved graph; documentation effects remain proposals.`
      : `${unresolvedIssues.length} planning application audit issue(s) require resolution.`,
  });
}
