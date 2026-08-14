/**
 * Swamp model entrypoint for typed Dex task lifecycle operations.
 *
 * @module
 */
import {
  DexTaskAddNoteArgsSchema,
  DexTaskCompleteArgsSchema,
  DexTaskGetArgsSchema,
  DexTaskReopenArgsSchema,
  DexTaskSnapshotSchema,
  DexTaskStartArgsSchema,
  DexTaskTrackerGlobalArgsSchema,
  DexTaskTrackerReceiptSchema,
  executeDexTaskAddNote,
  executeDexTaskComplete,
  executeDexTaskGet,
  executeDexTaskReopen,
  executeDexTaskStart,
} from "./dex-task-tracker-adapter.ts";
import {
  DEX_READY_LEAF_HANDOFF_VERSION,
  DexReadyLeafClaimArgsSchema,
  DexReadyLeafClaimSchema,
  DexReadyLeafIntentSchema,
  executeDexReadyLeafClaim,
} from "./dex-ready-leaf-handoff.ts";
import type {
  DexReadyLeafClaimArgs,
  DexReadyLeafHandoffMethodContext,
} from "./dex-ready-leaf-handoff.ts";
import type {
  DexTaskAddNoteArgs,
  DexTaskCompleteArgs,
  DexTaskGetArgs,
  DexTaskReopenArgs,
  DexTaskStartArgs,
  DexTaskTrackerMethodContext,
} from "./dex-task-tracker-adapter.ts";

/** Model definition for normalized, receipt-backed Dex task lifecycle operations. */
export const model = {
  type: "@club_aqua_back_deck/dex-task-tracker",
  version: DEX_READY_LEAF_HANDOFF_VERSION,
  globalArguments: DexTaskTrackerGlobalArgsSchema,
  resources: {
    task: {
      description:
        "Canonical camelCase Dex task snapshot preserving exact owner and priority",
      schema: DexTaskSnapshotSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    receipt: {
      description:
        "Versioned Dex action outcome with deterministic failure codes",
      schema: DexTaskTrackerReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "ready-leaf-intent": {
      description:
        "Deterministic pre-mutation outbox for crash-safe Dex ready-leaf ownership",
      schema: DexReadyLeafIntentSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "ready-leaf-claim": {
      description:
        "Atomic, approval-bound Delivery ownership outcome for one Dex runway",
      schema: DexReadyLeafClaimSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
  },
  methods: {
    get: {
      description: "Read, normalize, and store a Dex task",
      arguments: DexTaskGetArgsSchema,
      execute: (args: DexTaskGetArgs, context: DexTaskTrackerMethodContext) =>
        executeDexTaskGet(args, context),
    },
    start: {
      description:
        "Start a pending, unstarted Dex task and store its normalized state",
      arguments: DexTaskStartArgsSchema,
      execute: (args: DexTaskStartArgs, context: DexTaskTrackerMethodContext) =>
        executeDexTaskStart(args, context),
    },
    complete: {
      description:
        "Complete an active Dex task with an explicit commit or no-commit decision",
      arguments: DexTaskCompleteArgsSchema,
      execute: (
        args: DexTaskCompleteArgs,
        context: DexTaskTrackerMethodContext,
      ) => executeDexTaskComplete(args, context),
    },
    reopen: {
      description:
        "Reopen a completed Dex task through the official Dex MCP API",
      arguments: DexTaskReopenArgsSchema,
      execute: (
        args: DexTaskReopenArgs,
        context: DexTaskTrackerMethodContext,
      ) => executeDexTaskReopen(args, context),
    },
    "claim-next-ready": {
      description:
        "Resume active Delivery ownership or atomically claim the approved unique ready leaf",
      arguments: DexReadyLeafClaimArgsSchema,
      execute: (
        args: DexReadyLeafClaimArgs,
        context: DexReadyLeafHandoffMethodContext,
      ) => executeDexReadyLeafClaim(args, context),
    },
    "add-note": {
      description:
        "Append a timestamped owner-attributed Markdown note through the Dex MCP API",
      arguments: DexTaskAddNoteArgsSchema,
      execute: (
        args: DexTaskAddNoteArgs,
        context: DexTaskTrackerMethodContext,
      ) => executeDexTaskAddNote(args, context),
    },
  },
};
