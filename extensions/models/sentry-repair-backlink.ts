import { z } from "npm:zod@4.4.3";

import { resolveSentryCliExecutable } from "./sentry-cli-executable.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryRepairIntentEnvelopeSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  SentryEvidenceDeliveryAdmissionSchema,
  SentryEvidenceTaskMappingSchema,
} from "./sentry-evidence-dex-mapping.ts";
import {
  SupersPlanApplicationSchema,
  SupersPlanningApplicationAuditSchema,
  SupersPlanningHandoffSchema,
} from "./supers-planning-adapters.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const TaskIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

const SentryRepairHumanApprovalSchema = z.strictObject({
  gateId: z.literal("planning-approval"),
  workItem: z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/),
  decision: z.literal("approved"),
  actor: z.string().min(1),
  note: z.string().max(2_000).optional(),
  stageId: z.literal("plan-review"),
  cycle: z.number().int().min(1),
  decidedAt: z.string().datetime(),
});

// Swamp includes evaluated global arguments during execution; strip them while
// keeping every nested approval and evidence object strict.
export const SentryMachineRepairBacklinkArgsSchema = z.strictObject({
  repairIntent: SentryRepairIntentEnvelopeSchema,
  mapping: SentryEvidenceTaskMappingSchema,
  admission: SentryEvidenceDeliveryAdmissionSchema,
});

export const SentryRepairBacklinkArgsSchema = z.object({
  repairIntent: SentryRepairIntentEnvelopeSchema,
  humanApproval: SentryRepairHumanApprovalSchema,
  application: SupersPlanApplicationSchema,
  planningAudit: SupersPlanningApplicationAuditSchema,
  planningHandoff: SupersPlanningHandoffSchema,
});

export const SentryRepairBacklinkReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.enum(["linked", "already-linked"]),
  issueId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  shortId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  dexTaskId: TaskIdSchema,
  planningWorkItem: z.string().regex(/^sentry-[A-Za-z0-9_-]{1,100}$/),
  repairIntentFingerprint: FingerprintSchema,
  applicationPlanId: z.string().min(1),
  commentMarker: z.string().min(1).max(300),
  linkedAt: z.string().datetime(),
  fingerprint: FingerprintSchema,
});

export type SentryRepairBacklinkCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export interface SentryRepairBacklinkCommandRunner {
  run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryRepairBacklinkCommandResult>;
}

export class DenoSentryRepairBacklinkCommandRunner
  implements SentryRepairBacklinkCommandRunner {
  async run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryRepairBacklinkCommandResult> {
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
      if (timedOut) throw new Error(`sentry command timed out after ${timeoutMs}ms`);
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

export type SentryRepairBacklinkContext = {
  repoDir: string;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

export type SentryRepairBacklinkDependencies = {
  commandRunner: SentryRepairBacklinkCommandRunner;
  now: () => string;
};

const SentryCommentSchema = z.object({ text: z.string() }).passthrough();
const SentryCommentListSchema = z.union([
  z.array(SentryCommentSchema),
  z.object({ data: z.array(SentryCommentSchema) }),
]);

function requireApprovedDexTask(
  args: z.infer<typeof SentryRepairBacklinkArgsSchema>,
): string {
  const { intent } = args.repairIntent;
  if (
    args.repairIntent.planningWorkItem !== intent.planningWorkItem ||
    args.humanApproval.workItem !== intent.planningWorkItem
  ) {
    throw new Error("Repair intent and Planning approval work items do not match");
  }
  if (
    args.application.status !== "succeeded" ||
    args.application.retryDisposition !== "none" ||
    args.application.errorCode !== "" ||
    args.application.mappings.length !== 1
  ) {
    throw new Error("Sentry backlink requires one successful Plan Application mapping");
  }
  if (
    args.planningAudit.status !== "passed" ||
    args.planningAudit.unresolvedIssues.length !== 0 ||
    args.planningAudit.verifiedTaskIds.length !== 1 ||
    args.planningHandoff.status !== "ready" ||
    args.application.planId !== args.planningAudit.planId ||
    args.application.planId !== args.planningHandoff.planId
  ) {
    throw new Error("Sentry backlink requires a clean correlated Planning audit and handoff");
  }
  const mapping = args.application.mappings[0];
  if (
    args.planningAudit.verifiedTaskIds[0] !== mapping.dexTaskId ||
    args.planningHandoff.candidateTaskId !== mapping.dexTaskId
  ) {
    throw new Error("Planning evidence does not identify one audited Dex repair task");
  }
  const expectedDisposition = intent.recommendation === "create-task"
    ? "created"
    : "attachedExisting";
  if (
    mapping.disposition !== expectedDisposition ||
    (intent.existingDexTaskId !== null &&
      intent.existingDexTaskId !== mapping.dexTaskId)
  ) {
    throw new Error("Dex mapping does not match the approved Sentry repair intent");
  }
  return mapping.dexTaskId;
}

function parseComments(stdout: string): Array<z.infer<typeof SentryCommentSchema>> {
  try {
    const parsed = SentryCommentListSchema.parse(JSON.parse(stdout));
    return Array.isArray(parsed) ? parsed : parsed.data;
  } catch {
    throw new Error("Sentry comments returned malformed or out-of-contract JSON");
  }
}

async function recordBacklink(
  intent: z.infer<typeof SentryRepairIntentEnvelopeSchema>["intent"],
  dexTaskId: string,
  applicationPlanId: string,
  context: SentryRepairBacklinkContext,
  dependencies: SentryRepairBacklinkDependencies,
  stableMachineReceipt?: { linkedAt: string; status: "linked" },
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const [organization] = intent.sentryTarget.split("/");
  if (!organization) throw new Error("Sentry target is missing its organization");
  const endpoint = `organizations/${organization}/issues/${intent.issueId}/comments/`;
  const marker = `[supers-repair:${intent.fingerprint}:${dexTaskId}]`;
  const listed = await dependencies.commandRunner.run(
    ["api", endpoint, "--method", "GET", "--json"], context.repoDir, 20_000,
  );
  if (listed.code !== 0) throw new Error(`sentry comment lookup failed with exit ${listed.code}`);
  const alreadyLinked = parseComments(listed.stdout).some((comment) => comment.text.includes(marker));
  if (!alreadyLinked) {
    const text = [`Supers repair is tracked in Dex task \`${dexTaskId}\`.`, `Planning work item: \`${intent.planningWorkItem}\``, marker].join("\n\n");
    const posted = await dependencies.commandRunner.run(
      ["api", endpoint, "--method", "POST", "--data", JSON.stringify({ text }), "--json"],
      context.repoDir,
      20_000,
    );
    if (posted.code !== 0) throw new Error(`sentry comment creation failed with exit ${posted.code}`);
  }
  const receiptBase = {
    schemaVersion: 1 as const,
    status: stableMachineReceipt?.status ?? (alreadyLinked ? "already-linked" as const : "linked" as const),
    issueId: intent.issueId,
    shortId: intent.shortId,
    dexTaskId,
    planningWorkItem: intent.planningWorkItem,
    repairIntentFingerprint: intent.fingerprint,
    applicationPlanId,
    commentMarker: marker,
    linkedAt: stableMachineReceipt?.linkedAt ?? dependencies.now(),
  };
  const receipt = SentryRepairBacklinkReceiptSchema.parse({
    ...receiptBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(receiptBase)),
  });
  const handle = await context.writeResource(
    "backlink-receipt",
    `sentry-repair-backlink-${intent.issueId}-${receipt.fingerprint}`,
    receipt,
  );
  return { dataHandles: [handle] };
}

export async function executeSentryMachineRepairBacklink(
  rawArgs: z.infer<typeof SentryMachineRepairBacklinkArgsSchema>,
  context: SentryRepairBacklinkContext,
  dependencies: SentryRepairBacklinkDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryMachineRepairBacklinkArgsSchema.parse(rawArgs);
  const envelopeBase = Object.fromEntries(Object.entries(args.repairIntent).filter(([key]) => key !== "fingerprint"));
  const mappingBase = Object.fromEntries(Object.entries(args.mapping).filter(([key]) => key !== "fingerprint"));
  const admissionBase = Object.fromEntries(Object.entries(args.admission).filter(([key]) => key !== "fingerprint"));
  if (
    args.repairIntent.fingerprint !== await createSentrySha256(canonicalSentryJson(envelopeBase)) ||
    args.mapping.fingerprint !== await createSentrySha256(canonicalSentryJson(mappingBase)) ||
    args.admission.fingerprint !== await createSentrySha256(canonicalSentryJson(admissionBase)) ||
    args.mapping.taskId !== args.admission.dexTaskId ||
    args.mapping.issueId !== args.repairIntent.intent.issueId ||
    args.admission.issueId !== args.repairIntent.intent.issueId ||
    args.mapping.repairIdentityFingerprint !== args.admission.repairIdentityFingerprint
  ) throw new Error("Machine Sentry backlink evidence does not form one exact repair");
  return await recordBacklink(
    args.repairIntent.intent,
    args.mapping.taskId,
    `machine-evidence:${args.admission.fingerprint}`,
    context,
    dependencies,
    { linkedAt: args.admission.admittedAt, status: "linked" },
  );
}

export async function executeSentryRepairBacklink(
  rawArgs: z.infer<typeof SentryRepairBacklinkArgsSchema>,
  context: SentryRepairBacklinkContext,
  dependencies: SentryRepairBacklinkDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryRepairBacklinkArgsSchema.parse(rawArgs);
  const dexTaskId = requireApprovedDexTask(args);
  const intent = args.repairIntent.intent;
  const [organization] = intent.sentryTarget.split("/");
  if (!organization) throw new Error("Sentry target is missing its organization");
  const endpoint = `organizations/${organization}/issues/${intent.issueId}/comments/`;
  const marker = `[supers-repair:${intent.fingerprint}:${dexTaskId}]`;
  const listed = await dependencies.commandRunner.run(
    ["api", endpoint, "--method", "GET", "--json"],
    context.repoDir,
    20_000,
  );
  if (listed.code !== 0) {
    throw new Error(`sentry comment lookup failed with exit ${listed.code}`);
  }
  const alreadyLinked = parseComments(listed.stdout).some((comment) =>
    comment.text.includes(marker)
  );
  if (!alreadyLinked) {
    const text = [
      `Supers repair is tracked in Dex task \`${dexTaskId}\`.`,
      `Planning work item: \`${intent.planningWorkItem}\``,
      marker,
    ].join("\n\n");
    const posted = await dependencies.commandRunner.run(
      [
        "api",
        endpoint,
        "--method",
        "POST",
        "--data",
        JSON.stringify({ text }),
        "--json",
      ],
      context.repoDir,
      20_000,
    );
    if (posted.code !== 0) {
      throw new Error(`sentry comment creation failed with exit ${posted.code}`);
    }
  }
  const receiptBase = {
    schemaVersion: 1 as const,
    status: alreadyLinked ? "already-linked" as const : "linked" as const,
    issueId: intent.issueId,
    shortId: intent.shortId,
    dexTaskId,
    planningWorkItem: intent.planningWorkItem,
    repairIntentFingerprint: intent.fingerprint,
    applicationPlanId: args.application.planId,
    commentMarker: marker,
    linkedAt: dependencies.now(),
  };
  const receipt = SentryRepairBacklinkReceiptSchema.parse({
    ...receiptBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(receiptBase)),
  });
  const handle = await context.writeResource(
    "backlink-receipt",
    `sentry-repair-backlink-${intent.issueId}-${receipt.fingerprint}`,
    receipt,
  );
  context.logger.info("Recorded Sentry repair Dex backlink", {
    status: receipt.status,
    issueId: intent.issueId,
    dexTaskId,
  });
  return { dataHandles: [handle] };
}
