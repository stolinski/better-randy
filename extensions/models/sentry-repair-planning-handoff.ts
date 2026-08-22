/**
 * Evidence-bound Sentry repair lifecycle around the human-gated Factories.
 *
 * Planning handoff and queue selection are read-only. Sentry backlink and
 * resolution methods mutate only after their exact approval or Delivery gates.
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
  DenoSentryRepairResolutionCommandRunner,
  executeSentryRepairResolution,
  SentryRepairResolutionArgsSchema,
  SentryRepairResolutionAttemptSchema,
  type SentryRepairResolutionContext,
  SentryRepairResolutionReceiptSchema,
} from "./sentry-repair-resolution.ts";
import {
  DEFAULT_SENTRY_REPAIR_PLANNING_HANDOFF_DEPENDENCIES,
  executeSentryRepairPlanningHandoff,
  SentryRepairIntentEnvelopeSchema,
  SentryRepairPlanningHandoffArgsSchema,
  type SentryRepairPlanningHandoffContext,
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
  version: "2026.08.21.3",
  globalArguments: z.strictObject({
    sourceIntakeModelId: z.string().uuid(),
    sourceDeliveryModelId: z.string().uuid(),
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
        "One content-addressed confirmed-repair or reproduction-required intent with replay-safe supersession",
      schema: SentryRepairIntentEnvelopeSchema,
      lifetime: "infinite",
      garbageCollection: 5000,
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
    "resolution-attempt": {
      description:
        "Durable pre-mutation intent that makes Sentry resolution crash-recoverable",
      schema: SentryRepairResolutionAttemptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "resolution-receipt": {
      description:
        "Release-bound receipt resolving one Sentry issue after terminal verified Delivery",
      schema: SentryRepairResolutionReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
  },
  methods: {
    "resolve-verified": {
      description:
        "Resolve one linked Sentry issue in its verified fix release after terminal Delivery",
      arguments: SentryRepairResolutionArgsSchema,
      execute: (
        args: z.infer<typeof SentryRepairResolutionArgsSchema>,
        context: SentryRepairResolutionContext,
      ) =>
        executeSentryRepairResolution(args, context, {
          commandRunner: new DenoSentryRepairResolutionCommandRunner(),
          now: () => new Date().toISOString(),
        }),
    },
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
        "Select the latest supersession head while preserving reproduction intents and the remaining queue",
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
