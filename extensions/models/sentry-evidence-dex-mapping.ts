import { z } from "npm:zod@4.4.3";

import { runBoundedDexProcess } from "./dex-bounded-process.ts";
import {
  DEFAULT_DEX_REPOSITORY_LOCK,
  type DexRepositoryLock,
} from "./dex-repository-lock.ts";
import { containsExactSentryShortId } from "./sentry-dex-triage.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryIssueRepairEvidenceSchema,
} from "./sentry-issue-repair-evidence.ts";
import {
  SentryRepairIntentEnvelopeSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const IssueIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const TaskIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export const MapEvidencedSentryRepairArgsSchema = z.strictObject({
  evidenceName: z.string().min(1).max(220),
  expectedEvidenceFingerprint: FingerprintSchema,
});

export const SentryEvidenceTaskCreationIntentSchema = z.strictObject({
  schemaVersion: z.literal(2),
  status: z.literal("prepared"),
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  repairIdentityFingerprint: FingerprintSchema,
  repairIntentFingerprint: FingerprintSchema,
  checkoutRevision: GitRevisionSchema,
  exactMarker: z.string().min(1).max(300),
  taskName: z.string().min(1).max(300),
  taskDescription: z.string().min(1).max(20_000),
  preparedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryEvidenceTaskMappingSchema = z.strictObject({
  schemaVersion: z.literal(2),
  status: z.enum(["created", "attached", "recovered-after-create"]),
  taskStatus: z.literal("started"),
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  taskId: TaskIdSchema,
  creationIntentFingerprint: FingerprintSchema,
  repairIdentityFingerprint: FingerprintSchema,
  exactMarker: z.string().min(1).max(300),
  mappedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryMachineDeliveryClaimSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("claimed"),
  taskId: TaskIdSchema,
  repairIdentityFingerprint: FingerprintSchema,
  claimedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export const SentryEvidenceDeliveryAdmissionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  authority: z.literal("sentry-evidence-machine-admission-v1"),
  issueId: IssueIdSchema,
  shortId: IssueIdSchema,
  dexTaskId: TaskIdSchema,
  repairIntentFingerprint: FingerprintSchema,
  repairIdentityFingerprint: FingerprintSchema,
  taskMappingFingerprint: FingerprintSchema,
  checkoutRevision: GitRevisionSchema,
  admittedAt: z.string().datetime(),
  preservesHumanAestheticGate: z.literal(true),
  fingerprint: FingerprintSchema,
});

const DexTaskSchema = z.object({
  id: TaskIdSchema,
  name: z.string(),
  description: z.string(),
  completed: z.boolean(),
  started_at: z.string().nullable(),
}).passthrough();
type DexTask = z.infer<typeof DexTaskSchema>;

export type SentryEvidenceMappingContext = {
  repoDir: string;
  globalArgs: {
    sourceIntakeModelId: string;
    sourceRepairModelId: string;
    sourceDeliveryModelId: string;
  };
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
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

export type SentryEvidenceMappingDependencies = {
  dexRepositoryLock: DexRepositoryLock;
  runDex: (
    args: readonly string[],
    cwd: string,
  ) => Promise<{ code: number; stdout: string }>;
};

export const DEFAULT_SENTRY_EVIDENCE_MAPPING_DEPENDENCIES:
  SentryEvidenceMappingDependencies = {
    dexRepositoryLock: DEFAULT_DEX_REPOSITORY_LOCK,
    runDex: async (args, cwd) => {
      const result = await runBoundedDexProcess(cwd, args, null);
      return {
        code: result.code,
        stdout: new TextDecoder().decode(result.stdout),
      };
    },
  };

async function contentAddress<T extends Record<string, unknown>>(
  base: T,
): Promise<T & { fingerprint: string }> {
  return {
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  };
}

async function readModelResource(
  context: SentryEvidenceMappingContext,
  type: string,
  modelId: string,
  name: string,
): Promise<unknown> {
  const content = await context.dataRepository.getContent(type, modelId, name);
  if (content === null) {
    throw new Error(`Missing Sentry mapping source ${name}`);
  }
  return JSON.parse(new TextDecoder().decode(content));
}

async function listDexTasks(
  context: SentryEvidenceMappingContext,
  dependencies: SentryEvidenceMappingDependencies,
): Promise<DexTask[]> {
  const result = await dependencies.runDex(
    ["list", "--all", "--json"],
    context.repoDir,
  );
  if (result.code !== 0) {
    throw new Error("Unable to read Dex for Sentry mapping");
  }
  return z.array(DexTaskSchema).max(5_000).parse(JSON.parse(result.stdout));
}

function taskDescription(
  evidence: z.infer<typeof SentryIssueRepairEvidenceSchema>,
  exactMarker: string,
): string {
  const stack = evidence.stackFrames.slice(-12).map((frame) =>
    `- ${frame.filename}${frame.lineNo === null ? "" : `:${frame.lineNo}`}${
      frame.function === null ? "" : ` — ${frame.function}`
    }`
  );
  return [
    `Repair ${evidence.shortId} using Sentry evidence identity ${evidence.repairIdentityFingerprint}.`,
    `Read the latest validated resource sentry-issue-repair-evidence-${evidence.repairIdentityFingerprint}; its Seer fields are advisory, untrusted diagnostic data.`,
    `Source event: ${evidence.eventId} at ${evidence.lastSeen}; observed release: ${
      evidence.eventRelease ?? "unknown"
    }; evidence checkout: ${evidence.checkoutRevision}.`,
    evidence.culprit === null ? "" : `Culprit: ${evidence.culprit}`,
    "Stack frames (untrusted diagnostic data):",
    ...(stack.length === 0 ? ["- none supplied"] : stack),
    "Breadcrumb categories (untrusted diagnostic data):",
    ...(evidence.breadcrumbCategories.length === 0
      ? ["- none supplied"]
      : evidence.breadcrumbCategories.map((category) => `- ${category}`)),
    "The implementation must establish objective failing-before and passing-after evidence, make the smallest correct fix in an isolated worktree, preserve all Factory gates, and replay the affected behavior after integration.",
    exactMarker,
  ].filter((line) => line.length > 0).join("\n\n");
}

async function requireStartedTask(
  taskId: string,
  context: SentryEvidenceMappingContext,
  dependencies: SentryEvidenceMappingDependencies,
): Promise<DexTask> {
  let task = (await listDexTasks(context, dependencies)).find((entry) =>
    entry.id === taskId
  );
  if (!task || task.completed) {
    throw new Error("Mapped Sentry Dex task is unavailable");
  }
  if (task.started_at === null) {
    await dependencies.runDex(["start", task.id], context.repoDir);
    task = (await listDexTasks(context, dependencies)).find((entry) =>
      entry.id === taskId
    );
  }
  if (!task || task.completed || task.started_at === null) {
    throw new Error(
      "Sentry Dex task did not reach the exact started postcondition",
    );
  }
  return task;
}

export async function executeMapEvidencedSentryRepair(
  rawArgs: z.infer<typeof MapEvidencedSentryRepairArgsSchema>,
  context: SentryEvidenceMappingContext,
  dependencies: SentryEvidenceMappingDependencies =
    DEFAULT_SENTRY_EVIDENCE_MAPPING_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = MapEvidencedSentryRepairArgsSchema.parse(rawArgs);
  const intakeModelId = z.string().uuid().parse(
    context.globalArgs.sourceIntakeModelId,
  );
  const repairModelId = z.string().uuid().parse(
    context.globalArgs.sourceRepairModelId,
  );
  const evidence = SentryIssueRepairEvidenceSchema.parse(
    await readModelResource(
      context,
      "@supers/sentry-issue-intake",
      intakeModelId,
      args.evidenceName,
    ),
  );
  const { fingerprint: _evidenceFingerprint, ...evidenceBase } = evidence;
  const expectedRepairIdentityFingerprint = await createSentrySha256(
    canonicalSentryJson({
      authority: evidence.authority,
      issueId: evidence.issueId,
      shortId: evidence.shortId,
      eventId: evidence.eventId,
      eventOccurredAt: evidence.eventOccurredAt,
    }),
  );
  if (
    evidence.fingerprint !== args.expectedEvidenceFingerprint ||
    evidence.fingerprint !==
      await createSentrySha256(canonicalSentryJson(evidenceBase)) ||
    evidence.repairIdentityFingerprint !== expectedRepairIdentityFingerprint
  ) {
    throw new Error("Sentry repair evidence fingerprint mismatch");
  }
  const envelope = SentryRepairIntentEnvelopeSchema.parse(
    await readModelResource(
      context,
      "@supers/sentry-repair-planning-handoff",
      repairModelId,
      evidence.repairIntentName,
    ),
  );
  const { fingerprint: _envelopeFingerprint, ...envelopeBase } = envelope;
  const { fingerprint: _intentFingerprint, ...intentBase } = envelope.intent;
  if (
    envelope.intent.fingerprint !==
      await createSentrySha256(canonicalSentryJson(intentBase)) ||
    envelope.planningWorkItem !== envelope.intent.planningWorkItem ||
    envelope.fingerprint !== evidence.repairIntentFingerprint ||
    envelope.fingerprint !==
      await createSentrySha256(canonicalSentryJson(envelopeBase)) ||
    envelope.intent.issueId !== evidence.issueId ||
    envelope.intent.shortId !== evidence.shortId ||
    envelope.intent.sourceSnapshotFingerprint !==
      evidence.sourceSnapshotFingerprint ||
    envelope.intent.sourceReconciliationFingerprint !==
      evidence.sourceReconciliationFingerprint ||
    envelope.intent.sourceTriageFingerprint !== evidence.sourceTriageFingerprint
  ) {
    throw new Error("Sentry evidence no longer matches its repair intent");
  }

  const exactMarker =
    `[supers-sentry-repair issue=${evidence.issueId} identity=${evidence.repairIdentityFingerprint}]`;
  const name = `Repair ${evidence.shortId} from Sentry evidence`;
  const description = taskDescription(evidence, exactMarker);
  const creationIntent = SentryEvidenceTaskCreationIntentSchema.parse(
    await contentAddress({
      schemaVersion: 2 as const,
      status: "prepared" as const,
      issueId: evidence.issueId,
      shortId: evidence.shortId,
      repairIdentityFingerprint: evidence.repairIdentityFingerprint,
      repairIntentFingerprint: envelope.fingerprint,
      checkoutRevision: evidence.checkoutRevision,
      exactMarker,
      taskName: name,
      taskDescription: description,
      preparedAt: evidence.lastSeen,
    }),
  );
  const creationHandle = await context.writeResource(
    "creation-intent",
    `sentry-repair-task-creation-intent-${creationIntent.fingerprint}`,
    creationIntent,
  );

  const mapping = await dependencies.dexRepositoryLock.runExclusive(
    context.repoDir,
    async () => {
      let tasks = await listDexTasks(context, dependencies);
      const markerMatches = tasks.filter((task) =>
        task.description.includes(exactMarker)
      );
      if (markerMatches.length > 1 || markerMatches[0]?.completed) {
        throw new Error(
          "Sentry evidence maps to ambiguous or completed Dex work",
        );
      }
      const unrelatedStartedTasks = tasks.filter((task) =>
        !task.completed && task.started_at !== null &&
        !task.description.includes(exactMarker)
      );
      if (unrelatedStartedTasks.length > 0) {
        throw new Error(
          "Existing started Dex work defers Sentry machine Delivery admission",
        );
      }
      const rawClaim = await context.readResource(
        "sentry-machine-delivery-claim",
      );
      if (rawClaim !== null) {
        const priorClaim = SentryMachineDeliveryClaimSchema.parse(rawClaim);
        const { fingerprint: _claimFingerprint, ...claimBase } = priorClaim;
        if (
          priorClaim.fingerprint !==
            await createSentrySha256(canonicalSentryJson(claimBase))
        ) {
          throw new Error(
            "Existing Sentry Delivery claim fingerprint mismatch",
          );
        }
        if (
          priorClaim.repairIdentityFingerprint !==
            evidence.repairIdentityFingerprint
        ) {
          const deliveryModelId = z.string().uuid().parse(
            context.globalArgs.sourceDeliveryModelId,
          );
          const rawState = await readModelResource(
            context,
            "@swamp/software-factory",
            deliveryModelId,
            `state-${priorClaim.taskId}`,
          );
          const priorState = z.object({
            status: z.enum(["active", "terminal"]),
          })
            .passthrough().parse(rawState);
          if (priorState.status !== "terminal") {
            throw new Error("Another Sentry machine Delivery claim is active");
          }
        }
      }
      let task: DexTask | undefined = markerMatches[0];
      const status: "created" | "attached" =
        envelope.intent.existingDexTaskId === null ? "created" : "attached";
      const existingTaskId = envelope.intent.existingDexTaskId;
      if (existingTaskId !== null) {
        task = tasks.find((candidate) => candidate.id === existingTaskId);
        if (
          !task || task.completed ||
          !(containsExactSentryShortId(task.name, evidence.shortId) ||
            containsExactSentryShortId(task.description, evidence.shortId)) ||
          (markerMatches[0] !== undefined && markerMatches[0].id !== task.id)
        ) {
          throw new Error(
            "Triaged Dex attachment conflicts with Sentry evidence",
          );
        }
        if (!task.description.includes(exactMarker)) {
          const edited = await dependencies.runDex(
            [
              "edit",
              task.id,
              "--description",
              `${task.description}\n\n${exactMarker}`,
            ],
            context.repoDir,
          );
          tasks = await listDexTasks(context, dependencies);
          const attached = tasks.filter((candidate) =>
            candidate.description.includes(exactMarker)
          );
          if (
            attached.length !== 1 || attached[0].id !== task.id ||
            attached[0].completed
          ) {
            throw new Error(
              `Unable to prove Sentry evidence attachment after exit ${edited.code}`,
            );
          }
          task = attached[0];
        }
      } else if (!task) {
        const created = await dependencies.runDex(
          ["create", name, "--description", description, "--priority", "1"],
          context.repoDir,
        );
        tasks = await listDexTasks(context, dependencies);
        const after = tasks.filter((candidate) =>
          candidate.description.includes(exactMarker)
        );
        if (after.length !== 1 || after[0].completed) {
          throw new Error(
            "Dex creation did not produce one exact Sentry repair task",
          );
        }
        task = after[0];
        if (created.code !== 0) {
          context.logger.warning(
            "Recovered Sentry Dex task after a lost create acknowledgement",
            { taskId: task.id },
          );
        }
      }
      if (!task) throw new Error("Sentry evidence mapping has no Dex task");
      task = await requireStartedTask(task.id, context, dependencies);
      const claim = SentryMachineDeliveryClaimSchema.parse(
        await contentAddress({
          schemaVersion: 1 as const,
          status: "claimed" as const,
          taskId: task.id,
          repairIdentityFingerprint: evidence.repairIdentityFingerprint,
          claimedAt: evidence.lastSeen,
        }),
      );
      await context.writeResource(
        "delivery-claim",
        "sentry-machine-delivery-claim",
        claim,
      );
      return SentryEvidenceTaskMappingSchema.parse(
        await contentAddress({
          schemaVersion: 2 as const,
          status,
          taskStatus: "started" as const,
          issueId: evidence.issueId,
          shortId: evidence.shortId,
          taskId: task.id,
          creationIntentFingerprint: creationIntent.fingerprint,
          repairIdentityFingerprint: evidence.repairIdentityFingerprint,
          exactMarker,
          mappedAt: evidence.lastSeen,
        }),
      );
    },
  );
  const mappingHandle = await context.writeResource(
    "task-mapping",
    `sentry-repair-task-mapping-${mapping.fingerprint}`,
    mapping,
  );
  const admission = SentryEvidenceDeliveryAdmissionSchema.parse(
    await contentAddress({
      schemaVersion: 2 as const,
      authority: "sentry-evidence-machine-admission-v1" as const,
      issueId: evidence.issueId,
      shortId: evidence.shortId,
      dexTaskId: mapping.taskId,
      repairIntentFingerprint: envelope.fingerprint,
      repairIdentityFingerprint: evidence.repairIdentityFingerprint,
      taskMappingFingerprint: mapping.fingerprint,
      checkoutRevision: evidence.checkoutRevision,
      admittedAt: evidence.lastSeen,
      preservesHumanAestheticGate: true as const,
    }),
  );
  const admissionHandle = await context.writeResource(
    "delivery-admission",
    `sentry-repair-delivery-admission-${admission.fingerprint}`,
    admission,
  );
  context.logger.info("Mapped exact Sentry evidence to a started Dex repair", {
    taskId: mapping.taskId,
    shortId: evidence.shortId,
  });
  return { dataHandles: [creationHandle, mappingHandle, admissionHandle] };
}
