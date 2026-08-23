/**
 * Read-only Sentry issue intake and reconciliation for the Supers repair Factory.
 *
 * This model snapshots bounded issue metadata. It cannot mutate Sentry, Dex, or
 * the repository and deliberately exposes no repair or resolve method.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  DEFAULT_SENTRY_DEX_TRIAGE_DEPENDENCIES,
  executeSentryDexTriage,
  SentryDexTriageArgsSchema,
  type SentryDexTriageContext,
  SentryDexTriageSchema,
} from "./sentry-dex-triage.ts";

import {
  DEFAULT_SENTRY_ISSUE_INTAKE_DEPENDENCIES,
  DenoSentryCommandRunner,
  executeSentryIssueIntake,
  SentryIssueIntakeArgsSchema,
  type SentryIssueIntakeContext,
  SentryIssueReconciliationSchema,
  SentryIssueSnapshotSchema,
} from "./sentry-issue-intake-adapter.ts";
import {
  executeCollectSentryIssueRepairEvidence,
  SentryIssueRepairEvidenceArgsSchema,
  type SentryIssueRepairEvidenceContext,
  SentryIssueRepairEvidenceSchema,
} from "./sentry-issue-repair-evidence.ts";
import {
  createDefaultSentryDefectReproductionDependencies,
  executeReproduceSentryDefect,
  executeVerifySentryNoRecurrence,
  ReproduceSentryDefectArgsSchema,
  SentryDefectReproductionAttemptSchema,
  type SentryDefectReproductionContext,
  SentryDefectReproductionRejectionSchema,
  SentryDefectReproductionReceiptSchema,
  SentryNoRecurrenceReceiptSchema,
  VerifySentryNoRecurrenceArgsSchema,
} from "./sentry-defect-reproduction.ts";

const GlobalArgsSchema = z.object({
  target: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/).default(
    "scott-tolinski-projects/supers",
  ),
  sourceRepairModelId: z.string().uuid(),
});

const CollectRepairEvidenceMethodArgsSchema = SentryIssueRepairEvidenceArgsSchema.extend(
  GlobalArgsSchema.shape,
);
const ReproduceDefectMethodArgsSchema = ReproduceSentryDefectArgsSchema.extend(
  GlobalArgsSchema.shape,
);
const VerifyNoRecurrenceMethodArgsSchema = VerifySentryNoRecurrenceArgsSchema.extend(
  GlobalArgsSchema.shape,
);

async function resolveEvidenceCheckoutRevision(
  repoDir: string,
): Promise<string> {
  const result = await new Deno.Command("git", {
    args: ["rev-parse", "HEAD"],
    cwd: repoDir,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  const revision = new TextDecoder().decode(result.stdout).trim();
  if (!result.success || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("Unable to resolve Sentry evidence checkout revision");
  }
  return revision;
}

export const model = {
  type: "@supers/sentry-issue-intake",
  version: "2026.08.21.3",
  globalArguments: GlobalArgsSchema,
  resources: {
    snapshot: {
      description:
        "Immutable bounded unresolved Supers issue snapshot from the Sentry CLI",
      schema: SentryIssueSnapshotSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    reconciliation: {
      description:
        "Read-only current, recent, historical, or ambiguous classification with typed queue intent",
      schema: SentryIssueReconciliationSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    triage: {
      description:
        "Read-only create, attach, reproduce, review, or ignore queue recommendation with separate execution capacity",
      schema: SentryDexTriageSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "repair-evidence": {
      description:
        "Immutable issue event, stack, breadcrumb, and advisory Seer evidence for one selected repair",
      schema: SentryIssueRepairEvidenceSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "defect-reproduction-attempt": {
      description: "Durable pre-drive identity for one code-owned deterministic reproduction",
      schema: SentryDefectReproductionAttemptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "defect-reproduction-rejection": {
      description: "Durable exclusion for an issue that has no supported or reproducible code-owned route",
      schema: SentryDefectReproductionRejectionSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "defect-reproduction": {
      description: "Positive fresh-event proof from a code-owned local route before Dex or coding",
      schema: SentryDefectReproductionReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    "no-recurrence": {
      description: "Fresh replay proof that the same code-owned route produced no post-fix event",
      schema: SentryNoRecurrenceReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
  },
  methods: {
    "reproduce-defect": {
      description: "Drive a code-owned local route and require a new exact-HEAD Sentry event before coding",
      arguments: ReproduceDefectMethodArgsSchema,
      execute: (
        args: z.infer<typeof ReproduceDefectMethodArgsSchema>,
        context: SentryDefectReproductionContext,
      ) => executeReproduceSentryDefect(
        {
          evidenceName: args.evidenceName,
          expectedEvidenceFingerprint: args.expectedEvidenceFingerprint,
        },
        context,
        createDefaultSentryDefectReproductionDependencies(new DenoSentryCommandRunner()),
      ),
    },
    "verify-no-recurrence": {
      description: "Replay the exact pre-coding route and reject any event at or after verified integration",
      arguments: VerifyNoRecurrenceMethodArgsSchema,
      execute: (
        args: z.infer<typeof VerifyNoRecurrenceMethodArgsSchema>,
        context: SentryDefectReproductionContext,
      ) => executeVerifySentryNoRecurrence(
        {
          reproductionName: args.reproductionName,
          expectedReproductionFingerprint: args.expectedReproductionFingerprint,
          integratedRevision: args.integratedRevision,
          verificationRecordedAt: args.verificationRecordedAt,
        },
        context,
        createDefaultSentryDefectReproductionDependencies(new DenoSentryCommandRunner()),
      ),
    },
    "collect-repair-evidence": {
      description:
        "Collect fresh issue/event evidence and advisory Seer analysis for one exact selected repair intent",
      arguments: CollectRepairEvidenceMethodArgsSchema,
      execute: (
        args: z.infer<typeof CollectRepairEvidenceMethodArgsSchema>,
        context: SentryIssueRepairEvidenceContext,
      ) =>
        executeCollectSentryIssueRepairEvidence({
          repairIntentName: args.repairIntentName,
          expectedRepairIntentFingerprint: args.expectedRepairIntentFingerprint,
          queueSelectionName: args.queueSelectionName,
          expectedQueueSelectionFingerprint: args.expectedQueueSelectionFingerprint,
        }, context, {
          commandRunner: new DenoSentryCommandRunner(),
          resolveCheckoutRevision: resolveEvidenceCheckoutRevision,
          now: () => new Date().toISOString(),
        }),
    },
    triage: {
      description:
        "Read one named Sentry reconciliation and official Dex once to produce fail-closed deduplication recommendations",
      arguments: SentryDexTriageArgsSchema,
      execute: (
        args: z.infer<typeof SentryDexTriageArgsSchema>,
        context: SentryDexTriageContext,
      ) =>
        executeSentryDexTriage(
          args,
          context,
          DEFAULT_SENTRY_DEX_TRIAGE_DEPENDENCIES,
        ),
    },
    collect: {
      description:
        "Collect and reconcile unresolved Supers issues without mutating Sentry, Dex, or source code",
      arguments: SentryIssueIntakeArgsSchema,
      execute: (
        args: z.infer<typeof SentryIssueIntakeArgsSchema>,
        context: SentryIssueIntakeContext,
      ) =>
        executeSentryIssueIntake(
          args,
          context,
          DEFAULT_SENTRY_ISSUE_INTAKE_DEPENDENCIES,
        ),
    },
  },
};
