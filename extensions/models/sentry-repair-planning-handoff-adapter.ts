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
  issuePlans: z.array(SentryRepairAuthoredPlanSchema).max(100).superRefine(
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
});

const SentryRepairPlanningRouteReasonSchema = z.enum([
  "source-ineligible",
  "active-wip",
  "multiple-exact-matches",
  "completed-exact-match",
  "lexical-review",
  "reproduction-required",
  "ambiguous-source",
  "stale-source",
  "dex-drift",
  "missing-authored-plan",
  "unknown-authored-plan",
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
  currentRelease: z.string().min(1).max(160),
  disposition: z.literal("current-release"),
  requiresReproduction: z.literal(false),
  recommendation: z.enum(["create-task", "attach-existing"]),
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
  idempotencyKey: FingerprintSchema,
  fingerprint: FingerprintSchema,
}).superRefine((intent, context) => {
  const hasExistingTask = intent.existingDexTaskId !== null;
  if (
    (intent.recommendation === "attach-existing" && !hasExistingTask) ||
    (intent.recommendation === "create-task" && hasExistingTask)
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Attach intents require one existing task and create intents require none",
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
      throw new Error(`Malformed named Sentry resource ${name}`);
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
    automationEligible: triage.automationEligible,
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
  recommendation: "create-task" | "attach-existing",
  expectedTaskIds: string[],
  tasks: SentryDexTask[],
): boolean {
  const { exact, openExact, completedExact, lexical } =
    findSentryDexTaskMatches(shortId, title, tasks);
  if (recommendation === "create-task") {
    return exact.length === 0 && lexical.length === 0 &&
      expectedTaskIds.length === 0;
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

async function createRepairIntent(
  args: SentryRepairPlanningHandoffArgs,
  snapshot: z.infer<typeof SentryIssueSnapshotSchema>,
  issue: z.infer<typeof SentryIssueReconciliationSchema>["items"][number],
  triageItem: z.infer<typeof SentryDexTriageSchema>["items"][number],
  plan: z.infer<typeof SentryRepairAuthoredPlanSchema>,
) {
  if (snapshot.currentRelease === null) {
    throw new Error("Current-release repair intent requires a release");
  }
  const idempotencyKey = await createSentrySha256(canonicalSentryJson({
    issueId: issue.id,
    sourceSnapshotFingerprint: args.expectedSnapshotFingerprint,
    sourceReconciliationFingerprint: args.expectedReconciliationFingerprint,
    sourceTriageFingerprint: args.expectedTriageFingerprint,
  }));
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
    currentRelease: snapshot.currentRelease,
    disposition: "current-release" as const,
    requiresReproduction: false as const,
    recommendation: triageItem.recommendation as
      | "create-task"
      | "attach-existing",
    existingDexTaskId: triageItem.recommendation === "attach-existing"
      ? triageItem.exactMatchTaskIds[0] ?? null
      : null,
    scope: plan.scope,
    acceptanceCriteria: plan.acceptanceCriteria,
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: snapshot.target,
      issueId: issue.id,
      shortId: issue.shortId,
    },
    planningWorkItem: `sentry-${issue.id}`,
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
  const triageQueueBlockers = triage.blockingReasons.filter((reason) =>
    reason !== "active-wip"
  );
  if (
    !snapshot.complete || !reconciliation.automationEligible ||
    (!triage.automationEligible && triageQueueBlockers.length === 0 &&
      !triage.blockingReasons.includes("active-wip"))
  ) {
    blockingReasons.add("source-ineligible");
  }
  for (const reason of triageQueueBlockers) blockingReasons.add(reason);

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
    item.recommendation === "create-task" ||
    item.recommendation === "attach-existing"
  );
  const candidateIds = new Set(candidates.map((item) => item.issueId));
  for (const issueId of plansByIssueId.keys()) {
    if (!candidateIds.has(issueId)) {
      blockingReasons.add("unknown-authored-plan");
    }
  }
  for (const candidate of candidates) {
    const issue = issueById.get(candidate.issueId);
    const plan = plansByIssueId.get(candidate.issueId);
    if (!issue || !plan) blockingReasons.add("missing-authored-plan");
    if (!issue || issue.shortId !== candidate.shortId) {
      blockingReasons.add("stale-source");
    }
    if (
      !issue || issue.disposition !== "current-release" ||
      issue.requiresReproduction || !issue.repairCandidate ||
      snapshot.currentRelease === null ||
      !snapshot.currentReleaseIssueIds.includes(candidate.issueId)
    ) {
      blockingReasons.add("stale-source");
    }
    if (
      issue && !currentDexRecommendationIsValid(
        candidate.shortId,
        issue.title,
        candidate.recommendation as "create-task" | "attach-existing",
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
          plansByIssueId.get(candidate.issueId)!,
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
    intentHandles.push(await context.writeResource(
      "repair-intent",
      `sentry-repair-intent-${intent.issueId}-${envelope.fingerprint}`,
      envelope,
    ));
  }
  context.logger.info("Stored Sentry repair Planning handoff", {
    status,
    intentCount: intents.length,
  });
  return { dataHandles: [handoffHandle, ...intentHandles] };
}
