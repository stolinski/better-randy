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
  executeSentryMachineRepairBacklink,
  executeSentryRepairBacklink,
  SentryMachineRepairBacklinkArgsSchema,
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

const SentryRepairGlobalArgsSchema = z.strictObject({
  sourceIntakeModelId: z.string().uuid(),
  sourceDeliveryModelId: z.string().uuid(),
  sourceReplayModelId: z.string().uuid(),
});
const MachineBacklinkMethodArgsSchema = SentryMachineRepairBacklinkArgsSchema.extend(
  SentryRepairGlobalArgsSchema.shape,
);
const ResolutionMethodArgsSchema = SentryRepairResolutionArgsSchema.extend(
  SentryRepairGlobalArgsSchema.shape,
);

export const model = {
  type: "@supers/sentry-repair-planning-handoff",
  version: "2026.08.26.1",
  globalArguments: SentryRepairGlobalArgsSchema,
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
        "One content-addressed observed Sentry repair intent with replay-safe supersession",
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
        "Release-bound receipt resolving one observed Sentry issue after its fix passes normal Delivery checks",
      schema: SentryRepairResolutionReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
  },
  methods: {
    "record-machine-backlink": {
      description: "Add one idempotent Sentry comment from exact observed evidence and Dex mapping",
      arguments: MachineBacklinkMethodArgsSchema,
      execute: (
        args: z.infer<typeof MachineBacklinkMethodArgsSchema>,
        context: SentryRepairBacklinkContext,
      ) => executeSentryMachineRepairBacklink(
        SentryMachineRepairBacklinkArgsSchema.parse({
          repairIntent: args.repairIntent,
          mapping: args.mapping,
          admission: args.admission,
        }),
        context,
        {
        commandRunner: new DenoSentryRepairBacklinkCommandRunner(),
          now: () => new Date().toISOString(),
        },
      ),
    },
    "resolve-fixed": {
      description:
        "Resolve one linked Sentry issue after its integrated fix passes normal Delivery checks",
      arguments: ResolutionMethodArgsSchema,
      execute: (
        args: z.infer<typeof ResolutionMethodArgsSchema>,
        context: SentryRepairResolutionContext,
      ) =>
        executeSentryRepairResolution(
          SentryRepairResolutionArgsSchema.parse({
            repairIntentName: args.repairIntentName,
            expectedRepairIntentFingerprint: args.expectedRepairIntentFingerprint,
            backlinkReceiptName: args.backlinkReceiptName,
            expectedBacklinkReceiptFingerprint: args.expectedBacklinkReceiptFingerprint,
            evidenceName: args.evidenceName,
            expectedEvidenceFingerprint: args.expectedEvidenceFingerprint,
            dexTaskId: args.dexTaskId,
          }),
          context,
          {
          commandRunner: new DenoSentryRepairResolutionCommandRunner(),
            now: () => new Date().toISOString(),
          },
        ),
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
