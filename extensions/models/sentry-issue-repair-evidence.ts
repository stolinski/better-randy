import { z } from "npm:zod@4.4.3";

import {
  canonicalSentryJson,
  createSentrySha256,
  sanitizeSentryEvidenceText,
  type SentryCommandRunner,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryRepairIntentEnvelopeSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  SentryRepairPlanningQueueSelectionSchema,
} from "./sentry-repair-planning-queue.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const IssueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const BoundedEvidenceTextSchema = z.string().trim().min(1).max(2_000);

export const SentryIssueRepairEvidenceArgsSchema = z.strictObject({
  repairIntentName: z.string().min(1).max(220),
  expectedRepairIntentFingerprint: FingerprintSchema,
  queueSelectionName: z.string().min(1).max(220),
  expectedQueueSelectionFingerprint: FingerprintSchema,
});

const SentryStackFrameSchema = z.strictObject({
  filename: z.string().min(1).max(300),
  function: z.string().min(1).max(200).nullable(),
  lineNo: z.number().int().positive().nullable(),
  colNo: z.number().int().positive().nullable(),
  inApp: z.boolean(),
});

const SentrySeerRootCauseSchema = z.strictObject({
  description: BoundedEvidenceTextSchema,
  relevantRepos: z.array(z.string().min(1).max(200)).max(10),
});

const SentrySeerPlanStepSchema = z.strictObject({
  title: z.string().trim().min(1).max(300),
  description: BoundedEvidenceTextSchema,
});

export const SentryIssueRepairEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal("sentry-issue-event-evidence-v1"),
  advisorySeer: z.literal(true),
  repairIntentName: z.string().min(1).max(220),
  repairIntentFingerprint: FingerprintSchema,
  repairIdentityFingerprint: FingerprintSchema,
  queueSelectionName: z.string().min(1).max(220),
  queueSelectionFingerprint: FingerprintSchema,
  sourceSnapshotFingerprint: FingerprintSchema,
  sourceReconciliationFingerprint: FingerprintSchema,
  sourceTriageFingerprint: FingerprintSchema,
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  issueStatus: z.literal("unresolved"),
  eventId: z.string().regex(/^[A-Fa-f0-9]{32}$/),
  eventOccurredAt: z.string().datetime(),
  lastSeen: z.string().datetime(),
  eventRelease: z.string().min(1).max(200).nullable(),
  culprit: z.string().trim().min(1).max(400).nullable(),
  stackFrames: z.array(SentryStackFrameSchema).max(30),
  breadcrumbCategories: z.array(z.string().min(1).max(160)).max(30),
  seerRootCauses: z.array(SentrySeerRootCauseSchema).max(10),
  seerPlanRunId: z.number().int().nonnegative(),
  seerPlanSummary: BoundedEvidenceTextSchema,
  seerPlanSteps: z.array(SentrySeerPlanStepSchema).min(1).max(20),
  checkoutRevision: GitRevisionSchema,
  capturedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
}).superRefine((evidence, context) => {
  if (
    new Date(evidence.eventOccurredAt).getTime() !==
      new Date(evidence.lastSeen).getTime()
  ) {
    context.addIssue({
      code: "custom",
      message: "Latest event and issue last-seen watermarks must match",
    });
  }
});

const RawFrameSchema = z.object({
  filename: z.string().nullish(),
  function: z.string().nullish(),
  lineNo: z.number().int().positive().nullish(),
  colNo: z.number().int().positive().nullish(),
  inApp: z.boolean().nullish(),
}).passthrough();
const RawEntrySchema = z.object({
  type: z.string().nullish(),
  data: z.unknown().optional(),
}).passthrough();
const RawEventSchema = z.object({
  eventID: z.string(),
  dateCreated: z.string().datetime(),
  culprit: z.string().nullish(),
  release: z.union([
    z.string(),
    z.object({ version: z.string() }).passthrough(),
  ]).nullish(),
  entries: z.array(RawEntrySchema).max(100).default([]),
}).passthrough();
const RawIssueSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  shortId: z.string(),
  status: z.string(),
  lastSeen: z.string().datetime(),
  culprit: z.string().nullish(),
  event: RawEventSchema,
}).passthrough();
const RawSeerRootCauseSchema = z.object({
  description: z.string(),
  relevant_repos: z.array(z.string()).max(20).default([]),
}).passthrough();
const RawSeerPlanSchema = z.object({
  run_id: z.number().int().nonnegative(),
  status: z.literal("COMPLETED"),
  solution: z.object({
    one_line_summary: z.string(),
    steps: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
      }).passthrough(),
    ).min(1).max(40),
  }).passthrough(),
}).passthrough();

export type SentryIssueRepairEvidenceContext = {
  repoDir: string;
  globalArgs: { sourceRepairModelId: string };
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
};

export type SentryIssueRepairEvidenceDependencies = {
  commandRunner: SentryCommandRunner;
  resolveCheckoutRevision: (repoDir: string) => Promise<string>;
  now: () => string;
};

function boundedText(value: string, maximum = 2_000): string {
  if (value.length > maximum * 4) {
    throw new Error("Sentry evidence text exceeds its input bound");
  }
  const normalized = sanitizeSentryEvidenceText(value, maximum);
  if (normalized.length === 0) {
    throw new Error("Sentry evidence text is empty after redaction");
  }
  return normalized;
}

async function readJsonResource(
  context: SentryIssueRepairEvidenceContext,
  modelId: string,
  name: string,
): Promise<unknown> {
  const content = await context.dataRepository.getContent(
    "@supers/sentry-repair-planning-handoff",
    modelId,
    name,
  );
  if (content === null) {
    throw new Error(`Missing Sentry authority resource ${name}`);
  }
  return JSON.parse(new TextDecoder().decode(content));
}

async function runJson(
  runner: SentryCommandRunner,
  args: readonly string[],
  repoDir: string,
  timeoutMs: number,
): Promise<unknown> {
  const result = await runner.run(args, repoDir, timeoutMs);
  if (result.code !== 0) {
    throw new Error(`Sentry evidence command failed with exit ${result.code}`);
  }
  if (result.stdout.length > 4_000_000) {
    throw new Error("Sentry evidence command exceeded the output bound");
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("Sentry evidence command returned malformed JSON");
  }
}

function stackFrames(event: z.infer<typeof RawEventSchema>) {
  const frames: z.infer<typeof SentryStackFrameSchema>[] = [];
  for (const entry of event.entries) {
    const values = z.object({
      values: z.array(
        z.object({
          stacktrace: z.object({ frames: z.array(RawFrameSchema).max(500) })
            .nullish(),
        }).passthrough(),
      ).max(100),
    }).safeParse(entry.data);
    if (!values.success) continue;
    for (const value of values.data.values) {
      for (const frame of value.stacktrace?.frames ?? []) {
        if (!frame.filename || frame.inApp !== true) continue;
        frames.push(SentryStackFrameSchema.parse({
          filename: boundedText(frame.filename, 300),
          function: frame.function ? boundedText(frame.function, 200) : null,
          lineNo: frame.lineNo ?? null,
          colNo: frame.colNo ?? null,
          inApp: true,
        }));
      }
    }
  }
  return frames.slice(-30);
}

function breadcrumbCategories(event: z.infer<typeof RawEventSchema>): string[] {
  const categories = new Set<string>();
  for (const entry of event.entries) {
    const values = z.object({
      values: z.array(
        z.object({
          category: z.string().nullish(),
        }).passthrough(),
      ).max(500),
    }).safeParse(entry.data);
    if (!values.success) continue;
    for (const value of values.data.values) {
      if (value.category) categories.add(boundedText(value.category, 160));
    }
  }
  return [...categories].sort().slice(0, 30);
}

function intentFingerprint(
  envelope: z.infer<typeof SentryRepairIntentEnvelopeSchema>,
): Promise<string> {
  const { fingerprint: _fingerprint, ...base } = envelope.intent;
  return createSentrySha256(canonicalSentryJson(base));
}

function envelopeFingerprint(
  envelope: z.infer<typeof SentryRepairIntentEnvelopeSchema>,
): Promise<string> {
  return createSentrySha256(canonicalSentryJson({
    schemaVersion: envelope.schemaVersion,
    sourceHandoff: envelope.sourceHandoff,
    sourceHandoffFingerprint: envelope.sourceHandoffFingerprint,
    planningWorkItem: envelope.planningWorkItem,
    intent: envelope.intent,
  }));
}

export async function executeCollectSentryIssueRepairEvidence(
  rawArgs: z.infer<typeof SentryIssueRepairEvidenceArgsSchema>,
  context: SentryIssueRepairEvidenceContext,
  dependencies: SentryIssueRepairEvidenceDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryIssueRepairEvidenceArgsSchema.parse(rawArgs);
  const sourceModelId = z.string().uuid().parse(
    context.globalArgs.sourceRepairModelId,
  );
  const [rawEnvelope, rawSelection] = await Promise.all([
    readJsonResource(context, sourceModelId, args.repairIntentName),
    readJsonResource(context, sourceModelId, args.queueSelectionName),
  ]);
  const envelope = SentryRepairIntentEnvelopeSchema.parse(rawEnvelope);
  const selection = SentryRepairPlanningQueueSelectionSchema.parse(
    rawSelection,
  );
  const [computedIntentFingerprint, computedEnvelopeFingerprint] = await Promise
    .all([
      intentFingerprint(envelope),
      envelopeFingerprint(envelope),
    ]);
  const { fingerprint: _selectionFingerprint, ...selectionBase } = selection;
  const computedSelectionFingerprint = await createSentrySha256(
    canonicalSentryJson(selectionBase),
  );
  if (
    envelope.intent.fingerprint !== computedIntentFingerprint ||
    envelope.planningWorkItem !== envelope.intent.planningWorkItem ||
    envelope.fingerprint !== computedEnvelopeFingerprint ||
    envelope.fingerprint !== args.expectedRepairIntentFingerprint ||
    selection.fingerprint !== computedSelectionFingerprint ||
    selection.fingerprint !== args.expectedQueueSelectionFingerprint ||
    selection.status !== "selected" ||
    selection.selectedWorkItem !== envelope.planningWorkItem ||
    selection.selectedIntentFingerprint !== envelope.fingerprint ||
    selection.action !== "start"
  ) {
    throw new Error("Sentry evidence source authority mismatch");
  }

  const checkoutBefore = GitRevisionSchema.parse(
    await dependencies.resolveCheckoutRevision(context.repoDir),
  );
  const rawInitialIssue = await runJson(
    dependencies.commandRunner,
    ["issue", "view", envelope.intent.shortId, "--fresh", "--json"],
    context.repoDir,
    20_000,
  );
  const initialIssue = RawIssueSchema.parse(rawInitialIssue);
  const [rawRootCauses, rawPlan] = await Promise.all([
    runJson(
      dependencies.commandRunner,
      ["issue", "explain", envelope.intent.shortId, "--fresh", "--json"],
      context.repoDir,
      180_000,
    ),
    runJson(
      dependencies.commandRunner,
      ["issue", "plan", envelope.intent.shortId, "--fresh", "--json"],
      context.repoDir,
      180_000,
    ),
  ]);
  const rawFinalIssue = await runJson(
    dependencies.commandRunner,
    ["issue", "view", envelope.intent.shortId, "--fresh", "--json"],
    context.repoDir,
    20_000,
  );
  const issue = RawIssueSchema.parse(rawFinalIssue);
  const rootCauses = z.array(RawSeerRootCauseSchema).max(10).parse(
    rawRootCauses,
  );
  const plan = RawSeerPlanSchema.parse(rawPlan);
  if (
    initialIssue.id !== issue.id ||
    initialIssue.shortId !== issue.shortId ||
    initialIssue.event.eventID !== issue.event.eventID ||
    new Date(initialIssue.lastSeen).getTime() !==
      new Date(issue.lastSeen).getTime()
  ) {
    throw new Error("Sentry event advanced while collecting Seer evidence");
  }
  const checkoutAfter = GitRevisionSchema.parse(
    await dependencies.resolveCheckoutRevision(context.repoDir),
  );
  if (checkoutBefore !== checkoutAfter) {
    throw new Error("Checkout changed while collecting Sentry evidence");
  }
  if (
    issue.id !== envelope.intent.issueId ||
    issue.shortId !== envelope.intent.shortId ||
    issue.status !== "unresolved" ||
    new Date(issue.event.dateCreated).getTime() !==
      new Date(issue.lastSeen).getTime()
  ) {
    throw new Error("Fresh Sentry issue identity or event watermark drifted");
  }
  const eventRelease = typeof issue.event.release === "string"
    ? issue.event.release
    : issue.event.release?.version ?? null;
  const repairIdentityFingerprint = await createSentrySha256(
    canonicalSentryJson({
      authority: "sentry-issue-event-evidence-v1",
      issueId: issue.id,
      shortId: issue.shortId,
      eventId: issue.event.eventID,
      eventOccurredAt: issue.event.dateCreated,
    }),
  );
  const base = {
    schemaVersion: 1 as const,
    authority: "sentry-issue-event-evidence-v1" as const,
    advisorySeer: true as const,
    repairIntentName: args.repairIntentName,
    repairIntentFingerprint: envelope.fingerprint,
    repairIdentityFingerprint,
    queueSelectionName: args.queueSelectionName,
    queueSelectionFingerprint: selection.fingerprint,
    sourceSnapshotFingerprint: envelope.intent.sourceSnapshotFingerprint,
    sourceReconciliationFingerprint:
      envelope.intent.sourceReconciliationFingerprint,
    sourceTriageFingerprint: envelope.intent.sourceTriageFingerprint,
    issueId: issue.id,
    shortId: issue.shortId,
    issueStatus: "unresolved" as const,
    eventId: issue.event.eventID,
    eventOccurredAt: issue.event.dateCreated,
    lastSeen: issue.lastSeen,
    eventRelease,
    culprit: issue.culprit || issue.event.culprit
      ? boundedText(issue.culprit ?? issue.event.culprit ?? "", 400)
      : null,
    stackFrames: stackFrames(issue.event),
    breadcrumbCategories: breadcrumbCategories(issue.event),
    seerRootCauses: rootCauses.map((cause) => ({
      description: boundedText(cause.description),
      relevantRepos: cause.relevant_repos.map((repo) => boundedText(repo, 200)),
    })),
    seerPlanRunId: plan.run_id,
    seerPlanSummary: boundedText(plan.solution.one_line_summary),
    seerPlanSteps: plan.solution.steps.map((step) => ({
      title: boundedText(step.title, 300),
      description: boundedText(step.description),
    })),
    checkoutRevision: checkoutAfter,
    capturedAt: dependencies.now(),
  };
  const evidence = SentryIssueRepairEvidenceSchema.parse({
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  });
  const handle = await context.writeResource(
    "repair-evidence",
    `sentry-issue-repair-evidence-${evidence.repairIdentityFingerprint}`,
    evidence,
  );
  context.logger.info("Stored exact Sentry issue and advisory Seer evidence", {
    issueId: evidence.issueId,
    shortId: evidence.shortId,
  });
  return { dataHandles: [handle] };
}
