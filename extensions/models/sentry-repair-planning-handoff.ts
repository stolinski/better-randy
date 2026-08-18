/**
 * Read-only handoff from Sentry issue triage to the human-gated Planning Factory.
 *
 * This model revalidates immutable Sentry intake evidence and current Dex state.
 * It emits repair intent only; it cannot mutate Sentry, Dex, or source code.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  DenoSentryRepairBacklinkCommandRunner,
  executeSentryRepairBacklink,
  SentryRepairBacklinkArgsSchema,
  type SentryRepairBacklinkContext,
  SentryRepairBacklinkReceiptSchema,
} from "./sentry-repair-backlink.ts";
import {
  DEFAULT_SENTRY_REPAIR_PLANNING_HANDOFF_DEPENDENCIES,
  executeSentryRepairPlanningHandoff,
  SentryRepairPlanningHandoffArgsSchema,
  type SentryRepairPlanningHandoffContext,
  SentryRepairIntentEnvelopeSchema,
  SentryRepairPlanningHandoffSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  selectSentryRepairPlanningQueue,
  SentryRepairPlanningQueueArgsSchema,
  type SentryRepairPlanningQueueContext,
  SentryRepairPlanningQueueSelectionSchema,
} from "./sentry-repair-planning-queue.ts";

export const model = {
  type: "@supers/sentry-repair-planning-handoff",
  version: "2026.08.18.4",
  globalArguments: z.strictObject({
    sourceIntakeModelId: z.string().uuid(),
  }),
  resources: {
    handoff: {
      description:
        "Immutable fail-closed Sentry repair intent fan-out for human-gated Planning",
      schema: SentryRepairPlanningHandoffSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "repair-intent": {
      description:
        "One content-addressed queued Sentry repair intent bound to its source handoff",
      schema: SentryRepairIntentEnvelopeSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "queue-selection": {
      description:
        "Deterministic WIP-one selection or fail-closed queue routing",
      schema: SentryRepairPlanningQueueSelectionSchema,
      lifetime: "infinite",
      garbageCollection: 100,
    },
    "backlink-receipt": {
      description:
        "Approval-bound idempotent receipt linking one audited Dex repair task from its Sentry issue",
      schema: SentryRepairBacklinkReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
  },
  methods: {
    "record-backlink": {
      description:
        "Add one idempotent Dex task comment only after correlated human-approved Planning succeeds",
      arguments: SentryRepairBacklinkArgsSchema,
      execute: (
        args: z.infer<typeof SentryRepairBacklinkArgsSchema>,
        context: SentryRepairBacklinkContext,
      ) =>
        executeSentryRepairBacklink(args, context, {
          commandRunner: new DenoSentryRepairBacklinkCommandRunner(),
          now: () => new Date().toISOString(),
        }),
    },
    "select-next": {
      description:
        "Select or resume one Sentry repair Planning work item while preserving the remaining queue",
      arguments: SentryRepairPlanningQueueArgsSchema,
      execute: (
        args: z.infer<typeof SentryRepairPlanningQueueArgsSchema>,
        context: SentryRepairPlanningQueueContext,
      ) => selectSentryRepairPlanningQueue(args, context),
    },
    prepare: {
      description:
        "Revalidate exact Sentry intake evidence and official Dex once, then emit strict repair intent or typed routing",
      arguments: SentryRepairPlanningHandoffArgsSchema,
      execute: (
        args: z.infer<typeof SentryRepairPlanningHandoffArgsSchema>,
        context: SentryRepairPlanningHandoffContext,
      ) =>
        executeSentryRepairPlanningHandoff(
          args,
          context,
          DEFAULT_SENTRY_REPAIR_PLANNING_HANDOFF_DEPENDENCIES,
        ),
    },
  },
};
