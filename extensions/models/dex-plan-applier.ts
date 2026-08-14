/**
 * Swamp model entrypoint for applying a human-approved Dex task graph.
 *
 * @module
 */
import {
  DEX_PLAN_APPLIER_VERSION,
  DexPlanApplierGlobalArgsSchema,
  DexPlanApplyArgsSchema,
  DexPlanApplyCheckpointSchema,
  DexPlanApplyReceiptSchema,
  DexPlanApplyResultSchema,
  executeDexPlanApply,
} from "./dex-plan-applier-adapter.ts";
import type {
  DexPlanApplierMethodContext,
  DexPlanApplyArgs,
} from "./dex-plan-applier-adapter.ts";

/** Model definition for one locked, fan-out Dex plan application. */
export const model = {
  type: "@club_aqua_back_deck/dex-plan-applier",
  version: DEX_PLAN_APPLIER_VERSION,
  globalArguments: DexPlanApplierGlobalArgsSchema,
  resources: {
    checkpoint: {
      description:
        "Durable roll-forward state updated after every confirmed Dex mutation",
      schema: DexPlanApplyCheckpointSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    receipt: {
      description:
        "Versioned terminal outcome for each Dex plan application attempt",
      schema: DexPlanApplyReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    result: {
      description:
        "Stable client-reference to Dex-id mapping for an applied plan",
      schema: DexPlanApplyResultSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
  },
  methods: {
    "apply-plan": {
      description:
        "Apply one fully approved Dex plan serially with checkpointed recovery",
      arguments: DexPlanApplyArgsSchema,
      execute: (args: DexPlanApplyArgs, context: DexPlanApplierMethodContext) =>
        executeDexPlanApply(args, context),
    },
  },
};
