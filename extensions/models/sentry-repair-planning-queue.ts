import { z } from "npm:zod@4.4.3";

import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryRepairIntentEnvelopeSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const PlanningWorkItemSchema = z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/);

const SentryRepairPlanningStateSchema = z.strictObject({
  workItem: PlanningWorkItemSchema,
  status: z.enum(["active", "terminal"]),
  stageId: z.string().min(1),
});

const PriorQueueSelectionSchema = z.strictObject({
  status: z.enum(["selected", "active", "no-candidate", "human-gate"]),
  selectedWorkItem: PlanningWorkItemSchema.nullable(),
  selectedIntentFingerprint: FingerprintSchema.nullable(),
});

// Swamp supplies persisted global arguments alongside method arguments at
// execution time; strip them before validating the queue selector payload.
export const SentryRepairPlanningQueueArgsSchema = z.object({
  repairIntents: z.array(SentryRepairIntentEnvelopeSchema).max(500),
  planningStates: z.array(SentryRepairPlanningStateSchema).max(500),
  priorSelections: z.array(PriorQueueSelectionSchema).max(1),
});

export const SentryRepairPlanningQueueSelectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["selected", "active", "no-candidate", "human-gate"]),
  action: z.enum(["start", "status", "none"]),
  reason: z.enum([
    "next-queued-intent",
    "resume-active-intent",
    "queue-empty",
    "multiple-intent-versions",
    "multiple-active-repairs",
    "active-intent-missing",
    "invalid-intent-fingerprint",
  ]),
  selectedWorkItem: PlanningWorkItemSchema.nullable(),
  selectedIntentFingerprint: FingerprintSchema.nullable(),
  queuedWorkItems: z.array(PlanningWorkItemSchema).max(500),
  activeWorkItems: z.array(PlanningWorkItemSchema).max(500),
  fingerprint: FingerprintSchema,
});

export type SentryRepairPlanningQueueContext = {
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

type RepairIntentEnvelope = z.infer<typeof SentryRepairIntentEnvelopeSchema>;
type PlanningState = z.infer<typeof SentryRepairPlanningStateSchema>;

async function envelopeFingerprintIsValid(
  envelope: RepairIntentEnvelope,
): Promise<boolean> {
  const expected = await createSentrySha256(canonicalSentryJson({
    schemaVersion: envelope.schemaVersion,
    sourceHandoff: envelope.sourceHandoff,
    sourceHandoffFingerprint: envelope.sourceHandoffFingerprint,
    planningWorkItem: envelope.planningWorkItem,
    intent: envelope.intent,
  }));
  return expected === envelope.fingerprint &&
    envelope.planningWorkItem === envelope.intent.planningWorkItem;
}

function queueOrder(left: RepairIntentEnvelope, right: RepairIntentEnvelope): number {
  return right.intent.severityRank - left.intent.severityRank ||
    right.intent.priorityRank - left.intent.priorityRank ||
    left.intent.firstSeen.localeCompare(right.intent.firstSeen) ||
    left.intent.issueId.localeCompare(right.intent.issueId);
}

function latestStateByWorkItem(states: PlanningState[]): Map<string, PlanningState> {
  return new Map(states.map((state) => [state.workItem, state]));
}

export async function selectSentryRepairPlanningQueue(
  rawArgs: z.infer<typeof SentryRepairPlanningQueueArgsSchema>,
  context: SentryRepairPlanningQueueContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryRepairPlanningQueueArgsSchema.parse(rawArgs);
  const byWorkItem = new Map<string, RepairIntentEnvelope[]>();
  let invalidFingerprint = false;
  for (const envelope of args.repairIntents) {
    if (!await envelopeFingerprintIsValid(envelope)) invalidFingerprint = true;
    const existing = byWorkItem.get(envelope.planningWorkItem) ?? [];
    existing.push(envelope);
    byWorkItem.set(envelope.planningWorkItem, existing);
  }

  const ambiguousWorkItems = [...byWorkItem.entries()]
    .filter(([, envelopes]) => envelopes.length !== 1)
    .map(([workItem]) => workItem)
    .sort();
  const statesByWorkItem = latestStateByWorkItem(args.planningStates);
  const activeWorkItems = args.planningStates
    .filter((state) => state.status === "active")
    .map((state) => state.workItem)
    .sort();
  const orderedQueue = [...byWorkItem.values()]
    .filter((envelopes) => envelopes.length === 1)
    .map(([envelope]) => envelope)
    .filter((envelope) => !statesByWorkItem.has(envelope.planningWorkItem))
    .sort(queueOrder);

  let status: z.infer<typeof SentryRepairPlanningQueueSelectionSchema>["status"];
  let action: z.infer<typeof SentryRepairPlanningQueueSelectionSchema>["action"];
  let reason: z.infer<typeof SentryRepairPlanningQueueSelectionSchema>["reason"];
  let selected: RepairIntentEnvelope | null = null;
  if (invalidFingerprint) {
    status = "human-gate";
    action = "none";
    reason = "invalid-intent-fingerprint";
  } else if (ambiguousWorkItems.length > 0) {
    status = "human-gate";
    action = "none";
    reason = "multiple-intent-versions";
  } else if (activeWorkItems.length > 1) {
    status = "human-gate";
    action = "none";
    reason = "multiple-active-repairs";
  } else if (activeWorkItems.length === 1) {
    const matches = byWorkItem.get(activeWorkItems[0]) ?? [];
    if (matches.length !== 1) {
      status = "human-gate";
      action = "none";
      reason = "active-intent-missing";
    } else {
      status = "active";
      action = "status";
      reason = "resume-active-intent";
      selected = matches[0];
    }
  } else if (
    args.priorSelections[0]?.status === "selected" &&
    args.priorSelections[0].selectedWorkItem !== null &&
    !statesByWorkItem.has(args.priorSelections[0].selectedWorkItem)
  ) {
    const matches = byWorkItem.get(
      args.priorSelections[0].selectedWorkItem,
    ) ?? [];
    if (matches.length !== 1) {
      status = "human-gate";
      action = "none";
      reason = "active-intent-missing";
    } else {
      status = "selected";
      action = "start";
      reason = "next-queued-intent";
      selected = matches[0];
    }
  } else if (orderedQueue.length > 0) {
    status = "selected";
    action = "start";
    reason = "next-queued-intent";
    selected = orderedQueue[0];
  } else {
    status = "no-candidate";
    action = "none";
    reason = "queue-empty";
  }

  const withoutFingerprint = {
    schemaVersion: 1 as const,
    status,
    action,
    reason,
    selectedWorkItem: selected?.planningWorkItem ?? null,
    selectedIntentFingerprint: selected?.fingerprint ?? null,
    queuedWorkItems: orderedQueue.map((envelope) => envelope.planningWorkItem),
    activeWorkItems,
  };
  const selection = SentryRepairPlanningQueueSelectionSchema.parse({
    ...withoutFingerprint,
    fingerprint: await createSentrySha256(canonicalSentryJson(withoutFingerprint)),
  });
  const handle = await context.writeResource(
    "queue-selection",
    "sentry-repair-planning-queue-selection",
    selection,
  );
  context.logger.info("Selected the Sentry repair Planning queue", {
    status,
    action,
    selectedWorkItem: selection.selectedWorkItem ?? "none",
    queuedCount: selection.queuedWorkItems.length,
  });
  return { dataHandles: [handle] };
}
