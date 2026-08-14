/**
 * Swamp entrypoint for durable Supers planning-document promotions.
 *
 * This boundary intentionally excludes planning-to-dex. That transition must
 * be composed with the existing Dex Plan Applier in a Swamp workflow before it
 * can be exposed safely.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  createSupersPlanningHash,
  executeSupersPlanningPromotion,
  SupersPlanningDocumentDeleteSchema,
  SupersPlanningDocumentWriteSchema,
  SupersPlanningIndexMutationSchema,
} from "./supers-planning-promotion-applier.ts";

const RevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);
const PlanningItemIdSchema = z.string().regex(
  /^[a-z0-9][a-z0-9._:-]{0,127}$/,
);
const SupportedOperationSchema = z.enum([
  "capture-idea",
  "idea-to-roadmap",
  "roadmap-to-planning",
]);

export const SupersPlanningPromotionGlobalArgumentsSchema = z.strictObject({});

const CommonApplyFields = {
  schemaVersion: z.literal(1),
  planningItemId: PlanningItemIdSchema,
  decision: z.literal("apply"),
  destination: SupersPlanningDocumentWriteSchema,
  indexMutations: z.array(SupersPlanningIndexMutationSchema).max(20),
  graph: z.null(),
};

const CaptureIdeaArgumentsSchema = z.strictObject({
  ...CommonApplyFields,
  operation: z.literal("capture-idea"),
  source: z.null(),
  approval: z.null(),
});

const MovePlanningDocumentArgumentsSchema = z.strictObject({
  ...CommonApplyFields,
  operation: z.enum(["idea-to-roadmap", "roadmap-to-planning"]),
  source: SupersPlanningDocumentDeleteSchema,
  approval: z.strictObject({ digest: RevisionSchema }),
});

const NoOpArgumentsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planningItemId: PlanningItemIdSchema,
  operation: SupportedOperationSchema,
  decision: z.enum(["reject", "park"]),
  reason: z.string().min(1).max(2_000),
});

/** Strict method contract for the three repository-only promotion steps. */
export const SupersPlanningPromotionMethodArgumentsSchema = z.union([
  CaptureIdeaArgumentsSchema,
  MovePlanningDocumentArgumentsSchema,
  NoOpArgumentsSchema,
]);

/** Durable, verified outcome written by every successful method execution. */
export const SupersPlanningPromotionResourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planningItemId: PlanningItemIdSchema,
  operation: SupportedOperationSchema,
  status: z.enum(["audited", "rejected", "parked"]),
  transactionId: RevisionSchema.nullable(),
  approvalDigest: RevisionSchema.nullable(),
  dexResult: z.null(),
});

type PromotionMethodArguments = z.infer<
  typeof SupersPlanningPromotionMethodArgumentsSchema
>;
type PromotionGlobalArguments = z.infer<
  typeof SupersPlanningPromotionGlobalArgumentsSchema
>;

type PromotionMethodContext = {
  repoDir: string;
  globalArgs: PromotionGlobalArguments;
  logger: { info: (message: string, props?: Record<string, unknown>) => void };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

/** Model definition for transactional Supers planning promotions. */
export const model = {
  type: "@supers/planning-promotion",
  version: "2026.08.10.1",
  globalArguments: SupersPlanningPromotionGlobalArgumentsSchema,
  resources: {
    result: {
      description:
        "Verified durable result of a repository-only Supers planning promotion",
      schema: SupersPlanningPromotionResourceSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
  },
  methods: {
    "apply-promotion": {
      description:
        "Apply or record a capture-idea, idea-to-roadmap, or roadmap-to-planning decision",
      arguments: SupersPlanningPromotionMethodArgumentsSchema,
      execute: async (
        rawArguments: PromotionMethodArguments,
        context: PromotionMethodContext,
      ) => {
        const arguments_ = SupersPlanningPromotionMethodArgumentsSchema.parse(
          rawArguments,
        );
        const rawResult = await executeSupersPlanningPromotion(
          arguments_,
          context.repoDir,
        );
        const result = SupersPlanningPromotionResourceSchema.parse(rawResult);
        const resourceName =
          `planning-promotion-${await createSupersPlanningHash(result)}`;
        const handle = await context.writeResource(
          "result",
          resourceName,
          result,
        );
        return { dataHandles: [handle] };
      },
    },
  },
};
