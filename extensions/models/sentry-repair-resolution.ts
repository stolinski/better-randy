import { z } from "npm:zod@4.4.3";

import { resolveSentryCliExecutable } from "./sentry-cli-executable.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import { SentryIssueRepairEvidenceSchema } from "./sentry-issue-repair-evidence.ts";
import { SentryRepairBacklinkReceiptSchema } from "./sentry-repair-backlink.ts";
import {
  SentryRepairIntentEnvelopeSchema,
  SentryRepairIntentSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const IssueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const TaskIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

const SentryRepairDeliveryStateSchema = z.strictObject({
  workItem: TaskIdSchema,
  stageId: z.literal("done"),
  cycles: z.record(z.string(), z.number().int().positive()),
  dispatches: z.record(z.string(), z.unknown()).optional(),
  enteredAt: z.string().datetime(),
  status: z.literal("terminal"),
  definitionVersion: z.number().int().positive(),
  startedAt: z.string().datetime(),
});

// Resolution consumes only the stable passing-route authority fields. The
// Factory already validates the complete route when recording it, so keeping
// volatile policy and fanout fields out of this read projection prevents a
// transitive route-schema upgrade from stranding a terminal repair.
const SentryRepairPassingDeliveryRouteProjectionSchema = z.object({
  schemaVersion: z.number().int().positive(),
  disposition: z.enum([
    "automatic-rework",
    "evidence-unavailable",
    "await-human-aesthetic",
    "reconcile",
  ]),
  workItem: TaskIdSchema,
  integratedRevision: GitRevisionSchema,
  workflowRunId: z.string().min(1),
  requiredHumanReviewKinds: z.array(z.string()).max(20),
  objectiveFailureCodes: z.array(z.string()).max(100),
  unavailableEvidenceCodes: z.array(z.string()).max(100),
}).passthrough();

const SentryRepairDeliveryVerificationSchema = z.strictObject({
  name: z.literal("verification"),
  workItem: TaskIdSchema,
  stageId: z.literal("verification"),
  cycle: z.number().int().positive(),
  payload: SentryRepairPassingDeliveryRouteProjectionSchema,
  subjectVersion: z.number().int().positive().optional(),
  recordedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  note: z.string().optional(),
});

const SentryRepairChangeSummarySchema = z.object({
  name: z.literal("change-summary"),
  workItem: TaskIdSchema,
  payload: z.object({
    commit: GitRevisionSchema,
    integrationReceipt: z.object({
      receiptId: FingerprintSchema,
      integratedRevision: GitRevisionSchema,
    }).passthrough(),
  }).passthrough(),
}).passthrough();

// The original event, the integrated commit, and ordinary passing Delivery
// checks are the complete resolution authority. Runtime reproduction and
// no-recurrence observation are deliberately not part of this contract.
export const SentryRepairResolutionArgsSchema = z.strictObject({
  repairIntentName: z.string().min(1).max(220),
  expectedRepairIntentFingerprint: FingerprintSchema,
  backlinkReceiptName: z.string().min(1).max(220),
  expectedBacklinkReceiptFingerprint: FingerprintSchema,
  evidenceName: z.string().min(1).max(220),
  expectedEvidenceFingerprint: FingerprintSchema,
  dexTaskId: TaskIdSchema,
});

export const SentryRepairResolutionAttemptSchema = z.strictObject({
  schemaVersion: z.literal(2),
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  dexTaskId: TaskIdSchema,
  repairIntentFingerprint: FingerprintSchema,
  backlinkReceiptFingerprint: FingerprintSchema,
  evidenceFingerprint: FingerprintSchema,
  eventId: z.string().min(1).max(100),
  integratedRevision: GitRevisionSchema,
  resolvedInRelease: z.string().regex(/^supers@[0-9a-f]{40}$/),
  preparedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryRepairResolutionReceiptSchema = z.strictObject({
  schemaVersion: z.literal(2),
  status: z.literal("resolved"),
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  dexTaskId: TaskIdSchema,
  planningWorkItem: z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/),
  repairIntentFingerprint: FingerprintSchema,
  backlinkReceiptFingerprint: FingerprintSchema,
  evidenceFingerprint: FingerprintSchema,
  eventId: z.string().min(1).max(100),
  resolutionAttemptFingerprint: FingerprintSchema,
  deliveryWorkflowRunId: z.string().min(1),
  integratedRevision: GitRevisionSchema,
  resolvedInRelease: z.string().regex(/^supers@[0-9a-f]{40}$/),
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
    sourceReplayModelId?: string;
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

function omitFingerprint(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "fingerprint"),
  );
}

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
  return schema.parse(JSON.parse(new TextDecoder().decode(content)));
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

async function fingerprintRepairIntent(
  intent: z.infer<typeof SentryRepairIntentSchema>,
): Promise<string> {
  return await createSentrySha256(canonicalSentryJson(omitFingerprint(intent)));
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
  const [
    repairIntent,
    backlinkReceipt,
    evidence,
    deliveryState,
    verification,
    changeSummary,
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
      "@supers/sentry-issue-intake",
      sourceIntakeModelId,
      args.evidenceName,
      SentryIssueRepairEvidenceSchema,
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
      "@swamp/software-factory",
      sourceDeliveryModelId,
      `artifact-${args.dexTaskId}-change-summary`,
      SentryRepairChangeSummarySchema,
      context,
    ),
  ]);

  const intent = repairIntent.intent;
  if (
    repairIntent.fingerprint !== args.expectedRepairIntentFingerprint ||
    repairIntent.fingerprint !== await createSentrySha256(
        canonicalSentryJson(omitFingerprint(repairIntent)),
      ) ||
    intent.fingerprint !== await fingerprintRepairIntent(intent) ||
    backlinkReceipt.fingerprint !== args.expectedBacklinkReceiptFingerprint ||
    backlinkReceipt.fingerprint !== await createSentrySha256(
        canonicalSentryJson(omitFingerprint(backlinkReceipt)),
      ) ||
    evidence.fingerprint !== args.expectedEvidenceFingerprint ||
    evidence.fingerprint !== await createSentrySha256(
        canonicalSentryJson(omitFingerprint(evidence)),
      )
  ) {
    throw new Error("Sentry repair resolution fingerprint mismatch");
  }
  if (
    repairIntent.planningWorkItem !== intent.planningWorkItem ||
    backlinkReceipt.issueId !== intent.issueId ||
    backlinkReceipt.shortId !== intent.shortId ||
    backlinkReceipt.dexTaskId !== args.dexTaskId ||
    backlinkReceipt.repairIntentFingerprint !== intent.fingerprint ||
    evidence.issueId !== intent.issueId ||
    evidence.shortId !== intent.shortId ||
    evidence.repairIntentFingerprint !== repairIntent.fingerprint ||
    deliveryState.workItem !== args.dexTaskId ||
    verification.workItem !== args.dexTaskId ||
    verification.payload.workItem !== args.dexTaskId ||
    changeSummary.workItem !== args.dexTaskId
  ) {
    throw new Error("Sentry resolution records do not identify one repair");
  }

  const route = verification.payload;
  const integratedRevision =
    changeSummary.payload.integrationReceipt.integratedRevision;
  if (
    route.disposition !== "reconcile" ||
    route.requiredHumanReviewKinds.length !== 0 ||
    route.objectiveFailureCodes.length !== 0 ||
    route.unavailableEvidenceCodes.length !== 0 ||
    route.integratedRevision !== integratedRevision ||
    changeSummary.payload.commit !== integratedRevision
  ) {
    throw new Error(
      "Sentry repair does not have ordinary passing Delivery checks",
    );
  }

  const resolvedInRelease = `supers@${integratedRevision}`;
  const receiptName =
    `sentry-repair-resolution-${intent.issueId}-${evidence.repairIdentityFingerprint}`;
  const attemptName = `${receiptName}-attempt`;
  const existingReceipt = await readOptionalResource(
    receiptName,
    SentryRepairResolutionReceiptSchema,
    context,
  );
  if (existingReceipt !== null) {
    if (
      existingReceipt.fingerprint !== await createSentrySha256(
          canonicalSentryJson(omitFingerprint(existingReceipt)),
        ) ||
      existingReceipt.dexTaskId !== args.dexTaskId ||
      existingReceipt.evidenceFingerprint !== evidence.fingerprint ||
      existingReceipt.integratedRevision !== integratedRevision
    ) {
      throw new Error(
        "Existing Sentry resolution receipt conflicts with this repair",
      );
    }
    return { dataHandles: [] };
  }

  let attempt = await readOptionalResource(
    attemptName,
    SentryRepairResolutionAttemptSchema,
    context,
  );
  if (attempt === null) {
    const attemptBase = {
      schemaVersion: 2 as const,
      issueId: intent.issueId,
      shortId: intent.shortId,
      dexTaskId: args.dexTaskId,
      repairIntentFingerprint: intent.fingerprint,
      backlinkReceiptFingerprint: backlinkReceipt.fingerprint,
      evidenceFingerprint: evidence.fingerprint,
      eventId: evidence.eventId,
      integratedRevision,
      resolvedInRelease,
      preparedAt: dependencies.now(),
    };
    attempt = SentryRepairResolutionAttemptSchema.parse({
      ...attemptBase,
      fingerprint: await createSentrySha256(canonicalSentryJson(attemptBase)),
    });
    await context.writeResource("resolution-attempt", attemptName, attempt);
  } else if (
    attempt.fingerprint !== await createSentrySha256(
        canonicalSentryJson(omitFingerprint(attempt)),
      ) ||
    attempt.dexTaskId !== args.dexTaskId ||
    attempt.evidenceFingerprint !== evidence.fingerprint ||
    attempt.integratedRevision !== integratedRevision
  ) {
    throw new Error(
      "Existing Sentry resolution attempt conflicts with this repair",
    );
  }

  const issue = await viewIssue(intent.shortId, context, dependencies);
  if (issue.id !== intent.issueId || issue.shortId !== intent.shortId) {
    throw new Error("Sentry issue identity changed before resolution");
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
    confirmed.id !== intent.issueId ||
    confirmed.shortId !== intent.shortId ||
    confirmed.status !== "resolved"
  ) {
    throw new Error("Sentry did not confirm issue resolution");
  }

  const receiptBase = {
    schemaVersion: 2 as const,
    status: "resolved" as const,
    issueId: intent.issueId,
    shortId: intent.shortId,
    dexTaskId: args.dexTaskId,
    planningWorkItem: intent.planningWorkItem,
    repairIntentFingerprint: intent.fingerprint,
    backlinkReceiptFingerprint: backlinkReceipt.fingerprint,
    evidenceFingerprint: evidence.fingerprint,
    eventId: evidence.eventId,
    resolutionAttemptFingerprint: attempt.fingerprint,
    deliveryWorkflowRunId: route.workflowRunId,
    integratedRevision,
    resolvedInRelease,
    resolvedAt: dependencies.now(),
  };
  const receipt = SentryRepairResolutionReceiptSchema.parse({
    ...receiptBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(receiptBase)),
  });
  await context.writeResource("resolution-receipt", receiptName, receipt);
  context.logger.info(
    "Resolved Sentry issue after the repair passed normal checks",
    {
      issueId: intent.issueId,
      dexTaskId: args.dexTaskId,
      integratedRevision,
    },
  );
  return { dataHandles: [] };
}
