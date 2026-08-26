import { z } from "npm:zod@4.4.3";

import {
  createSentryDexTriageFingerprint,
  DenoDexListCommandRunner,
  findSentryDexTaskMatches,
  type SentryDexCommandRunner,
  type SentryDexTask,
  SentryDexTaskSchema,
  SentryDexTriageSchema,
} from "./sentry-dex-triage.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
  SentryIssueReconciliationSchema,
  SentryIssueSnapshotSchema,
} from "./sentry-issue-intake-adapter.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IssueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const BoundedPlanningTextSchema = z.string().trim().min(1).max(2_000);

export const SentryRepairAuthoredPlanSchema = z.strictObject({
  issueId: IssueIdSchema,
  scope: z.array(BoundedPlanningTextSchema).min(1).max(20),
  acceptanceCriteria: z.array(BoundedPlanningTextSchema).min(1).max(20),
});

// Swamp supplies persisted global arguments alongside method arguments at
// execution time. Use a stripping object schema so the global model identity
// remains available through context.globalArgs without entering this contract.
export const SentryRepairPlanningHandoffArgsSchema = z.object({
  sourceSnapshot: z.string().min(1).max(180),
  expectedSnapshotFingerprint: FingerprintSchema,
  sourceReconciliation: z.string().min(1).max(180),
  expectedReconciliationFingerprint: FingerprintSchema,
  sourceTriage: z.string().min(1).max(180),
  expectedTriageFingerprint: FingerprintSchema,
  issuePlans: z.array(SentryRepairAuthoredPlanSchema).max(100).default([])
    .superRefine(
      (plans, context) => {
        const issueIds = plans.map((plan) => plan.issueId);
        if (new Set(issueIds).size !== issueIds.length) {
          context.addIssue({
            code: "custom",
            message: "Authored repair plans must have unique issue ids",
          });
        }
      },
    ),
  priorIntents: z.array(
    z.lazy(() => SentryRepairIntentEnvelopeSchema),
  ).max(5_000).default([]),
});

const SentryRepairPlanningRouteReasonSchema = z.enum([
  "source-ineligible",
  "multiple-exact-matches",
  "completed-exact-match",
  "lexical-review",
  "ambiguous-source",
  "stale-source",
  "dex-drift",
  "unknown-authored-plan",
  "invalid-prior-intent",
  "conflicting-intent-supersession",
]);

export const SentryRepairIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceSnapshot: z.string().min(1),
  sourceSnapshotFingerprint: FingerprintSchema,
  sourceReconciliation: z.string().min(1),
  sourceReconciliationFingerprint: FingerprintSchema,
  sourceTriage: z.string().min(1),
  sourceTriageFingerprint: FingerprintSchema,
  sentryTarget: z.string().min(1).max(160),
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  title: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high"]).nullable(),
  level: z.enum(["debug", "info", "warning", "error", "fatal"]).nullable(),
  firstSeen: z.string().datetime(),
  severityRank: z.number().int().min(0).max(5),
  priorityRank: z.number().int().min(0).max(3),
  observedAt: z.string().datetime(),
  currentRelease: z.string().min(1).max(160),
  disposition: z.enum(["current-release", "recent"]),
  queueIntent: z.enum(["confirmed-repair", "reproduction-required"]),
  requiresReproduction: z.boolean(),
  recommendation: z.enum(["create-task", "attach-existing", "reproduce-first"]),
  existingDexTaskId: z.string().min(1).max(100).nullable(),
  scope: z.array(BoundedPlanningTextSchema).min(1).max(20),
  acceptanceCriteria: z.array(BoundedPlanningTextSchema).min(1).max(20),
  requestedSentryBacklink: z.strictObject({
    status: z.literal("requested"),
    mode: z.literal("post-planning-comment"),
    target: z.string().min(1).max(160),
    issueId: IssueIdSchema,
    shortId: IssueIdSchema,
  }),
  planningWorkItem: z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/),
  supersedesIntentFingerprint: FingerprintSchema.nullable().default(null),
  idempotencyKey: FingerprintSchema,
  fingerprint: FingerprintSchema,
}).superRefine((intent, context) => {
  const hasExistingTask = intent.existingDexTaskId !== null;
  if (
    (intent.recommendation === "attach-existing" && !hasExistingTask) ||
    (intent.recommendation !== "attach-existing" && hasExistingTask)
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Attach intents require one existing task and non-attach intents require none",
    });
  }
  if (
    intent.requiresReproduction !==
      (intent.queueIntent === "reproduction-required") ||
    intent.disposition !==
      (intent.queueIntent === "confirmed-repair"
        ? "current-release"
        : "recent") ||
    (intent.queueIntent === "confirmed-repair" &&
      intent.recommendation === "reproduce-first")
  ) {
    context.addIssue({
      code: "custom",
      message: "Repair intent route must match its observation disposition",
    });
  }
});

export const SentryRepairIntentEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceHandoff: z.string().min(1),
  sourceHandoffFingerprint: FingerprintSchema,
  planningWorkItem: z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/),
  intent: SentryRepairIntentSchema,
  fingerprint: FingerprintSchema,
});

export const SentryRepairPlanningHandoffSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["ready", "human-gate", "no-candidate"]),
  sourceSnapshot: z.string().min(1),
  sourceSnapshotFingerprint: FingerprintSchema,
  sourceReconciliation: z.string().min(1),
  sourceReconciliationFingerprint: FingerprintSchema,
  sourceTriage: z.string().min(1),
  sourceTriageFingerprint: FingerprintSchema,
  generatedAt: z.string().datetime(),
  blockingReasons: z.array(SentryRepairPlanningRouteReasonSchema),
  intents: z.array(SentryRepairIntentSchema).max(100),
  fingerprint: FingerprintSchema,
}).superRefine((handoff, context) => {
  if (handoff.status === "ready" && handoff.intents.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Ready handoff needs intents",
    });
  }
  if (handoff.status !== "ready" && handoff.intents.length !== 0) {
    context.addIssue({
      code: "custom",
      message: "Non-ready handoff cannot expose repair intents",
    });
  }
  if (
    handoff.status === "human-gate" && handoff.blockingReasons.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "Human-gate handoff needs a blocking reason",
    });
  }
  if (
    handoff.status !== "human-gate" && handoff.blockingReasons.length !== 0
  ) {
    context.addIssue({
      code: "custom",
      message: "Only human-gate handoffs can have blocking reasons",
    });
  }
});

export type SentryRepairPlanningHandoffArgs = z.infer<
  typeof SentryRepairPlanningHandoffArgsSchema
>;

export type SentryRepairPlanningHandoffContext = {
  repoDir: string;
  globalArgs: { sourceIntakeModelId: string };
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
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

export type SentryRepairPlanningHandoffDependencies = {
  dexCommandRunner: SentryDexCommandRunner;
};

export const DEFAULT_SENTRY_REPAIR_PLANNING_HANDOFF_DEPENDENCIES:
  SentryRepairPlanningHandoffDependencies = {
    dexCommandRunner: new DenoDexListCommandRunner(),
  };

async function readRequiredResource<T>(
  name: string,
  schema: z.ZodType<T>,
  context: SentryRepairPlanningHandoffContext,
): Promise<T> {
  const sourceModelId = z.string().uuid().parse(
    context.globalArgs.sourceIntakeModelId,
  );
  const content = await context.dataRepository.getContent(
    "@supers/sentry-issue-intake",
    sourceModelId,
    name,
  );
  if (content === null) {
    throw new Error(`Missing named Sentry resource ${name}`);
  }
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(content)));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Malformed named Sentry resource ${name}`, { cause: error });
    }
    throw error;
  }
}

function createSnapshotFingerprint(
  snapshot: z.infer<typeof SentryIssueSnapshotSchema>,
): Promise<string> {
  const args: Record<string, unknown> = {
    lookbackDays: snapshot.lookbackDays,
    historyDays: snapshot.historyDays,
    limit: snapshot.limit,
  };
  if (snapshot.currentRelease !== null) {
    args.currentRelease = snapshot.currentRelease;
  }
  return createSentrySha256(JSON.stringify({
    target: snapshot.target,
    args,
    capturedAt: snapshot.capturedAt,
    issues: snapshot.issues,
    recentIds: snapshot.recentIssueIds,
    releaseIds: snapshot.currentReleaseIssueIds,
    complete: snapshot.complete,
  }));
}

function createReconciliationFingerprint(
  reconciliation: z.infer<typeof SentryIssueReconciliationSchema>,
): Promise<string> {
  return createSentrySha256(canonicalSentryJson({
    sourceSnapshot: reconciliation.sourceSnapshot,
    sourceFingerprint: reconciliation.sourceFingerprint,
    automationEligible: reconciliation.automationEligible,
    items: reconciliation.items,
  }));
}

async function sourceChainIsCurrent(
  args: SentryRepairPlanningHandoffArgs,
  snapshot: z.infer<typeof SentryIssueSnapshotSchema>,
  reconciliation: z.infer<typeof SentryIssueReconciliationSchema>,
  triage: z.infer<typeof SentryDexTriageSchema>,
): Promise<boolean> {
  const computedSnapshotFingerprint = await createSnapshotFingerprint(snapshot);
  const computedReconciliationFingerprint =
    await createReconciliationFingerprint(reconciliation);
  const computedTriageFingerprint = await createSentryDexTriageFingerprint({
    sourceReconciliation: triage.sourceReconciliation,
    sourceFingerprint: triage.sourceFingerprint,
    sourceReconciliationFingerprint: triage.sourceReconciliationFingerprint,
    dexTaskCount: triage.dexTaskCount,
    activeTaskIds: triage.activeTaskIds,
    queueEligible: triage.queueEligible,
    executionCapacity: triage.executionCapacity,
    blockingReasons: triage.blockingReasons,
    items: triage.items,
  });
  return snapshot.fingerprint === args.expectedSnapshotFingerprint &&
    snapshot.fingerprint === computedSnapshotFingerprint &&
    reconciliation.sourceSnapshot === args.sourceSnapshot &&
    reconciliation.sourceFingerprint === snapshot.fingerprint &&
    reconciliation.fingerprint === args.expectedReconciliationFingerprint &&
    reconciliation.fingerprint === computedReconciliationFingerprint &&
    triage.sourceReconciliation === args.sourceReconciliation &&
    triage.sourceFingerprint === snapshot.fingerprint &&
    triage.sourceReconciliationFingerprint === reconciliation.fingerprint &&
    triage.fingerprint === args.expectedTriageFingerprint &&
    triage.fingerprint === computedTriageFingerprint;
}

function currentDexRecommendationIsValid(
  shortId: string,
  title: string,
  recommendation: "create-task" | "attach-existing" | "reproduce-first",
  expectedTaskIds: string[],
  tasks: SentryDexTask[],
): boolean {
  const { openExact, completedExact, lexical } = findSentryDexTaskMatches(
    shortId,
    title,
    tasks,
  );
  if (
    recommendation === "create-task" || recommendation === "reproduce-first"
  ) {
    const expectedCompletedTaskIds = [...expectedTaskIds].sort();
    const currentCompletedTaskIds = completedExact.map((task) => task.id)
      .sort();
    return openExact.length === 0 && lexical.length === 0 &&
      expectedCompletedTaskIds.length === currentCompletedTaskIds.length &&
      expectedCompletedTaskIds.every((taskId, index) =>
        taskId === currentCompletedTaskIds[index]
      );
  }
  return openExact.length === 1 && completedExact.length === 0 &&
    expectedTaskIds.length === 1 && openExact[0]?.id === expectedTaskIds[0];
}

function sentrySeverityRank(
  level: "debug" | "info" | "warning" | "error" | "fatal" | null,
): number {
  if (level === "fatal") return 5;
  if (level === "error") return 4;
  if (level === "warning") return 3;
  if (level === "info") return 2;
  if (level === "debug") return 1;
  return 0;
}

function sentryPriorityRank(
  priority: "low" | "medium" | "high" | null,
): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  if (priority === "low") return 1;
  return 0;
}

type SentryRepairIntentEnvelope = z.infer<
  typeof SentryRepairIntentEnvelopeSchema
>;

async function repairIntentEnvelopeFingerprintIsValid(
  envelope: SentryRepairIntentEnvelope,
): Promise<boolean> {
  return envelope.fingerprint === await createSentrySha256(canonicalSentryJson({
    schemaVersion: envelope.schemaVersion,
    sourceHandoff: envelope.sourceHandoff,
    sourceHandoffFingerprint: envelope.sourceHandoffFingerprint,
    planningWorkItem: envelope.planningWorkItem,
    intent: envelope.intent,
  }));
}

function latestPriorIntent(
  priorIntents: SentryRepairIntentEnvelope[],
): { head: SentryRepairIntentEnvelope | null; conflict: boolean } {
  if (priorIntents.length === 0) return { head: null, conflict: false };
  const fingerprints = new Set(priorIntents.map((entry) => entry.fingerprint));
  const referenced = new Set(
    priorIntents.flatMap((entry) =>
      entry.intent.supersedesIntentFingerprint === null
        ? []
        : [entry.intent.supersedesIntentFingerprint]
    ),
  );
  if ([...referenced].some((fingerprint) => !fingerprints.has(fingerprint))) {
    return { head: null, conflict: true };
  }
  const heads = priorIntents.filter((entry) =>
    !referenced.has(entry.fingerprint)
  );
  return heads.length === 1
    ? { head: heads[0], conflict: false }
    : { head: null, conflict: true };
}

function defaultRepairPlan(
  queueIntent: "confirmed-repair" | "reproduction-required",
): z.infer<typeof SentryRepairAuthoredPlanSchema> {
  return queueIntent === "reproduction-required"
    ? {
      issueId: "placeholder",
      scope: [
        "Reproduce the bounded Sentry issue against the current checkout before any repair.",
      ],
      acceptanceCriteria: [
        "Store a typed reproduced, not-reproduced, or inconclusive receipt bound to the source evidence.",
      ],
    }
    : {
      issueId: "placeholder",
      scope: [
        "Diagnose and repair the confirmed Sentry failure without widening public behavior.",
      ],
      acceptanceCriteria: [
        "The affected flow passes deterministic verification without the confirmed failure.",
      ],
    };
}

async function createRepairIntent(
  args: SentryRepairPlanningHandoffArgs,
  snapshot: z.infer<typeof SentryIssueSnapshotSchema>,
  issue: z.infer<typeof SentryIssueReconciliationSchema>["items"][number],
  triageItem: z.infer<typeof SentryDexTriageSchema>["items"][number],
  plan: z.infer<typeof SentryRepairAuthoredPlanSchema> | undefined,
  priorHead: SentryRepairIntentEnvelope | null,
  priorIntents: SentryRepairIntentEnvelope[],
) {
  if (snapshot.currentRelease === null || issue.queueIntent === null) {
    throw new Error(
      "Actionable Sentry queue intent requires a current checkout release",
    );
  }
  const resolvedPlan = plan ?? {
    ...defaultRepairPlan(issue.queueIntent),
    issueId: issue.id,
  };
  const idempotencyKey = await createSentrySha256(canonicalSentryJson({
    issueId: issue.id,
    sourceSnapshotFingerprint: args.expectedSnapshotFingerprint,
    sourceReconciliationFingerprint: args.expectedReconciliationFingerprint,
    sourceTriageFingerprint: args.expectedTriageFingerprint,
    scope: resolvedPlan.scope,
    acceptanceCriteria: resolvedPlan.acceptanceCriteria,
  }));
  const replayIntent = priorIntents.find((entry) =>
    entry.intent.idempotencyKey === idempotencyKey
  );
  if (replayIntent) return replayIntent.intent;
  const intentBase = {
    schemaVersion: 1 as const,
    sourceSnapshot: args.sourceSnapshot,
    sourceSnapshotFingerprint: args.expectedSnapshotFingerprint,
    sourceReconciliation: args.sourceReconciliation,
    sourceReconciliationFingerprint: args.expectedReconciliationFingerprint,
    sourceTriage: args.sourceTriage,
    sourceTriageFingerprint: args.expectedTriageFingerprint,
    sentryTarget: snapshot.target,
    issueId: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    priority: issue.priority,
    level: issue.level,
    firstSeen: issue.firstSeen,
    severityRank: sentrySeverityRank(issue.level),
    priorityRank: sentryPriorityRank(issue.priority),
    observedAt: snapshot.capturedAt,
    currentRelease: snapshot.currentRelease,
    disposition: issue.disposition as "current-release" | "recent",
    queueIntent: issue.queueIntent,
    requiresReproduction: issue.queueIntent === "reproduction-required",
    recommendation: triageItem.recommendation as
      | "create-task"
      | "attach-existing"
      | "reproduce-first",
    existingDexTaskId: triageItem.recommendation === "attach-existing"
      ? triageItem.exactMatchTaskIds[0] ?? null
      : null,
    scope: resolvedPlan.scope,
    acceptanceCriteria: resolvedPlan.acceptanceCriteria,
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: snapshot.target,
      issueId: issue.id,
      shortId: issue.shortId,
    },
    planningWorkItem: `sentry-${issue.id}`,
    supersedesIntentFingerprint: priorHead?.fingerprint ?? null,
    idempotencyKey,
  };
  return SentryRepairIntentSchema.parse({
    ...intentBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(intentBase)),
  });
}

export async function executeSentryRepairPlanningHandoff(
  rawArgs: SentryRepairPlanningHandoffArgs,
  context: SentryRepairPlanningHandoffContext,
  dependencies: SentryRepairPlanningHandoffDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryRepairPlanningHandoffArgsSchema.parse(rawArgs);
  const [snapshot, reconciliation, triage] = await Promise.all([
    readRequiredResource(
      args.sourceSnapshot,
      SentryIssueSnapshotSchema,
      context,
    ),
    readRequiredResource(
      args.sourceReconciliation,
      SentryIssueReconciliationSchema,
      context,
    ),
    readRequiredResource(args.sourceTriage, SentryDexTriageSchema, context),
  ]);

  const blockingReasons = new Set<
    z.infer<typeof SentryRepairPlanningRouteReasonSchema>
  >();
  if (!await sourceChainIsCurrent(args, snapshot, reconciliation, triage)) {
    blockingReasons.add("stale-source");
  }
  if (
    !snapshot.complete || !reconciliation.automationEligible ||
    (!triage.queueEligible && triage.blockingReasons.length === 0 &&
      triage.items.some((item) => item.queueIntent !== null))
  ) {
    blockingReasons.add("source-ineligible");
  }
  for (const reason of triage.blockingReasons) blockingReasons.add(reason);

  const priorIntentsByIssue = new Map<string, SentryRepairIntentEnvelope[]>();
  for (const envelope of args.priorIntents) {
    if (!await repairIntentEnvelopeFingerprintIsValid(envelope)) {
      blockingReasons.add("invalid-prior-intent");
      continue;
    }
    const existing = priorIntentsByIssue.get(envelope.intent.issueId) ?? [];
    existing.push(envelope);
    priorIntentsByIssue.set(envelope.intent.issueId, existing);
  }
  const priorHeadsByIssue = new Map<
    string,
    SentryRepairIntentEnvelope | null
  >();
  for (const [issueId, priorIntents] of priorIntentsByIssue) {
    const { head, conflict } = latestPriorIntent(priorIntents);
    if (conflict) blockingReasons.add("conflicting-intent-supersession");
    priorHeadsByIssue.set(issueId, head);
  }

  const command = await dependencies.dexCommandRunner.run(
    ["list", "--all", "--json"],
    context.repoDir,
    20_000,
  );
  if (command.code !== 0) {
    throw new Error(`dex list failed with exit ${command.code}`);
  }
  let tasks: SentryDexTask[];
  try {
    tasks = z.array(SentryDexTaskSchema).max(2_000).parse(
      JSON.parse(command.stdout),
    );
  } catch {
    throw new Error("dex list returned malformed or out-of-contract JSON");
  }
  const issueById = new Map(
    reconciliation.items.map((issue) => [issue.id, issue]),
  );
  const plansByIssueId = new Map(
    args.issuePlans.map((plan) => [plan.issueId, plan]),
  );
  const candidates = triage.items.filter((item) =>
    item.queueIntent !== null && (
      item.recommendation === "create-task" ||
      item.recommendation === "attach-existing" ||
      item.recommendation === "reproduce-first"
    )
  );
  if (candidates.length === 0) {
    for (const item of triage.items) {
      if (item.quarantineReason !== null) {
        blockingReasons.add(item.quarantineReason);
      }
    }
  }
  const candidateIds = new Set(candidates.map((item) => item.issueId));
  for (const issueId of plansByIssueId.keys()) {
    if (!candidateIds.has(issueId)) {
      blockingReasons.add("unknown-authored-plan");
    }
  }
  for (const candidate of candidates) {
    const issue = issueById.get(candidate.issueId);
    if (
      !issue || issue.shortId !== candidate.shortId ||
      issue.queueIntent !== candidate.queueIntent
    ) {
      blockingReasons.add("stale-source");
    }
    const observationIsBound = issue?.disposition === "current-release"
      ? snapshot.currentReleaseIssueIds.includes(candidate.issueId)
      : issue?.disposition === "recent"
      ? snapshot.recentIssueIds.includes(candidate.issueId) &&
        !snapshot.currentReleaseIssueIds.includes(candidate.issueId)
      : false;
    if (!issue || !observationIsBound || snapshot.currentRelease === null) {
      blockingReasons.add("stale-source");
    }
    if (
      issue && !currentDexRecommendationIsValid(
        candidate.shortId,
        issue.title,
        candidate.recommendation as
          | "create-task"
          | "attach-existing"
          | "reproduce-first",
        candidate.exactMatchTaskIds,
        tasks,
      )
    ) {
      blockingReasons.add("dex-drift");
    }
  }

  let status: "ready" | "human-gate" | "no-candidate";
  let intents: Array<z.infer<typeof SentryRepairIntentSchema>> = [];
  if (blockingReasons.size > 0) {
    status = "human-gate";
  } else if (candidates.length === 0) {
    status = "no-candidate";
  } else {
    status = "ready";
    intents = (await Promise.all(
      candidates.map((candidate) =>
        createRepairIntent(
          args,
          snapshot,
          issueById.get(candidate.issueId)!,
          candidate,
          plansByIssueId.get(candidate.issueId),
          priorHeadsByIssue.get(candidate.issueId) ?? null,
          priorIntentsByIssue.get(candidate.issueId) ?? [],
        )
      ),
    )).sort((left, right) =>
      right.severityRank - left.severityRank ||
      right.priorityRank - left.priorityRank ||
      left.firstSeen.localeCompare(right.firstSeen) ||
      left.issueId.localeCompare(right.issueId)
    );
  }

  const handoffBase = {
    schemaVersion: 1 as const,
    status,
    sourceSnapshot: args.sourceSnapshot,
    sourceSnapshotFingerprint: snapshot.fingerprint,
    sourceReconciliation: args.sourceReconciliation,
    sourceReconciliationFingerprint: reconciliation.fingerprint,
    sourceTriage: args.sourceTriage,
    sourceTriageFingerprint: triage.fingerprint,
    blockingReasons: [...blockingReasons].sort(),
    intents,
  };
  const fingerprint = await createSentrySha256(
    canonicalSentryJson(handoffBase),
  );
  const handoffName = `sentry-repair-planning-handoff-${fingerprint}`;
  const handoff = SentryRepairPlanningHandoffSchema.parse({
    ...handoffBase,
    generatedAt: triage.generatedAt,
    fingerprint,
  });
  const handoffHandle = await context.writeResource(
    "handoff",
    handoffName,
    handoff,
  );
  const intentHandles: Array<{ name: string }> = [];
  for (const intent of intents) {
    const envelopeBase = {
      schemaVersion: 1 as const,
      sourceHandoff: handoffName,
      sourceHandoffFingerprint: fingerprint,
      planningWorkItem: intent.planningWorkItem,
      intent,
    };
    const envelope = SentryRepairIntentEnvelopeSchema.parse({
      ...envelopeBase,
      fingerprint: await createSentrySha256(canonicalSentryJson(envelopeBase)),
    });
    intentHandles.push(
      await context.writeResource(
        "repair-intent",
        `sentry-repair-intent-${intent.issueId}-${envelope.fingerprint}`,
        envelope,
      ),
    );
  }
  context.logger.info("Stored Sentry repair Planning handoff", {
    status,
    intentCount: intents.length,
  });
  return { dataHandles: [handoffHandle, ...intentHandles] };
}
