/**
 * Swamp boundary for the four recoverable Supers planning promotions.
 *
 * Planning-to-Dex composes the existing Dex Plan Applier while this model owns
 * documentation authority, source cleanup, and the cross-boundary audit
 * receipt. Both run under the same repository lock without nesting it.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  type DexApprovedPlan,
  type DexPlanApplierMethodContext,
  DexPlanApplyCheckpointSchema,
  DexPlanApplyReceiptSchema,
  type DexPlanApplyResult,
  DexPlanApplyResultSchema,
  executeDexPlanApplyWithRepositoryLockHeld,
} from "./dex-plan-applier-adapter.ts";
import type { DexRepositoryLockLease } from "./dex-repository-lock.ts";
import {
  createSupersPlanningApprovalDigest,
  createSupersPlanningApprovedPromotion,
  createSupersPlanningHash,
  createSupersPlanningIdempotencyKey,
  executeSupersPlanningPromotion,
  SupersPlanningCaptureIdeaArgumentsSchema,
  SupersPlanningIdeaToRoadmapArgumentsSchema,
  SupersPlanningPromotionArgumentsSchema,
  SupersPlanningPromotionAuditReceiptSchema,
  type SupersPlanningPromotionDexAdapter,
  SupersPlanningPromotionError,
  SupersPlanningPromotionPreviewSchema,
  SupersPlanningPromotionRepairGuidanceSchema,
  SupersPlanningPromotionResultSchema,
  SupersPlanningRoadmapToPlanningArgumentsSchema,
  SupersPlanningToDexArgumentsSchema,
} from "./supers-planning-promotion-applier.ts";

const MODEL_VERSION = "2026.08.27.2";
const RevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);
const PlanningItemIdSchema = z.string().regex(
  /^[a-z0-9][a-z0-9._:-]{0,127}$/,
);
const PromotionOperationSchema = z.enum([
  "capture-idea",
  "idea-to-roadmap",
  "roadmap-to-planning",
  "planning-to-dex",
]);
const FailureAuthorityStateSchema = z.enum([
  "unchanged",
  "uncommitted",
  "source-authoritative",
  "destination-authoritative",
  "dex-authoritative",
  "unknown",
]);
const FailureCleanupDispositionSchema = z.enum([
  "not-required",
  "pending",
  "completed",
  "unknown",
]);

export const SupersPlanningPromotionGlobalArgumentsSchema = z.strictObject({});

const SupersPlanningFactoryApprovalSchema = z.strictObject({
  gateId: z.literal("planning-approval"),
  workItem: PlanningItemIdSchema,
  decision: z.literal("approved"),
  actor: z.string().min(1),
  note: z.string().max(2_000).optional(),
  stageId: z.literal("plan-review"),
  cycle: z.number().int().positive(),
  decidedAt: z.string().datetime(),
});

export const SupersPlanningPromotionOrchestrationArgumentsSchema = z
  .strictObject({
    preview: SupersPlanningPromotionPreviewSchema,
    validation: z.strictObject({
      schemaVersion: z.literal(1),
      status: z.literal("validated"),
      kind: PromotionOperationSchema,
      approvalRequired: z.boolean(),
      expectsDexMappings: z.boolean(),
      payloadHash: RevisionSchema,
      sourceSnapshotFingerprint: RevisionSchema,
      documentationEffectsFingerprint: RevisionSchema,
      planHash: RevisionSchema,
      summary: z.string().min(1).max(800),
    }),
    approvalGateId: z.enum(["planning-approval", "not-required"]),
    humanApproval: SupersPlanningFactoryApprovalSchema.nullable(),
  });

export const SupersPlanningPromotionFailureReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  receiptId: RevisionSchema,
  planningItemId: PlanningItemIdSchema,
  operation: PromotionOperationSchema,
  status: z.literal("failed"),
  transactionId: RevisionSchema.nullable(),
  idempotencyKey: RevisionSchema.nullable(),
  approvalDigest: RevisionSchema.nullable(),
  errorCode: z.string().min(1).max(100),
  authorityState: FailureAuthorityStateSchema,
  cleanupDisposition: FailureCleanupDispositionSchema,
  repairGuidance: SupersPlanningPromotionRepairGuidanceSchema,
});

export const SupersPlanningPromotionReceiptResourceSchema = z.union([
  SupersPlanningPromotionAuditReceiptSchema,
  SupersPlanningPromotionFailureReceiptSchema,
]);

export type SupersPlanningPromotionMethodArguments = z.infer<
  typeof SupersPlanningPromotionArgumentsSchema
>;
type PromotionGlobalArguments = z.infer<
  typeof SupersPlanningPromotionGlobalArgumentsSchema
>;
type PromotionHandle = { name: string };

type PromotionMethodContext = {
  repoDir: string;
  globalArgs: PromotionGlobalArguments;
  logger: {
    info: (message: string, props?: Record<string, unknown>) => void;
    warning: (message: string, props?: Record<string, unknown>) => void;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<PromotionHandle>;
};

type PromotionMethodExecutionResult = {
  dataHandles: PromotionHandle[];
};

function promotionResourceSpecName(specName: string): string {
  switch (specName) {
    case "checkpoint":
      return "dex-checkpoint";
    case "receipt":
      return "dex-receipt";
    case "result":
      return "dex-result";
    default:
      throw new SupersPlanningPromotionError(
        "dex-application-failed",
        "Dex Plan Applier emitted an unsupported resource type",
      );
  }
}

function createProductionDexAdapter(
  context: PromotionMethodContext,
  dataHandles: PromotionHandle[],
): SupersPlanningPromotionDexAdapter {
  const runApprovedPlan = async (
    repoDir: string,
    plan: DexApprovedPlan,
    lease: DexRepositoryLockLease | undefined,
  ): Promise<DexPlanApplyResult> => {
    let emittedResult: DexPlanApplyResult | null = null;
    const dexContext: DexPlanApplierMethodContext = {
      repoDir,
      globalArgs: { ownerToken: "supers-planning-promotion" },
      logger: context.logger,
      readResource: context.readResource,
      writeResource: async (specName, name, data) => {
        if (specName === "result") {
          emittedResult = DexPlanApplyResultSchema.parse(data);
        }
        const handle = await context.writeResource(
          promotionResourceSpecName(specName),
          name,
          data,
        );
        dataHandles.push(handle);
        return handle;
      },
    };
    await executeDexPlanApplyWithRepositoryLockHeld(
      { plan },
      dexContext,
      lease,
    );
    if (emittedResult === null) {
      throw new SupersPlanningPromotionError(
        "dex-application-failed",
        "Dex Plan Applier completed without an exact result mapping",
      );
    }
    return DexPlanApplyResultSchema.parse(emittedResult);
  };

  return {
    applyApprovedPlan: (
      repoDir,
      plan,
      _transactionId,
      lease,
    ): Promise<DexPlanApplyResult> => runApprovedPlan(repoDir, plan, lease),
    verifyApprovedPlan: async (
      repoDir,
      plan,
      expectedResult,
      lease,
    ): Promise<DexPlanApplyResult> => {
      const verified = await runApprovedPlan(repoDir, plan, lease);
      if (
        await createSupersPlanningHash(verified) !==
          await createSupersPlanningHash(expectedResult)
      ) {
        throw new SupersPlanningPromotionError(
          "stale-dex",
          "Dex Plan Applier replay returned a different result mapping",
        );
      }
      return verified;
    },
  };
}

async function failureReceiptIdentity(
  arguments_: SupersPlanningPromotionMethodArguments,
): Promise<{
  transactionId: string | null;
  idempotencyKey: string | null;
  approvalDigest: string | null;
}> {
  if (arguments_.decision !== "apply") {
    return {
      transactionId: null,
      idempotencyKey: null,
      approvalDigest: null,
    };
  }
  const promotionDigest = await createSupersPlanningApprovalDigest(arguments_);
  return {
    transactionId: await createSupersPlanningHash({
      planningItemId: arguments_.planningItemId,
      approvalDigest: promotionDigest,
    }),
    idempotencyKey: await createSupersPlanningIdempotencyKey(
      arguments_.planningItemId,
      arguments_.operation,
    ),
    approvalDigest: arguments_.operation === "capture-idea"
      ? null
      : promotionDigest,
  };
}

function fallbackAuthorityState(
  arguments_: SupersPlanningPromotionMethodArguments,
  errorCode: SupersPlanningPromotionError["errorCode"],
): z.infer<typeof FailureAuthorityStateSchema> {
  if (arguments_.decision !== "apply") return "unchanged";
  if (errorCode === "journal-conflict" || errorCode === "journal-invalid") {
    return "unknown";
  }
  return arguments_.source === null ? "uncommitted" : "source-authoritative";
}

function fallbackCleanupDisposition(
  arguments_: SupersPlanningPromotionMethodArguments,
  errorCode: SupersPlanningPromotionError["errorCode"],
): z.infer<typeof FailureCleanupDispositionSchema> {
  if (errorCode === "journal-conflict" || errorCode === "journal-invalid") {
    return "unknown";
  }
  if (arguments_.decision !== "apply" || arguments_.source === null) {
    return "not-required";
  }
  return "pending";
}

async function writeFailureReceipt(
  arguments_: SupersPlanningPromotionMethodArguments,
  error: unknown,
  context: PromotionMethodContext,
): Promise<PromotionHandle> {
  const identity = await failureReceiptIdentity(arguments_);
  const promotionError = error instanceof SupersPlanningPromotionError
    ? error
    : new SupersPlanningPromotionError(
      "journal-invalid",
      "Planning promotion failed without a typed disposition",
    );
  const payload = {
    schemaVersion: 1 as const,
    planningItemId: arguments_.planningItemId,
    operation: arguments_.operation,
    status: "failed" as const,
    ...identity,
    errorCode: promotionError.errorCode,
    authorityState: promotionError.authorityState === "unknown"
      ? fallbackAuthorityState(arguments_, promotionError.errorCode)
      : promotionError.authorityState,
    cleanupDisposition: promotionError.cleanupDisposition === "unknown"
      ? fallbackCleanupDisposition(arguments_, promotionError.errorCode)
      : promotionError.cleanupDisposition,
    repairGuidance: promotionError.repairGuidance,
  };
  const receipt = SupersPlanningPromotionFailureReceiptSchema.parse({
    ...payload,
    receiptId: await createSupersPlanningHash(payload),
  });
  return await context.writeResource(
    "promotion-receipt",
    `planning-promotion-receipt-${receipt.receiptId}`,
    receipt,
  );
}

async function executePromotionHandler(
  rawArguments: unknown,
  schema: z.ZodType<SupersPlanningPromotionMethodArguments>,
  context: PromotionMethodContext,
): Promise<PromotionMethodExecutionResult> {
  const arguments_ = schema.parse(rawArguments);
  const dataHandles: PromotionHandle[] = [];
  try {
    const result = SupersPlanningPromotionResultSchema.parse(
      await executeSupersPlanningPromotion(
        arguments_,
        context.repoDir,
        {
          dexAdapter: arguments_.operation === "planning-to-dex" &&
              arguments_.decision === "apply"
            ? createProductionDexAdapter(context, dataHandles)
            : undefined,
        },
      ),
    );
    const resultHandle = await context.writeResource(
      "promotion-result",
      `planning-promotion-result-${result.auditReceipt.receiptId}`,
      result,
    );
    const receiptHandle = await context.writeResource(
      "promotion-receipt",
      `planning-promotion-receipt-${result.auditReceipt.receiptId}`,
      result.auditReceipt,
    );
    dataHandles.push(resultHandle, receiptHandle);
    context.logger.info(
      "Planning promotion {operation} for {planningItemId} reached {status}",
      {
        operation: result.operation,
        planningItemId: result.planningItemId,
        status: result.status,
      },
    );
    return { dataHandles };
  } catch (error) {
    dataHandles.push(await writeFailureReceipt(arguments_, error, context));
    context.logger.warning(
      "Planning promotion {operation} for {planningItemId} failed",
      {
        operation: arguments_.operation,
        planningItemId: arguments_.planningItemId,
      },
    );
    throw error;
  }
}

async function executePromotionOrchestrator(
  rawArguments: unknown,
  context: PromotionMethodContext,
): Promise<PromotionMethodExecutionResult> {
  const arguments_ = SupersPlanningPromotionOrchestrationArgumentsSchema.parse(
    rawArguments,
  );
  const approvalRequired = arguments_.preview.operation !== "capture-idea";
  const expectsDexMappings = arguments_.preview.operation === "planning-to-dex";
  const approvalDigest = await createSupersPlanningApprovalDigest(
    arguments_.preview,
  );
  if (
    arguments_.validation.kind !== arguments_.preview.operation ||
    arguments_.validation.approvalRequired !== approvalRequired ||
    arguments_.validation.expectsDexMappings !== expectsDexMappings ||
    arguments_.validation.payloadHash !== approvalDigest
  ) {
    throw new SupersPlanningPromotionError(
      "stale-approval",
      "Factory promotion authorization does not match the validated preview",
    );
  }
  if (approvalRequired) {
    if (
      arguments_.approvalGateId !== "planning-approval" ||
      arguments_.humanApproval === null ||
      arguments_.humanApproval.workItem !== arguments_.preview.planningItemId ||
      arguments_.humanApproval.gateId !== "planning-approval" ||
      arguments_.humanApproval.stageId !== "plan-review" ||
      arguments_.humanApproval.decision !== "approved"
    ) {
      throw new SupersPlanningPromotionError(
        "stale-approval",
        "Planning graduation requires current-cycle native human approval",
      );
    }
  } else if (
    arguments_.approvalGateId !== "not-required" ||
    arguments_.humanApproval !== null
  ) {
    throw new SupersPlanningPromotionError(
      "stale-approval",
      "Idea capture cannot claim graduation approval",
    );
  }
  const promotion = createSupersPlanningApprovedPromotion(
    arguments_.preview,
    approvalRequired ? approvalDigest : null,
  );
  switch (promotion.operation) {
    case "capture-idea":
      return await executePromotionHandler(
        promotion,
        SupersPlanningCaptureIdeaArgumentsSchema,
        context,
      );
    case "idea-to-roadmap":
      return await executePromotionHandler(
        promotion,
        SupersPlanningIdeaToRoadmapArgumentsSchema,
        context,
      );
    case "roadmap-to-planning":
      return await executePromotionHandler(
        promotion,
        SupersPlanningRoadmapToPlanningArgumentsSchema,
        context,
      );
    case "planning-to-dex":
      return await executePromotionHandler(
        promotion,
        SupersPlanningToDexArgumentsSchema,
        context,
      );
  }
}

/** Model definition for the four handlers and their Factory orchestrator. */
export const model = {
  type: "@supers/planning-promotion",
  version: MODEL_VERSION,
  globalArguments: SupersPlanningPromotionGlobalArgumentsSchema,
  resources: {
    "promotion-result": {
      description:
        "Verified authority, hash, cleanup, mapping, and audit outcome",
      schema: SupersPlanningPromotionResultSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "promotion-receipt": {
      description:
        "Content-addressed audit or typed failure receipt for one promotion attempt",
      schema: SupersPlanningPromotionReceiptResourceSchema,
      lifetime: "infinite",
      garbageCollection: 200,
    },
    "dex-checkpoint": {
      description:
        "Existing Dex Plan Applier checkpoint composed into Planning-to-Dex",
      schema: DexPlanApplyCheckpointSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "dex-receipt": {
      description:
        "Existing Dex Plan Applier attempt receipt composed into Planning-to-Dex",
      schema: DexPlanApplyReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "dex-result": {
      description: "Existing Dex Plan Applier stable client-reference mapping",
      schema: DexPlanApplyResultSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
  },
  methods: {
    "apply-promotion": {
      description:
        "Dispatch one validated and route-authorized Factory preview to its exact recoverable handler",
      arguments: SupersPlanningPromotionOrchestrationArgumentsSchema,
      execute: (rawArguments: unknown, context: PromotionMethodContext) =>
        executePromotionOrchestrator(rawArguments, context),
    },
  },
};
