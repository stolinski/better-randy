import { z } from "npm:zod@4.4.3";

import { resolveSentryCliExecutable } from "./sentry-cli-executable.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
  SentryIssueSnapshotSchema,
} from "./sentry-issue-intake-adapter.ts";
import { SentryRepairBacklinkReceiptSchema } from "./sentry-repair-backlink.ts";
import {
  SentryRepairIntentEnvelopeSchema,
  SentryRepairIntentSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  SupersDeliveryVerificationRouteSchema,
} from "./supers-deterministic-factory-contract.ts";
import { SentryIntegratedReplayReceiptSchema } from "./sentry-integrated-repair-replay.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);

const SentryRepairDeliveryStateSchema = z.strictObject({
  workItem: z.string().min(1),
  stageId: z.literal("done"),
  cycles: z.record(z.string(), z.number().int().positive()),
  dispatches: z.record(
    z.string(),
    z.strictObject({
      cycle: z.number().int().positive(),
      count: z.number().int().positive(),
    }),
  ).optional(),
  enteredAt: z.string().datetime(),
  status: z.literal("terminal"),
  definitionVersion: z.number().int().positive(),
  startedAt: z.string().datetime(),
});

const SentryRepairDeliveryVerificationSchema = z.strictObject({
  name: z.literal("verification"),
  workItem: z.string().min(1),
  stageId: z.literal("verification"),
  cycle: z.number().int().positive(),
  payload: SupersDeliveryVerificationRouteSchema,
  subjectVersion: z.number().int().positive().optional(),
  recordedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  note: z.string().optional(),
});

// Callers supply immutable resource identities, never mutation-authorizing data.
// The method reads and revalidates every named record from Swamp storage.
export const SentryRepairResolutionArgsSchema = z.object({
  repairIntentName: z.string().min(1).max(220),
  expectedRepairIntentFingerprint: FingerprintSchema,
  backlinkReceiptName: z.string().min(1).max(220),
  expectedBacklinkReceiptFingerprint: FingerprintSchema,
  dexTaskId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  currentSnapshotName: z.string().min(1).max(220),
  expectedSnapshotFingerprint: FingerprintSchema,
  integratedReplayName: z.string().min(1).max(220),
  expectedIntegratedReplayFingerprint: FingerprintSchema,
});

export const SentryRepairResolutionAttemptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  issueId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  shortId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  dexTaskId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  repairIntentFingerprint: FingerprintSchema,
  backlinkReceiptFingerprint: FingerprintSchema,
  integratedReplayFingerprint: FingerprintSchema,
  integratedRevision: GitRevisionSchema,
  resolvedInRelease: z.string().regex(/^supers@[0-9a-f]{40}$/),
  verificationRecordedAt: z.string().datetime(),
  snapshotCapturedAt: z.string().datetime(),
  issueLastSeen: z.string().datetime(),
  preparedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryRepairResolutionReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("resolved"),
  issueId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  shortId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  dexTaskId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  planningWorkItem: z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/),
  repairIntentFingerprint: FingerprintSchema,
  backlinkReceiptFingerprint: FingerprintSchema,
  integratedReplayFingerprint: FingerprintSchema,
  resolutionAttemptFingerprint: FingerprintSchema,
  deliveryWorkflowRunId: z.string().min(1),
  integratedRevision: GitRevisionSchema,
  resolvedInRelease: z.string().regex(/^supers@[0-9a-f]{40}$/),
  verificationRecordedAt: z.string().datetime(),
  snapshotCapturedAt: z.string().datetime(),
  issueLastSeen: z.string().datetime(),
  resolvedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export type SentryRepairResolutionCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export interface SentryRepairResolutionCommandRunner {
  run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryRepairResolutionCommandResult>;
}

export class DenoSentryRepairResolutionCommandRunner
  implements SentryRepairResolutionCommandRunner {
  async run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryRepairResolutionCommandResult> {
    const child = new Deno.Command(resolveSentryCliExecutable(), {
      args: [...args],
      cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      env: { CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    }).spawn();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // The process may finish between the timeout and signal.
      }
    }, timeoutMs);
    try {
      const result = await child.output();
      if (timedOut) {
        throw new Error(`sentry command timed out after ${timeoutMs}ms`);
      }
      return {
        code: result.code,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export type SentryRepairResolutionContext = {
  modelId: string;
  repoDir: string;
  globalArgs: {
    sourceIntakeModelId: string;
    sourceDeliveryModelId: string;
    sourceReplayModelId: string;
  };
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
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

export type SentryRepairResolutionDependencies = {
  commandRunner: SentryRepairResolutionCommandRunner;
  now: () => string;
};

const SentryResolutionIssueSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  shortId: z.string(),
  status: z.string(),
  lastSeen: z.string().datetime(),
});

type SentryResolutionArgs = z.infer<typeof SentryRepairResolutionArgsSchema>;
type SentryResolutionIssue = z.infer<typeof SentryResolutionIssueSchema>;

async function readRequiredResource<T>(
  type: string,
  modelId: string,
  name: string,
  schema: z.ZodType<T>,
  context: SentryRepairResolutionContext,
): Promise<T> {
  const content = await context.dataRepository.getContent(type, modelId, name);
  if (content === null) {
    throw new Error(`Missing named Sentry resolution resource ${name}`);
  }
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(content)));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Malformed named Sentry resolution resource ${name}`, {
        cause: error,
      });
    }
    throw error;
  }
}

function omitFingerprint(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "fingerprint"),
  );
}

async function fingerprintRepairIntent(
  intent: z.infer<typeof SentryRepairIntentSchema>,
): Promise<string> {
  return await createSentrySha256(canonicalSentryJson(omitFingerprint(intent)));
}

async function fingerprintRepairIntentEnvelope(
  envelope: z.infer<typeof SentryRepairIntentEnvelopeSchema>,
): Promise<string> {
  return await createSentrySha256(
    canonicalSentryJson(omitFingerprint(envelope)),
  );
}

async function fingerprintBacklinkReceipt(
  receipt: z.infer<typeof SentryRepairBacklinkReceiptSchema>,
): Promise<string> {
  return await createSentrySha256(
    canonicalSentryJson(omitFingerprint(receipt)),
  );
}

async function fingerprintSnapshot(
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
  return await createSentrySha256(JSON.stringify({
    target: snapshot.target,
    args,
    capturedAt: snapshot.capturedAt,
    issues: snapshot.issues,
    recentIds: snapshot.recentIssueIds,
    releaseIds: snapshot.currentReleaseIssueIds,
    complete: snapshot.complete,
  }));
}

async function viewIssue(
  shortId: string,
  context: SentryRepairResolutionContext,
  dependencies: SentryRepairResolutionDependencies,
): Promise<SentryResolutionIssue> {
  const result = await dependencies.commandRunner.run(
    [
      "issue",
      "view",
      shortId,
      "--fresh",
      "--json",
      "--fields",
      "id,shortId,status,lastSeen",
    ],
    context.repoDir,
    20_000,
  );
  if (result.code !== 0) {
    throw new Error(`sentry issue view failed with exit ${result.code}`);
  }
  try {
    return SentryResolutionIssueSchema.parse(JSON.parse(result.stdout));
  } catch (error) {
    throw new Error("sentry issue view returned malformed closure JSON", {
      cause: error,
    });
  }
}

async function readOptionalResource<T>(
  name: string,
  schema: z.ZodType<T>,
  context: SentryRepairResolutionContext,
): Promise<T | null> {
  const content = await context.dataRepository.getContent(
    "@supers/sentry-repair-planning-handoff",
    context.modelId,
    name,
  );
  if (content === null) return null;
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(content)));
  } catch (error) {
    throw new Error(`Malformed existing Sentry resolution resource ${name}`, {
      cause: error,
    });
  }
}

async function reopenRacingIssue(
  shortId: string,
  context: SentryRepairResolutionContext,
  dependencies: SentryRepairResolutionDependencies,
): Promise<void> {
  const reopened = await dependencies.commandRunner.run(
    ["issue", "reopen", shortId, "--json"],
    context.repoDir,
    20_000,
  );
  if (reopened.code !== 0) {
    throw new Error(
      "Sentry regression raced resolution and could not be reopened",
    );
  }
  const confirmed = await viewIssue(shortId, context, dependencies);
  if (confirmed.status !== "unresolved") {
    throw new Error(
      "Sentry regression raced resolution and reopen was not confirmed",
    );
  }
}

export async function executeSentryRepairResolution(
  rawArgs: SentryResolutionArgs,
  context: SentryRepairResolutionContext,
  dependencies: SentryRepairResolutionDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryRepairResolutionArgsSchema.parse(rawArgs);
  const sourceIntakeModelId = z.string().uuid().parse(
    context.globalArgs.sourceIntakeModelId,
  );
  const sourceDeliveryModelId = z.string().uuid().parse(
    context.globalArgs.sourceDeliveryModelId,
  );
  const sourceReplayModelId = z.string().uuid().parse(
    context.globalArgs.sourceReplayModelId,
  );
  const [
    repairIntent,
    backlinkReceipt,
    deliveryState,
    deliveryVerification,
    snapshot,
    integratedReplay,
  ] = await Promise.all([
    readRequiredResource(
      "@supers/sentry-repair-planning-handoff",
      context.modelId,
      args.repairIntentName,
      SentryRepairIntentEnvelopeSchema,
      context,
    ),
    readRequiredResource(
      "@supers/sentry-repair-planning-handoff",
      context.modelId,
      args.backlinkReceiptName,
      SentryRepairBacklinkReceiptSchema,
      context,
    ),
    readRequiredResource(
      "@swamp/software-factory",
      sourceDeliveryModelId,
      `state-${args.dexTaskId}`,
      SentryRepairDeliveryStateSchema,
      context,
    ),
    readRequiredResource(
      "@swamp/software-factory",
      sourceDeliveryModelId,
      `artifact-${args.dexTaskId}-verification`,
      SentryRepairDeliveryVerificationSchema,
      context,
    ),
    readRequiredResource(
      "@supers/sentry-issue-intake",
      sourceIntakeModelId,
      args.currentSnapshotName,
      SentryIssueSnapshotSchema,
      context,
    ),
    readRequiredResource(
      "@supers/sentry-integrated-repair-replay",
      sourceReplayModelId,
      args.integratedReplayName,
      SentryIntegratedReplayReceiptSchema,
      context,
    ),
  ]);

  const intent = repairIntent.intent;
  if (
    repairIntent.fingerprint !== args.expectedRepairIntentFingerprint ||
    repairIntent.fingerprint !==
      await fingerprintRepairIntentEnvelope(repairIntent) ||
    intent.fingerprint !== await fingerprintRepairIntent(intent)
  ) {
    throw new Error("Repair intent fingerprint verification failed");
  }
  if (
    backlinkReceipt.fingerprint !== args.expectedBacklinkReceiptFingerprint ||
    backlinkReceipt.fingerprint !==
      await fingerprintBacklinkReceipt(backlinkReceipt)
  ) {
    throw new Error("Backlink receipt fingerprint verification failed");
  }
  if (
    snapshot.fingerprint !== args.expectedSnapshotFingerprint ||
    snapshot.fingerprint !== await fingerprintSnapshot(snapshot)
  ) {
    throw new Error("Closure snapshot fingerprint verification failed");
  }
  if (
    repairIntent.planningWorkItem !== intent.planningWorkItem ||
    backlinkReceipt.issueId !== intent.issueId ||
    backlinkReceipt.shortId !== intent.shortId ||
    backlinkReceipt.dexTaskId !== args.dexTaskId ||
    backlinkReceipt.planningWorkItem !== intent.planningWorkItem ||
    backlinkReceipt.repairIntentFingerprint !== intent.fingerprint
  ) {
    throw new Error(
      "Sentry resolution evidence does not match the repair intent",
    );
  }
  const verification = deliveryVerification.payload;
  if (
    integratedReplay.fingerprint !== args.expectedIntegratedReplayFingerprint ||
    integratedReplay.fingerprint !== await createSentrySha256(
      canonicalSentryJson(omitFingerprint(integratedReplay)),
    ) ||
    integratedReplay.status !== "passed" ||
    integratedReplay.workItem !== args.dexTaskId ||
    integratedReplay.issueId !== intent.issueId ||
    integratedReplay.shortId !== intent.shortId ||
    integratedReplay.integratedRevision !== verification.integratedRevision ||
    integratedReplay.integratedTreeFingerprint !== verification.integratedTreeFingerprint
  ) {
    throw new Error("Integrated Sentry replay does not match terminal Delivery");
  }
  if (
    deliveryState.workItem !== args.dexTaskId ||
    deliveryVerification.workItem !== args.dexTaskId ||
    verification.workItem !== args.dexTaskId ||
    deliveryState.cycles.verification !== deliveryVerification.cycle ||
    (verification.disposition !== "reconcile" &&
      verification.disposition !== "await-human-aesthetic") ||
    verification.objectiveFailureCodes.length !== 0 ||
    verification.unavailableEvidenceCodes.length !== 0
  ) {
    throw new Error(
      "Terminal Delivery evidence does not match the linked Dex task",
    );
  }
  if (
    new Date(snapshot.capturedAt).getTime() <=
      new Date(deliveryState.enteredAt).getTime() ||
    new Date(snapshot.capturedAt).getTime() <=
      new Date(deliveryVerification.recordedAt).getTime() ||
    new Date(snapshot.capturedAt).getTime() <=
      new Date(integratedReplay.recordedAt).getTime()
  ) {
    throw new Error(
      "Sentry closure snapshot must be captured after terminal Delivery",
    );
  }
  const resolvedInRelease = `supers@${verification.integratedRevision}`;
  if (
    snapshot.target !== intent.sentryTarget ||
    !snapshot.complete ||
    snapshot.currentRelease !== resolvedInRelease ||
    snapshot.currentReleaseIssueIds.includes(intent.issueId)
  ) {
    throw new Error(
      "Current verified release still contains the Sentry issue or has incomplete coverage",
    );
  }

  const receiptName =
    `sentry-repair-resolution-${intent.issueId}-${intent.fingerprint}`;
  const attemptName = `${receiptName}-attempt`;
  const existingReceipt = await readOptionalResource(
    receiptName,
    SentryRepairResolutionReceiptSchema,
    context,
  );
  if (existingReceipt !== null) {
    if (
      existingReceipt.issueId !== intent.issueId ||
      existingReceipt.dexTaskId !== args.dexTaskId ||
      existingReceipt.repairIntentFingerprint !== intent.fingerprint ||
      existingReceipt.backlinkReceiptFingerprint !==
        backlinkReceipt.fingerprint ||
      existingReceipt.integratedReplayFingerprint !== integratedReplay.fingerprint ||
      existingReceipt.integratedRevision !== verification.integratedRevision
    ) {
      throw new Error(
        "Existing Sentry resolution receipt conflicts with current evidence",
      );
    }
    return { dataHandles: [{ name: receiptName }] };
  }

  const issue = await viewIssue(intent.shortId, context, dependencies);
  if (issue.id !== intent.issueId || issue.shortId !== intent.shortId) {
    throw new Error("Sentry issue identity changed before resolution");
  }
  const snapshotIssue = snapshot.issues.find((candidate) =>
    candidate.id === intent.issueId && candidate.shortId === intent.shortId
  );
  let attempt = await readOptionalResource(
    attemptName,
    SentryRepairResolutionAttemptSchema,
    context,
  );
  const dataHandles: Array<{ name: string }> = [];
  if (attempt === null) {
    if (!snapshotIssue) {
      throw new Error(
        "Sentry issue is missing from the exact closure snapshot",
      );
    }
    if (issue.status !== "unresolved") {
      throw new Error(
        "Sentry issue is resolved without an exact Swamp resolution attempt",
      );
    }
    if (
      new Date(issue.lastSeen).getTime() >=
        new Date(deliveryVerification.recordedAt).getTime()
    ) {
      throw new Error(
        "Sentry issue has a new event after verified Delivery evidence",
      );
    }
    const attemptBase = {
      schemaVersion: 1 as const,
      issueId: intent.issueId,
      shortId: intent.shortId,
      dexTaskId: args.dexTaskId,
      repairIntentFingerprint: intent.fingerprint,
      backlinkReceiptFingerprint: backlinkReceipt.fingerprint,
      integratedReplayFingerprint: integratedReplay.fingerprint,
      integratedRevision: verification.integratedRevision,
      resolvedInRelease,
      verificationRecordedAt: deliveryVerification.recordedAt,
      snapshotCapturedAt: snapshot.capturedAt,
      issueLastSeen: issue.lastSeen,
      preparedAt: dependencies.now(),
    };
    attempt = SentryRepairResolutionAttemptSchema.parse({
      ...attemptBase,
      fingerprint: await createSentrySha256(canonicalSentryJson(attemptBase)),
    });
    dataHandles.push(
      await context.writeResource(
        "resolution-attempt",
        attemptName,
        attempt,
      ),
    );
  } else {
    if (
      attempt.fingerprint !==
        await createSentrySha256(
          canonicalSentryJson(omitFingerprint(attempt)),
        ) ||
      attempt.issueId !== intent.issueId ||
      attempt.shortId !== intent.shortId ||
      attempt.dexTaskId !== args.dexTaskId ||
      attempt.repairIntentFingerprint !== intent.fingerprint ||
      attempt.backlinkReceiptFingerprint !== backlinkReceipt.fingerprint ||
      attempt.integratedReplayFingerprint !== integratedReplay.fingerprint ||
      attempt.integratedRevision !== verification.integratedRevision ||
      attempt.issueLastSeen !== issue.lastSeen
    ) {
      if (issue.status === "resolved") {
        await reopenRacingIssue(intent.shortId, context, dependencies);
      }
      throw new Error(
        "Existing Sentry resolution attempt conflicts with current evidence",
      );
    }
  }

  if (issue.status === "unresolved") {
    const resolution = await dependencies.commandRunner.run(
      ["issue", "resolve", intent.shortId, "--in", resolvedInRelease, "--json"],
      context.repoDir,
      20_000,
    );
    if (resolution.code !== 0) {
      throw new Error(
        `sentry issue resolve failed with exit ${resolution.code}`,
      );
    }
  } else if (issue.status !== "resolved") {
    throw new Error(
      `Sentry issue has unsupported closure status ${issue.status}`,
    );
  }

  const confirmed = await viewIssue(intent.shortId, context, dependencies);
  if (
    confirmed.id !== intent.issueId || confirmed.shortId !== intent.shortId ||
    confirmed.status !== "resolved" ||
    confirmed.lastSeen !== attempt.issueLastSeen ||
    new Date(confirmed.lastSeen).getTime() >=
      new Date(deliveryVerification.recordedAt).getTime()
  ) {
    if (confirmed.status === "resolved") {
      await reopenRacingIssue(intent.shortId, context, dependencies);
    }
    throw new Error("Sentry did not confirm a race-free issue resolution");
  }

  const receiptBase = {
    schemaVersion: 1 as const,
    status: "resolved" as const,
    issueId: intent.issueId,
    shortId: intent.shortId,
    dexTaskId: args.dexTaskId,
    planningWorkItem: intent.planningWorkItem,
    repairIntentFingerprint: intent.fingerprint,
    backlinkReceiptFingerprint: backlinkReceipt.fingerprint,
    integratedReplayFingerprint: integratedReplay.fingerprint,
    resolutionAttemptFingerprint: attempt.fingerprint,
    deliveryWorkflowRunId: verification.workflowRunId,
    integratedRevision: verification.integratedRevision,
    resolvedInRelease,
    verificationRecordedAt: deliveryVerification.recordedAt,
    snapshotCapturedAt: snapshot.capturedAt,
    issueLastSeen: attempt.issueLastSeen,
    resolvedAt: dependencies.now(),
  };
  const receipt = SentryRepairResolutionReceiptSchema.parse({
    ...receiptBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(receiptBase)),
  });
  dataHandles.push(
    await context.writeResource(
      "resolution-receipt",
      receiptName,
      receipt,
    ),
  );
  context.logger.info("Recorded verified Sentry repair resolution", {
    issueId: intent.issueId,
    dexTaskId: args.dexTaskId,
    resolvedInRelease,
  });
  return { dataHandles };
}
