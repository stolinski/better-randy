/** Durable Supers-owned Pi dispatch outbox and single-writer admission authority. */
import type { Dirent } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { parse as parseYaml } from "jsr:@std/yaml@1.0.10";
import { z } from "npm:zod@4.4.3";

import { FactoryAuthorityReceiptSchema } from "./factory-execution-failure-authority.ts";
import {
  createFactoryFleetWorkerOutputJsonSchema,
  factoryFleetWorkerOutputSchemasSemanticallyEqual,
} from "./factory-fleet-worker-output-contract.ts";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ProfileModelNameSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
const FailureAuthorizerWorkflowSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
const StageSchema = z.enum([
  "preflight",
  "implementation",
  "classify",
  "verification",
  "review",
  "aesthetic-decision-binding",
  "reconciliation",
  "postflight",
  "terminal-cleanup",
  "done-observability",
  "aborted-observability",
  "escalated-observability",
]);
const PiAsyncRequestSchema = z.strictObject({
  agent: z.literal("worker"),
  task: z.string().min(1),
  worktree: z.literal(true),
  context: z.literal("fork"),
  skill: z.array(z.string().min(1)).min(1),
  outputSchema: z.record(z.string(), z.unknown()),
  acceptance: z.literal(false),
  async: z.literal(true),
  artifacts: z.literal(true),
});
const IdentitySchema = z.object({
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  rootEpicId: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  exactFrozenRequestDigest: Sha256Schema,
  piTaskDigest: Sha256Schema,
});

export const ReservePiDispatchArgsSchema = IdentitySchema.extend({
  piRequest: PiAsyncRequestSchema,
  maximumTransportAttempts: z.number().int().min(1).max(10).default(3),
});
export const PiDispatchTokenArgsSchema = z.object({
  dispatchToken: Sha256Schema,
});
export const RecordPiSubmissionAttemptArgsSchema = PiDispatchTokenArgsSchema
  .extend({
    submissionAttemptId: Sha256Schema,
  });
export const BindPiLaunchArgsSchema = PiDispatchTokenArgsSchema.extend({
  piRunId: z.string().regex(/^[A-Za-z0-9-]{8,128}$/),
});
export const ClaimPiExecutionArgsSchema = BindPiLaunchArgsSchema;
export const BindPiHandoffArgsSchema = BindPiLaunchArgsSchema.extend({
  claimNonce: Sha256Schema,
  handoffDigest: Sha256Schema,
  launchContractDigest: Sha256Schema,
});
export const ParkPiSubmissionArgsSchema = PiDispatchTokenArgsSchema.extend({
  reason: z.enum([
    "transport-retries-exhausted",
    "ambiguous-runtime",
    "runtime-unavailable",
  ]),
});
export const AuthorizePiSubmissionRetryArgsSchema = PiDispatchTokenArgsSchema
  .extend({
    resolution: z.literal("human-confirmed-no-live-run"),
  });

const OutboxStateSchema = z.enum([
  "reserved",
  "dispatch-recorded",
  "submit-pending",
  "submitted",
  "execution-claimed",
  "handoff-ready",
  "completed",
  "submission-uncertain",
  "submission-retryable",
  "submission-parked",
  "execution-failed",
]);
const PiDispatchOutboxFields = {
  profileModelName: ProfileModelNameSchema,
  failureAuthorizerWorkflow: FailureAuthorizerWorkflowSchema,
  dispatchToken: Sha256Schema,
  state: OutboxStateSchema,
  canonicalFrozenPiRequest: z.string().min(1),
  transportAttempts: z.number().int().nonnegative(),
  submissionAttemptReceipts: z
    .array(
      z.strictObject({
        ordinal: z.number().int().positive(),
        submissionAttemptId: Sha256Schema,
        receiptDigest: Sha256Schema,
        recordedAt: z.string().datetime(),
      }),
    )
    .default([]),
  maximumTransportAttempts: z.number().int().min(1).max(10),
  reservedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  piRunId: z.string().min(1).optional(),
  piRuntimeReceiptDigest: Sha256Schema.optional(),
  piExecutionFailureReceiptDigest: Sha256Schema.optional(),
  factoryExecutionFailureReceiptName: z
    .string()
    .regex(/^factory-execution-failure-[0-9a-f]{64}$/)
    .optional(),
  launchContractDigest: Sha256Schema.optional(),
  runtimeRequestDigest: Sha256Schema.optional(),
  launchContractVerified: z.boolean().default(false),
  claimNonceDigest: Sha256Schema.optional(),
  handoffDigest: Sha256Schema.optional(),
  parkedReason: z.string().optional(),
  piRequest: PiAsyncRequestSchema,
};
const LegacyPiDispatchOutboxSchema = IdentitySchema.extend({
  schemaVersion: z.literal(1),
  ...PiDispatchOutboxFields,
});
const CurrentPiDispatchOutboxSchema = IdentitySchema.extend({
  schemaVersion: z.literal(2),
  factoryStartedAt: z.string().datetime(),
  ...PiDispatchOutboxFields,
});
export const PiDispatchOutboxSchema = z.union([
  CurrentPiDispatchOutboxSchema,
  LegacyPiDispatchOutboxSchema,
]);
const LaunchResolvedExtensionsSchema = z.strictObject({
  version: z.literal(1),
  source: z.literal("launch-resolved"),
  disableAmbientExtensions: z.boolean(),
  runtime: z.array(z.string()),
  configured: z.array(z.string()),
  effective: z.array(z.string()),
  omitted: z.strictObject({
    runtime: z.number().int().nonnegative(),
    configured: z.number().int().nonnegative(),
    effective: z.number().int().nonnegative(),
  }),
});
export const PiLaunchReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    dispatchToken: Sha256Schema,
    piRunId: z.string().min(1),
    sourceFactoryId: z.string().uuid(),
    workItem: z.string().min(1),
    stage: StageSchema,
    stageCycle: z.number().int().positive(),
    dispatchAttempt: z.number().int().positive(),
    exactFrozenRequestDigest: Sha256Schema,
    submissionAttemptId: Sha256Schema,
    submissionAttemptOrdinal: z.number().int().positive(),
    submissionAttemptReceiptDigest: Sha256Schema,
    contractState: z.enum(["provisional", "verified"]),
    launchContractDigest: Sha256Schema.optional(),
    launchResolvedExtensions: LaunchResolvedExtensionsSchema.optional(),
    runtimeRequestDigest: Sha256Schema.optional(),
    statusDigest: Sha256Schema,
    sessionDigest: Sha256Schema,
    handoffArtifactDigest: Sha256Schema.optional(),
    receiptDigest: Sha256Schema,
    observedAt: z.string().datetime(),
  })
  .superRefine((receipt, context) => {
    if (
      receipt.contractState === "verified" &&
      (!receipt.launchContractDigest ||
        !receipt.launchResolvedExtensions ||
        !receipt.runtimeRequestDigest ||
        !receipt.handoffArtifactDigest)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Verified Pi receipt requires the final child launch contract, resolved extensions, request proof, and handoff artifact.",
      });
    }
  });
export const PiExecutionClaimSchema = z.strictObject({
  schemaVersion: z.literal(1),
  dispatchToken: Sha256Schema,
  piRunId: z.string().min(1),
  claimNonce: Sha256Schema,
  claimNonceDigest: Sha256Schema,
  claimedAt: z.string().datetime(),
});
export const PiExecutionFailureReceiptSchema = IdentitySchema.extend({
  schemaVersion: z.literal(1),
  dispatchToken: Sha256Schema,
  piRunId: z.string().min(1),
  dispatchRunId: Sha256Schema,
  piRuntimeReceiptDigest: Sha256Schema,
  claimNonceDigest: Sha256Schema,
  runtimeState: z.enum(["failed", "stopped", "rejected"]),
  statusDigest: Sha256Schema,
  sessionDigest: Sha256Schema,
  observedAt: z.string().datetime(),
  receiptDigest: Sha256Schema,
});
export const PiHandoffAcceptanceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  accepted: z.literal(true),
  resourceName: z.string().min(1),
  dispatchToken: Sha256Schema,
  piRunId: z.string().min(1),
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  rootEpicId: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  claimNonceDigest: Sha256Schema,
  handoffDigest: Sha256Schema,
  launchContractDigest: Sha256Schema,
  runtimeRequestDigest: Sha256Schema,
  piRuntimeReceiptDigest: Sha256Schema,
  acceptedAt: z.string().datetime(),
  receiptDigest: Sha256Schema,
});

export type PiDispatchOutbox = z.infer<typeof PiDispatchOutboxSchema>;
type CurrentPiDispatchOutbox = z.infer<typeof CurrentPiDispatchOutboxSchema>;
export type PiLaunchReceipt = z.infer<typeof PiLaunchReceiptSchema>;
type Identity = z.infer<typeof IdentitySchema>;

export type PiDispatchOutboxContext = {
  globalArgs: {
    sourceFactoryId: string;
    profileModelName: string;
    adapters: { failureAuthorizer: { workflow: string } };
  };
  modelId?: string;
  repoDir: string;
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
    listVersions?: (
      type: unknown,
      modelId: string,
      dataName: string,
    ) => Promise<number[]>;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  now?: () => Date;
  piAsyncRoots?: readonly string[];
  /** Test-only override; production always uses Pi's fixed durable session root. */
  piSessionRoots?: readonly string[];
  /** Test seam for the fixed production `dex list --all --json` query. */
  queryDexTasks?: () => Promise<unknown>;
  /** Test seam for the fixed production `swamp model get <profileModelName> --json` lookup. */
  lookupCurrentProfileModel?: (profileModelName: string) => Promise<unknown>;
  /** Test seam for resolving linked checkouts to one Git repository identity. */
  resolveGitCommonDirectory?: (repoDir: string) => Promise<string | null>;
  /** Test seam for bounded launch-binding readiness waits. */
  waitForPiRuntimeArtifact?: () => Promise<void>;
  /** Test-only bound; production waits up to ninety seconds for Prompt Audit delivery. */
  piLaunchBindingMaximumInspections?: number;
};

function canonicalize(value: unknown): unknown {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}
async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const input = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));
const currentTime = (context: PiDispatchOutboxContext): string =>
  (context.now?.() ?? new Date()).toISOString();
const outboxName = (token: string): string => `pi-dispatch-outbox-${token}`;
const launchName = (token: string): string => `pi-launch-receipt-${token}`;
const claimName = (token: string): string => `pi-execution-claim-${token}`;
const piExecutionFailureName = (digest: string): string =>
  `pi-execution-failure-${digest}`;
export const piHandoffAcceptanceName = (token: string): string =>
  `pi-handoff-acceptance-${token}`;

function identityOf(value: Identity): Identity {
  return {
    sourceFactoryId: value.sourceFactoryId,
    workItem: value.workItem,
    rootEpicId: value.rootEpicId,
    stage: value.stage,
    stageCycle: value.stageCycle,
    dispatchAttempt: value.dispatchAttempt,
    exactFrozenRequestDigest: value.exactFrozenRequestDigest,
    piTaskDigest: value.piTaskDigest,
  };
}
async function tokenFor(identity: Identity): Promise<string> {
  return await sha256(
    canonicalJson({
      sourceFactoryId: identity.sourceFactoryId,
      workItem: identity.workItem,
      stage: identity.stage,
      stageCycle: identity.stageCycle,
      dispatchAttempt: identity.dispatchAttempt,
      exactFrozenRequestDigest: identity.exactFrozenRequestDigest,
    }),
  );
}

type PiSubmissionAttemptReceipt =
  PiDispatchOutbox["submissionAttemptReceipts"][number];
type PiDispatchOutboxState = z.infer<typeof OutboxStateSchema>;

const PI_DISPATCH_SOURCE_STATES = {
  bindLaunch: ["submit-pending"],
  claimExecution: ["submit-pending", "submitted"],
  bindHandoff: ["execution-claimed"],
  reconcile: [
    "submit-pending",
    "submitted",
    "execution-claimed",
    "handoff-ready",
  ],
  authorizeRetry: ["submission-uncertain", "submission-parked"],
  parkSubmission: ["submit-pending", "submission-uncertain"],
} as const satisfies Record<string, readonly PiDispatchOutboxState[]>;

function requirePiDispatchSourceState(
  outbox: PiDispatchOutbox,
  operation: string,
  allowedStates: readonly PiDispatchOutboxState[],
): void {
  if (!allowedStates.includes(outbox.state)) {
    throw new Error(
      `${operation} is not allowed from Pi dispatch state ${outbox.state}; expected ${
        allowedStates.join(
          " or ",
        )
      }.`,
    );
  }
}

async function requireDurableSubmissionAttempt(
  outbox: PiDispatchOutbox,
): Promise<PiSubmissionAttemptReceipt> {
  if (
    outbox.transportAttempts < 1 ||
    outbox.submissionAttemptReceipts.length !== outbox.transportAttempts
  ) {
    throw new Error(
      "Pi run acceptance requires a durable submission-attempt receipt.",
    );
  }
  const seenIds = new Set<string>();
  for (const [index, receipt] of outbox.submissionAttemptReceipts.entries()) {
    const ordinal = index + 1;
    if (
      receipt.ordinal !== ordinal || seenIds.has(receipt.submissionAttemptId)
    ) {
      throw new Error(
        "Pi submission-attempt receipt history is not ordinal and unique.",
      );
    }
    seenIds.add(receipt.submissionAttemptId);
    const expectedDigest = await sha256(
      canonicalJson({
        dispatchToken: outbox.dispatchToken,
        submissionAttemptId: receipt.submissionAttemptId,
        ordinal,
        exactFrozenRequestDigest: outbox.exactFrozenRequestDigest,
        ...(outbox.schemaVersion === 2
          ? { factoryStartedAt: outbox.factoryStartedAt }
          : {}),
      }),
    );
    if (receipt.receiptDigest !== expectedDigest) {
      throw new Error(
        "Pi submission-attempt receipt does not match this outbox.",
      );
    }
  }
  return outbox.submissionAttemptReceipts.at(-1)!;
}

async function requireReceiptMatchesSubmissionAttempt(
  outbox: PiDispatchOutbox,
  receipt: PiLaunchReceipt,
): Promise<PiSubmissionAttemptReceipt> {
  const attempt = await requireDurableSubmissionAttempt(outbox);
  if (
    receipt.submissionAttemptId !== attempt.submissionAttemptId ||
    receipt.submissionAttemptOrdinal !== attempt.ordinal ||
    receipt.submissionAttemptReceiptDigest !== attempt.receiptDigest
  ) {
    throw new Error(
      "Pi launch receipt does not match the current submission attempt.",
    );
  }
  return attempt;
}
function factoryTypePath(): {
  toDirectoryPath: () => string;
  toString: () => string;
} {
  return {
    toDirectoryPath: () => "@swamp/software-factory",
    toString: () => "@swamp/software-factory",
  };
}
function workItemSlug(workItem: string): string {
  const safe = workItem
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/^[-.]+|[-.]+$/g, "")
    .slice(0, 48);
  if (safe === workItem) return workItem;
  let hash = 0x811c9dc5;
  for (const character of workItem) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${safe || "item"}-${hash.toString(16).padStart(8, "0")}`;
}
async function factoryJson(
  context: PiDispatchOutboxContext,
  name: string,
  version?: number,
): Promise<unknown> {
  const bytes = await context.dataRepository.getContent(
    "@swamp/software-factory",
    context.globalArgs.sourceFactoryId,
    name,
    version,
  );
  if (bytes === null) throw new Error(`Factory ${name} is unavailable.`);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function configuredFailureAuthorizerWorkflow(
  context: PiDispatchOutboxContext,
): string {
  return FailureAuthorizerWorkflowSchema.parse(
    context.globalArgs.adapters.failureAuthorizer.workflow,
  );
}

async function resolveCurrentProfileModelName(
  context: PiDispatchOutboxContext,
): Promise<string> {
  const profileModelName = ProfileModelNameSchema.parse(
    context.globalArgs.profileModelName,
  );
  if (!context.modelId) {
    throw new Error("Trusted current profile model identity is unavailable.");
  }
  let raw: unknown;
  if (context.lookupCurrentProfileModel) {
    raw = await context.lookupCurrentProfileModel(profileModelName);
  } else {
    const definitionPath = join(
      context.repoDir,
      "models",
      "@club_aqua_back_deck",
      "dex-software-factory",
      `${context.modelId}.yaml`,
    );
    try {
      raw = parseYaml(await readFile(definitionPath, "utf8")) as unknown;
    } catch (error) {
      throw new Error(
        `Current profile model definition lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }
  const identity = z
    .object({
      id: z.string().uuid().optional(),
      name: ProfileModelNameSchema,
      type: z.literal("@club_aqua_back_deck/dex-software-factory").optional(),
      globalArguments: z.object({ profileModelName: ProfileModelNameSchema })
        .optional(),
    })
    .parse(raw);
  if (
    (identity.id !== undefined && identity.id !== context.modelId) ||
    identity.name !== profileModelName ||
    (identity.globalArguments?.profileModelName !== undefined &&
      identity.globalArguments.profileModelName !== profileModelName)
  ) {
    throw new Error(
      "Configured profileModelName is not the current profile model instance.",
    );
  }
  return identity.name;
}

function requireConfiguredFactory(
  identity: Identity,
  context: PiDispatchOutboxContext,
): void {
  const configured = z.string().uuid().parse(
    context.globalArgs.sourceFactoryId,
  );
  if (configured !== identity.sourceFactoryId) {
    throw new Error("Pi dispatch targets a different Factory.");
  }
}
type DexDispatchTask = {
  id: string;
  parentId: string | null;
  completed: boolean;
  startedAt: string | null;
  blockedBy: string[];
};

async function queryCurrentDexTasks(
  context: PiDispatchOutboxContext,
): Promise<DexDispatchTask[]> {
  let raw: unknown;
  if (context.queryDexTasks) {
    raw = await context.queryDexTasks();
  } else {
    const output = await new Deno.Command("dex", {
      args: ["list", "--all", "--json"],
      cwd: context.repoDir,
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!output.success) {
      throw new Error(
        `Dex query failed: ${new TextDecoder().decode(output.stderr).trim()}`,
      );
    }
    raw = JSON.parse(new TextDecoder().decode(output.stdout)) as unknown;
  }
  const entries = Array.isArray(raw)
    ? raw
    : z.object({ results: z.array(z.unknown()) }).parse(raw).results;
  return entries.map((entry) => {
    const parsed = z
      .strictObject({
        id: z.string().min(1),
        parent_id: z.string().min(1).nullable(),
        completed: z.boolean(),
        started_at: z.string().min(1).nullable(),
        blockedBy: z.array(z.string().min(1)),
      })
      .passthrough()
      .parse(entry);
    return {
      id: parsed.id,
      parentId: parsed.parent_id,
      completed: parsed.completed,
      startedAt: parsed.started_at,
      blockedBy: parsed.blockedBy,
    };
  });
}

async function requireCurrentDexLane(
  args: z.infer<typeof ReservePiDispatchArgsSchema>,
  context: PiDispatchOutboxContext,
): Promise<void> {
  const tasks = await queryCurrentDexTasks(context);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length) {
    throw new Error("Dex query contains duplicate task identities.");
  }
  const leaf = byId.get(args.workItem);
  if (!leaf || leaf.completed || !leaf.startedAt) {
    throw new Error("Pi work item is not the current open started Dex leaf.");
  }
  if (tasks.some((task) => !task.completed && task.parentId === leaf.id)) {
    throw new Error("Pi work item is not a Dex leaf.");
  }
  let cursor = leaf;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(cursor.id)) {
      throw new Error("Dex ancestry contains a cycle.");
    }
    visited.add(cursor.id);
    for (const blockerId of cursor.blockedBy) {
      const blocker = byId.get(blockerId);
      if (!blocker || !blocker.completed) {
        throw new Error("Pi Dex lane has an unknown or incomplete blocker.");
      }
    }
    if (cursor.parentId === null) break;
    const parent = byId.get(cursor.parentId);
    if (!parent) throw new Error("Dex ancestry contains an unknown parent.");
    if (parent.completed) break;
    cursor = parent;
  }
  if (cursor.id !== args.rootEpicId) {
    throw new Error("Pi execution root does not match current Dex ancestry.");
  }
  const startedInRoot = tasks
    .filter(
      (task) =>
        !task.completed &&
        task.startedAt &&
        task.id !== leaf.id &&
        !tasks.some((candidate) =>
          !candidate.completed && candidate.parentId === task.id
        ),
    )
    .filter((task) => {
      let candidate = task;
      const seen = new Set<string>();
      while (!seen.has(candidate.id)) {
        seen.add(candidate.id);
        if (candidate.id === args.rootEpicId) return true;
        if (candidate.parentId === null) return false;
        const parent = byId.get(candidate.parentId);
        if (!parent || parent.completed) return false;
        candidate = parent;
      }
      throw new Error("Dex ancestry contains a cycle.");
    });
  if (startedInRoot.length > 0) {
    throw new Error(
      "Dex execution root already has another started open task.",
    );
  }
}

async function requireRequestMatchesFactoryWork(
  args: z.infer<typeof ReservePiDispatchArgsSchema>,
  context: PiDispatchOutboxContext,
): Promise<void> {
  const status = z
    .object({
      workItem: z.literal(args.workItem),
      stage: z.object({
        id: z.literal(args.stage),
        cycle: z.literal(args.stageCycle),
      }),
      dispatch: z.object({ attempts: z.literal(args.dispatchAttempt - 1) }),
      work: z
        .strictObject({
          mode: z.literal("dispatch"),
          skills: z.array(z.string().min(1)).min(1),
          systemPrompt: z.string().min(1),
          command: z.string().optional(),
          constraints: z.string().optional(),
        })
        .passthrough(),
    })
    .parse(await factoryJson(context, `status-${args.workItem}`));
  const expectedTask = [
    status.work.systemPrompt,
    ...(status.work.command ? [`Command:\n${status.work.command}`] : []),
    ...(status.work.constraints
      ? [`Constraints:\n${status.work.constraints}`]
      : []),
  ].join("\n\n");
  if (
    args.piRequest.task !== expectedTask ||
    canonicalJson(args.piRequest.skill) !== canonicalJson(status.work.skills)
  ) {
    throw new Error(
      "Pi reservation request does not match authoritative current Factory work.",
    );
  }
  const expectedSchema = createFactoryFleetWorkerOutputJsonSchema({
    rootEpicId: args.rootEpicId,
    activeTaskId: args.workItem,
    workItem: args.workItem,
    piKey: `factory:${args.rootEpicId}:${args.workItem}`,
  });
  if (
    !factoryFleetWorkerOutputSchemasSemanticallyEqual(
      args.piRequest.outputSchema,
      expectedSchema,
    )
  ) {
    throw new Error(
      "Pi output schema is not the exact canonical lane-bound worker contract.",
    );
  }
  await requireCurrentDexLane(args, context);
}

async function currentFactoryStartedAt(
  identity: Identity,
  context: PiDispatchOutboxContext,
): Promise<string> {
  const state = z
    .object({
      workItem: z.literal(identity.workItem),
      stageId: z.literal(identity.stage),
      cycles: z.record(z.string(), z.number().int()),
      startedAt: z.string().datetime(),
    })
    .parse(await factoryJson(context, `state-${identity.workItem}`));
  if (state.cycles[identity.stage] !== identity.stageCycle) {
    throw new Error(
      "Pi dispatch epoch is stale for the current Factory stage.",
    );
  }
  return state.startedAt;
}

async function inspectDispatch(
  identity: Identity,
  context: PiDispatchOutboxContext,
): Promise<"before" | "recorded"> {
  await requireConfiguredFactory(identity, context);
  const state = z
    .object({
      workItem: z.string(),
      stageId: z.string(),
      cycles: z.record(z.string(), z.number().int()),
      dispatches: z.record(
        z.string(),
        z.object({ cycle: z.number().int(), count: z.number().int() }),
      ),
      startedAt: z.string().datetime(),
    })
    .parse(await factoryJson(context, `state-${identity.workItem}`));
  const dispatch = state.dispatches[identity.stage];
  if (
    state.workItem !== identity.workItem ||
    state.stageId !== identity.stage ||
    state.cycles[identity.stage] !== identity.stageCycle ||
    (dispatch !== undefined && dispatch.cycle > identity.stageCycle)
  ) {
    throw new Error(
      "Pi dispatch identity is stale for the current Factory stage.",
    );
  }
  const dispatchCount = dispatch?.cycle === identity.stageCycle
    ? dispatch.count
    : 0;
  if (dispatchCount === identity.dispatchAttempt - 1) return "before";
  if (dispatchCount !== identity.dispatchAttempt) {
    throw new Error("Pi dispatch attempt is not current or next.");
  }
  if (!context.dataRepository.listVersions) {
    throw new Error("Factory journal versions are unavailable.");
  }
  const journalName = `journal-${workItemSlug(identity.workItem)}`;
  const versions = await context.dataRepository.listVersions(
    factoryTypePath(),
    identity.sourceFactoryId,
    journalName,
  );
  const latest = versions.toSorted((a, b) => b - a)[0];
  if (latest === undefined) {
    throw new Error("Factory dispatch journal is unavailable.");
  }
  const event = z
    .object({
      event: z.literal("dispatched"),
      workItem: z.literal(identity.workItem),
      stageId: z.literal(identity.stage),
      payload: z.object({
        stageId: z.literal(identity.stage),
        cycle: z.literal(identity.stageCycle),
        attempt: z.literal(identity.dispatchAttempt),
        runId: z.literal(identity.exactFrozenRequestDigest),
      }),
    })
    .safeParse(await factoryJson(context, journalName, latest));
  if (!event.success) {
    throw new Error(
      "Latest Factory journal event is not the exact Pi dispatch.",
    );
  }
  return "recorded";
}
async function readOutbox(
  token: string,
  context: PiDispatchOutboxContext,
): Promise<CurrentPiDispatchOutbox> {
  const value = await context.readResource(outboxName(token));
  if (value === null) {
    throw new Error("Pi dispatch outbox entry is unavailable.");
  }
  const outbox = PiDispatchOutboxSchema.parse(value);
  if (outbox.dispatchToken !== token) {
    throw new Error("Pi dispatch token/resource mismatch.");
  }
  const factoryStartedAt = await currentFactoryStartedAt(outbox, context);
  if (
    outbox.schemaVersion !== 2 || outbox.factoryStartedAt !== factoryStartedAt
  ) {
    throw new Error("Pi dispatch outbox belongs to a stale Factory epoch.");
  }
  return outbox;
}
async function writeOutbox(
  outbox: PiDispatchOutbox,
  context: PiDispatchOutboxContext,
): Promise<{ name: string }> {
  return await context.writeResource(
    "pi-dispatch-outbox",
    outboxName(outbox.dispatchToken),
    outbox,
  );
}

function allowedAsyncRoots(
  context: PiDispatchOutboxContext,
): readonly string[] {
  if (context.piAsyncRoots) return context.piAsyncRoots;
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return [join(tmpdir(), `pi-subagents-uid-${uid}`, "async-subagent-runs")];
}
function isWithin(path: string, root: string): boolean {
  const relative = resolve(path).slice(resolve(root).length);
  return (
    resolve(path) === resolve(root) ||
    (relative.startsWith(sep) && !relative.includes(`${sep}..${sep}`))
  );
}
export function createFactoryPiTransportTask(
  piTask: string,
  profileModelName: string,
  dispatchToken: string,
  piTaskDigest: string,
  submissionAttempt: Readonly<{
    submissionAttemptId: string;
    ordinal: number;
    receiptDigest: string;
  }>,
): string {
  const currentProfileModelName = ProfileModelNameSchema.parse(
    profileModelName,
  );
  return [
    `SUPERS_FACTORY_DISPATCH_TOKEN=${dispatchToken}`,
    `SUPERS_FACTORY_TASK_DIGEST=${piTaskDigest}`,
    `SUPERS_FACTORY_SUBMISSION_ATTEMPT_ID=${submissionAttempt.submissionAttemptId}`,
    `SUPERS_FACTORY_SUBMISSION_ATTEMPT_ORDINAL=${submissionAttempt.ordinal}`,
    `SUPERS_FACTORY_SUBMISSION_ATTEMPT_RECEIPT=${submissionAttempt.receiptDigest}`,
    "Before reading or editing repository files, claim this execution with:",
    `SWAMP_REPO_DIR="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")" swamp model method run ${currentProfileModelName} claim_pi_execution --input '{"dispatchToken":"${dispatchToken}","piRunId":"'"$PI_SUBAGENT_RUN_ID"'"}' --json`,
    "If the claim is not granted, stop without editing. Preserve the returned claim nonce and use returned ownerPiRunId as piRunId in the structured handoff.",
    piTask,
  ].join("\n\n");
}

const DELEGATED_SUBAGENT_TASK_PREFIX =
  "Task: You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.\n\nTask:\n";
const DELEGATED_SUBAGENT_TASK_PROGRESS_PREFIX =
  "\n\n---\nUpdate progress at: ";

async function sessionContainsExactTask(
  sessionFile: string,
  expectedTransportTask: string,
  sessionRoots: readonly string[],
): Promise<{ digest: string; childRunIds: string[] } | null> {
  const actual = await realpath(sessionFile);
  if (!sessionRoots.some((root) => isWithin(actual, root))) {
    throw new Error("Pi session file is outside the durable session root.");
  }
  const bytes = new Uint8Array(await readFile(actual));
  let matchingMessages = 0;
  const childRunIds = new Set<string>();
  for (const line of new TextDecoder().decode(bytes).split("\n")) {
    try {
      const entry = JSON.parse(line) as {
        type?: unknown;
        name?: unknown;
        message?: { role?: unknown; content?: unknown };
      };
      if (entry.type === "session_info" && typeof entry.name === "string") {
        const match = /^subagent-worker-([A-Za-z0-9-]{8,128})-[1-9]\d*$/.exec(
          entry.name,
        );
        if (match?.[1]) childRunIds.add(match[1]);
      }
      if (
        entry.type !== "message" ||
        entry.message?.role !== "user" ||
        !Array.isArray(entry.message.content)
      ) {
        continue;
      }
      if (
        entry.message.content.some(
          (part) =>
            typeof part === "object" &&
            part !== null &&
            (part as { type?: unknown }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string" &&
            (() => {
              const text = (part as { text: string }).text;
              return (
                text === expectedTransportTask ||
                text === `Task: ${expectedTransportTask}` ||
                text.startsWith(`Task: ${expectedTransportTask}\n\n---\n`) ||
                text.startsWith(
                  `${DELEGATED_SUBAGENT_TASK_PREFIX}${expectedTransportTask}${DELEGATED_SUBAGENT_TASK_PROGRESS_PREFIX}`,
                )
              );
            })(),
        )
      ) {
        matchingMessages += 1;
      }
    } catch {
      // Ignore incomplete or non-JSON lines while the live session is appended.
    }
  }
  return matchingMessages === 1 && childRunIds.size <= 1
    ? { digest: await sha256(bytes), childRunIds: [...childRunIds] }
    : null;
}

async function readContainedJson(
  path: string,
  roots: readonly string[],
): Promise<{ value: unknown; digest: string } | null> {
  let actual: string;
  try {
    actual = await realpath(path);
  } catch {
    return null;
  }
  if (!roots.some((root) => isWithin(actual, root))) {
    throw new Error("Pi child artifact is outside its durable artifact roots.");
  }
  const bytes = new Uint8Array(await readFile(actual));
  try {
    return {
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      digest: await sha256(bytes),
    };
  } catch {
    return null;
  }
}

const PiWorkflowStepSchema = z
  .object({
    agent: z.literal("worker"),
    status: z.string(),
    sessionFile: z.string().optional(),
    runId: z.string().optional(),
  })
  .passthrough();
const PiWorkflowResultSchema = z
  .object({
    agent: z.literal("worker"),
    launchContractDigest: Sha256Schema,
    launchResolvedExtensions: LaunchResolvedExtensionsSchema,
    sessionFile: z.string(),
    structuredOutputSchemaPath: z.string(),
    structuredOutput: z.unknown(),
  })
  .passthrough();
const PiWorkflowStatusSchema = z
  .object({
    runId: z.string(),
    mode: z.literal("workflow"),
    state: z.enum([
      "queued",
      "running",
      "complete",
      "failed",
      "paused",
      "stopped",
      "rejected",
    ]),
    cwd: z.string(),
    steps: z.array(PiWorkflowStepSchema).length(1),
    workflow: z
      .object({
        value: z
          .object({
            ok: z.boolean(),
            agent: z.literal("worker"),
            runId: z.string(),
            structuredOutput: z.unknown(),
            artifactPaths: z.array(z.string()),
            results: z.array(PiWorkflowResultSchema).length(1),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type PiRuntimeLifecycleObservation = {
  piRunId: string;
  state: z.infer<typeof PiWorkflowStatusSchema>["state"];
  statusDigest: string;
  sessionDigest: string;
};

type PiRuntimeInspection = {
  available: boolean;
  receipts: PiLaunchReceipt[];
  requestedMatchKinds: Array<"outer" | "child">;
  lifecycleObservations: PiRuntimeLifecycleObservation[];
  relevantArtifactInvalid: boolean;
  requestedLifecyclePending: boolean;
};

async function readableFileContains(
  path: string,
  marker: string,
  roots: readonly string[],
): Promise<boolean | null> {
  let actual: string;
  try {
    actual = await realpath(path);
  } catch {
    return null;
  }
  if (!roots.some((root) => isWithin(actual, root))) return null;
  try {
    return new TextDecoder().decode(await readFile(actual)).includes(marker);
  } catch {
    return null;
  }
}

async function resolveGitCommonDirectory(
  repoDir: string,
  context: PiDispatchOutboxContext,
): Promise<string | null> {
  if (context.resolveGitCommonDirectory) {
    return context.resolveGitCommonDirectory(repoDir);
  }
  try {
    const output = await new Deno.Command("git", {
      args: [
        "-C",
        repoDir,
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!output.success) return null;
    const path = new TextDecoder().decode(output.stdout).trim();
    return path.length > 0 ? await realpath(path) : null;
  } catch {
    return null;
  }
}

async function repositoryRelation(
  left: string,
  right: string,
  context: PiDispatchOutboxContext,
): Promise<"same" | "different" | "unknown"> {
  if (resolve(left) === resolve(right)) return "same";
  const [leftCommon, rightCommon] = await Promise.all([
    resolveGitCommonDirectory(left, context),
    resolveGitCommonDirectory(right, context),
  ]);
  if (leftCommon === null || rightCommon === null) return "unknown";
  return leftCommon === rightCommon ? "same" : "different";
}

async function unresolvedCandidateCouldBeSubmission(
  outbox: PiDispatchOutbox,
  candidatePath: string,
): Promise<boolean> {
  const latestAttempt = outbox.submissionAttemptReceipts.at(-1);
  if (!latestAttempt) return false;
  try {
    const candidateStat = await stat(candidatePath);
    return (
      Math.max(
        candidateStat.birthtimeMs,
        candidateStat.ctimeMs,
        candidateStat.mtimeMs,
      ) >=
        Date.parse(latestAttempt.recordedAt) - 2_000
    );
  } catch {
    return true;
  }
}

/**
 * A full lost-ack scan may ignore an old or provably unrelated broken run, but
 * a package-owned candidate created after the durable submission receipt must
 * fail closed when its mission, repository, or session markers cannot rule it out.
 */
async function malformedCandidateCouldBeSubmission(input: {
  outbox: PiDispatchOutbox;
  runRoot: string;
  runId: string;
  rawStatus?: unknown;
  expectedTransportTask: string;
  sessionRoots: readonly string[];
  context: PiDispatchOutboxContext;
}): Promise<boolean> {
  const latestAttempt = input.outbox.submissionAttemptReceipts.at(-1);
  if (!latestAttempt) return false;
  const attemptedAt = Date.parse(latestAttempt.recordedAt);
  let candidateCreatedAt: number | undefined;
  try {
    const metadata = z
      .object({
        version: z.literal(1),
        rootRunId: z.string(),
        createdAt: z.number(),
      })
      .safeParse(
        JSON.parse(
          await readFile(join(input.runRoot, "run-fanout-budget.json"), "utf8"),
        ),
      );
    if (metadata.success && metadata.data.rootRunId === input.runId) {
      candidateCreatedAt = metadata.data.createdAt;
    }
  } catch {
    // The fixed run directory and timestamp remain package-owned correlation evidence.
  }
  try {
    const mission = z
      .object({ schemaVersion: z.literal(1), projectRoot: z.string() })
      .safeParse(
        JSON.parse(await readFile(join(input.runRoot, "mission.json"), "utf8")),
      );
    if (
      mission.success &&
      (await repositoryRelation(
          mission.data.projectRoot,
          input.context.repoDir,
          input.context,
        )) ===
        "different"
    ) {
      return false;
    }
  } catch {
    // Mission attachment is optional.
  }
  if (input.rawStatus && typeof input.rawStatus === "object") {
    const partial = input.rawStatus as { cwd?: unknown; steps?: unknown };
    if (
      typeof partial.cwd === "string" &&
      (await repositoryRelation(
          partial.cwd,
          input.context.repoDir,
          input.context,
        )) === "different"
    ) {
      return false;
    }
    if (Array.isArray(partial.steps)) {
      const sessionFiles = partial.steps
        .map((step) =>
          typeof step === "object" &&
            step !== null &&
            typeof (step as { sessionFile?: unknown }).sessionFile === "string"
            ? (step as { sessionFile: string }).sessionFile
            : null
        )
        .filter((path): path is string => path !== null);
      if (sessionFiles.length > 0) {
        let unreadable = false;
        for (const sessionFile of sessionFiles) {
          const contains = await readableFileContains(
            sessionFile,
            input.expectedTransportTask,
            input.sessionRoots,
          );
          if (contains === true) return true;
          if (contains === null) unreadable = true;
        }
        if (!unreadable) return false;
      }
    }
  }
  if (candidateCreatedAt === undefined) {
    try {
      const runStat = await stat(input.runRoot);
      candidateCreatedAt = Math.max(
        runStat.birthtimeMs,
        runStat.ctimeMs,
        runStat.mtimeMs,
      );
    } catch {
      return true;
    }
  }
  return Number.isFinite(attemptedAt) &&
    (candidateCreatedAt ?? 0) >= attemptedAt - 2_000;
}

/** Fixed code-owned scan of Pi's normalized top-level one-worker workflow lifecycle. */
export async function inspectPiRuntimeReceipts(
  outbox: PiDispatchOutbox,
  context: PiDispatchOutboxContext,
  requestedPiRunId?: string,
): Promise<PiRuntimeInspection> {
  const submissionAttempt = await requireDurableSubmissionAttempt(outbox);
  const receipts: PiLaunchReceipt[] = [];
  const requestedMatchKinds: Array<"outer" | "child"> = [];
  const lifecycleObservations: PiRuntimeLifecycleObservation[] = [];
  let relevantArtifactInvalid = false;
  let requestedLifecyclePending = false;
  const configuredSessionRoots = context.piSessionRoots ?? [
    resolve(homedir(), ".pi", "agent", "sessions"),
  ];
  const sessionRoots = (
    await Promise.all(
      configuredSessionRoots.map(async (root) => {
        try {
          return await realpath(root);
        } catch {
          return null;
        }
      }),
    )
  ).filter((root): root is string => root !== null);
  const expectedTransportTask = createFactoryPiTransportTask(
    outbox.piRequest.task,
    outbox.profileModelName,
    outbox.dispatchToken,
    outbox.piTaskDigest,
    {
      submissionAttemptId: submissionAttempt.submissionAttemptId,
      ordinal: submissionAttempt.ordinal,
      receiptDigest: submissionAttempt.receiptDigest,
    },
  );
  let readableRoot = false;
  for (const configuredRoot of allowedAsyncRoots(context)) {
    let root: string;
    try {
      root = await realpath(configuredRoot);
    } catch {
      continue;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
      readableRoot = true;
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      let isRequested = requestedPiRunId === entry.name;
      let runRoot: string;
      try {
        runRoot = await realpath(join(root, entry.name));
      } catch {
        if (
          isRequested ||
          (await unresolvedCandidateCouldBeSubmission(
            outbox,
            join(root, entry.name),
          ))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(join(runRoot, "status.json")));
      } catch {
        if (
          isRequested ||
          (await malformedCandidateCouldBeSubmission({
            outbox,
            runRoot,
            runId: entry.name,
            expectedTransportTask,
            sessionRoots,
            context,
          }))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      let rawStatus: unknown;
      try {
        rawStatus = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      } catch {
        if (
          isRequested ||
          (await malformedCandidateCouldBeSubmission({
            outbox,
            runRoot,
            runId: entry.name,
            expectedTransportTask,
            sessionRoots,
            context,
          }))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      if (
        requestedPiRunId &&
        rawStatus !== null &&
        typeof rawStatus === "object" &&
        Array.isArray((rawStatus as { steps?: unknown }).steps)
      ) {
        isRequested = isRequested ||
          (rawStatus as { steps: Array<{ runId?: unknown }> }).steps.some(
            (step) => step?.runId === requestedPiRunId,
          );
      }
      const parsed = PiWorkflowStatusSchema.safeParse(rawStatus);
      if (
        !parsed.success ||
        parsed.data.runId !== entry.name ||
        (parsed.success &&
          (await repositoryRelation(
              parsed.data.cwd,
              context.repoDir,
              context,
            )) !== "same")
      ) {
        if (
          isRequested ||
          (await malformedCandidateCouldBeSubmission({
            outbox,
            runRoot,
            runId: entry.name,
            rawStatus,
            expectedTransportTask,
            sessionRoots,
            context,
          }))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      const step = parsed.data.steps[0]!;
      let requestedMatchKind: "outer" | "child" | undefined =
        requestedPiRunId === undefined
          ? undefined
          : parsed.data.runId === requestedPiRunId
          ? "outer"
          : step.runId === requestedPiRunId
          ? "child"
          : undefined;
      if (
        requestedPiRunId && requestedMatchKind === undefined &&
        !step.sessionFile
      ) {
        continue;
      }
      if (!step.sessionFile) {
        if (
          requestedMatchKind &&
          ["queued", "running"].includes(parsed.data.state)
        ) {
          requestedLifecyclePending = true;
        } else if (
          isRequested ||
          (await malformedCandidateCouldBeSubmission({
            outbox,
            runRoot,
            runId: entry.name,
            rawStatus,
            expectedTransportTask,
            sessionRoots,
            context,
          }))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      let session: { digest: string; childRunIds: string[] } | null;
      try {
        session = await sessionContainsExactTask(
          step.sessionFile,
          expectedTransportTask,
          sessionRoots,
        );
      } catch {
        if (
          requestedMatchKind &&
          ["queued", "running"].includes(parsed.data.state)
        ) {
          requestedLifecyclePending = true;
        } else if (
          isRequested ||
          (await malformedCandidateCouldBeSubmission({
            outbox,
            runRoot,
            runId: entry.name,
            rawStatus,
            expectedTransportTask,
            sessionRoots,
            context,
          }))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      if (!session) {
        const marker = await readableFileContains(
          step.sessionFile,
          expectedTransportTask,
          sessionRoots,
        );
        if (
          requestedMatchKind &&
          ["queued", "running"].includes(parsed.data.state)
        ) {
          requestedLifecyclePending = true;
        } else if (
          isRequested ||
          marker === true ||
          (marker === null &&
            (await malformedCandidateCouldBeSubmission({
              outbox,
              runRoot,
              runId: entry.name,
              rawStatus,
              expectedTransportTask,
              sessionRoots,
              context,
            })))
        ) {
          relevantArtifactInvalid = true;
        }
        continue;
      }
      const requestedSessionChildMatch = requestedPiRunId !== undefined &&
        session.childRunIds.includes(requestedPiRunId);
      if (requestedMatchKind === undefined && requestedSessionChildMatch) {
        requestedMatchKind = "child";
      }
      if (requestedPiRunId && requestedMatchKind === undefined) {
        if (["queued", "running"].includes(parsed.data.state)) {
          requestedLifecyclePending = true;
        }
        continue;
      }
      const lifecycleState =
        parsed.data.state === "paused" &&
          ["failed", "stopped", "rejected"].includes(step.status)
          ? step.status as "failed" | "stopped" | "rejected"
          : parsed.data.state;
      lifecycleObservations.push({
        piRunId: parsed.data.runId,
        state: lifecycleState,
        statusDigest: await sha256(bytes),
        sessionDigest: session.digest,
      });
      const isLiveSupervisorPausedChild =
        parsed.data.state === "paused" && step.status === "running" &&
        requestedMatchKind === "child" && requestedSessionChildMatch;
      if (
        !["queued", "running", "complete"].includes(parsed.data.state) &&
        !isLiveSupervisorPausedChild
      ) {
        continue;
      }

      let contractState: "provisional" | "verified" = "provisional";
      let launchContractDigest: string | undefined;
      let launchResolvedExtensions:
        | z.infer<typeof LaunchResolvedExtensionsSchema>
        | undefined;
      let runtimeRequestDigest: string | undefined;
      let handoffArtifactDigest: string | undefined;
      if (parsed.data.state === "complete") {
        try {
          const value = parsed.data.workflow?.value;
          const result = value?.results[0];
          const childRunId = value?.runId;
          const handoffPath = value?.artifactPaths.find(
            (path) =>
              childRunId && path.endsWith(`/handoffs/${childRunId}.json`),
          );
          if (
            !value ||
            !value.ok ||
            !result ||
            !childRunId ||
            step.runId !== childRunId ||
            result.sessionFile !== step.sessionFile ||
            canonicalJson(value.structuredOutput) !==
              canonicalJson(result.structuredOutput) ||
            !handoffPath
          ) {
            relevantArtifactInvalid = true;
            continue;
          }
          const schemaArtifact = await readContainedJson(
            result.structuredOutputSchemaPath,
            sessionRoots,
          );
          const handoffArtifact = await readContainedJson(
            handoffPath,
            sessionRoots,
          );
          const handoff = z
            .object({
              version: z.literal(1),
              runId: z.literal(childRunId),
              mode: z.literal("parallel"),
              source: z.enum(["foreground", "async"]),
              cwd: z.string(),
              groups: z
                .array(
                  z.object({
                    children: z.array(z.object({ agent: z.literal("worker") }))
                      .length(1),
                  }),
                )
                .length(1),
            })
            .passthrough()
            .safeParse(handoffArtifact?.value);
          if (
            !schemaArtifact ||
            !factoryFleetWorkerOutputSchemasSemanticallyEqual(
              schemaArtifact.value,
              createFactoryFleetWorkerOutputJsonSchema({
                rootEpicId: outbox.rootEpicId,
                activeTaskId: outbox.workItem,
                workItem: outbox.workItem,
                piKey: `factory:${outbox.rootEpicId}:${outbox.workItem}`,
              }),
            ) ||
            !handoff.success ||
            (handoff.success &&
              (await repositoryRelation(
                  handoff.data.cwd,
                  context.repoDir,
                  context,
                )) !== "same")
          ) {
            relevantArtifactInvalid = true;
            continue;
          }
          runtimeRequestDigest = await sha256(canonicalJson(outbox.piRequest));
          if (runtimeRequestDigest !== outbox.exactFrozenRequestDigest) {
            relevantArtifactInvalid = true;
            continue;
          }
          contractState = "verified";
          handoffArtifactDigest = handoffArtifact!.digest;
          launchContractDigest = result.launchContractDigest;
          launchResolvedExtensions = result.launchResolvedExtensions;
        } catch {
          relevantArtifactInvalid = true;
          continue;
        }
      }
      const base = {
        schemaVersion: 2 as const,
        dispatchToken: outbox.dispatchToken,
        piRunId: parsed.data.runId,
        sourceFactoryId: outbox.sourceFactoryId,
        workItem: outbox.workItem,
        stage: outbox.stage,
        stageCycle: outbox.stageCycle,
        dispatchAttempt: outbox.dispatchAttempt,
        exactFrozenRequestDigest: outbox.exactFrozenRequestDigest,
        submissionAttemptId: submissionAttempt.submissionAttemptId,
        submissionAttemptOrdinal: submissionAttempt.ordinal,
        submissionAttemptReceiptDigest: submissionAttempt.receiptDigest,
        contractState,
        ...(launchContractDigest ? { launchContractDigest } : {}),
        ...(launchResolvedExtensions ? { launchResolvedExtensions } : {}),
        ...(runtimeRequestDigest ? { runtimeRequestDigest } : {}),
        ...(handoffArtifactDigest ? { handoffArtifactDigest } : {}),
        statusDigest: await sha256(bytes),
        sessionDigest: session.digest,
        observedAt: currentTime(context),
      };
      receipts.push(
        PiLaunchReceiptSchema.parse({
          ...base,
          receiptDigest: await sha256(canonicalJson(base)),
        }),
      );
      if (requestedMatchKind) requestedMatchKinds.push(requestedMatchKind);
    }
  }
  return {
    available: readableRoot,
    receipts,
    requestedMatchKinds,
    lifecycleObservations,
    relevantArtifactInvalid,
    requestedLifecyclePending,
  };
}

async function requireCanonicalFrozenPiRequest(
  outbox: PiDispatchOutbox,
  context: PiDispatchOutboxContext,
): Promise<void> {
  const canonicalFrozenPiRequest = canonicalJson(outbox.piRequest);
  if (outbox.canonicalFrozenPiRequest !== canonicalFrozenPiRequest) {
    throw new Error(
      "Durable Pi outbox request does not match its canonical frozen request.",
    );
  }
  if (
    (await sha256(canonicalFrozenPiRequest)) !==
      outbox.exactFrozenRequestDigest ||
    (await sha256(outbox.piRequest.task)) !== outbox.piTaskDigest
  ) {
    throw new Error(
      "Durable Pi outbox request does not match its content digests.",
    );
  }
  if ((await tokenFor(outbox)) !== outbox.dispatchToken) {
    throw new Error(
      "Durable Pi outbox request does not match its dispatch token.",
    );
  }
  if (outbox.sourceFactoryId !== context.globalArgs.sourceFactoryId) {
    throw new Error(
      "Durable Pi outbox request belongs to a different Factory.",
    );
  }
  if (
    outbox.profileModelName !== (await resolveCurrentProfileModelName(context))
  ) {
    throw new Error(
      "Durable Pi outbox request belongs to a different profile model.",
    );
  }
  if (
    outbox.failureAuthorizerWorkflow !==
      configuredFailureAuthorizerWorkflow(context)
  ) {
    throw new Error(
      "Durable Pi outbox request belongs to a different failure authorizer.",
    );
  }
}

/** Return only the model-owned canonical request bound to one durable dispatch token. */
export async function getPiDispatchRequest(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dispatchToken: string;
  state: PiDispatchOutboxState;
  sourceFactoryId: string;
  workItem: string;
  rootEpicId: string;
  stage: z.infer<typeof StageSchema>;
  stageCycle: number;
  dispatchAttempt: number;
  exactFrozenRequestDigest: string;
  piTaskDigest: string;
  canonicalFrozenPiRequest: string;
  profileModelName: string;
}> {
  const { dispatchToken } = PiDispatchTokenArgsSchema.parse(raw);
  const outbox = await readOutbox(dispatchToken, context);
  await requireCanonicalFrozenPiRequest(outbox, context);
  return {
    dispatchToken: outbox.dispatchToken,
    state: outbox.state,
    ...identityOf(outbox),
    profileModelName: outbox.profileModelName,
    canonicalFrozenPiRequest: outbox.canonicalFrozenPiRequest,
  };
}

export async function reservePiDispatch(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  dispatchToken: string;
  profileModelName: string;
  state: string;
}> {
  const args = ReservePiDispatchArgsSchema.parse(raw);
  const profileModelName = await resolveCurrentProfileModelName(context);
  const failureAuthorizerWorkflow = configuredFailureAuthorizerWorkflow(
    context,
  );
  const canonicalFrozenPiRequest = canonicalJson(args.piRequest);
  const requestDigest = await sha256(canonicalFrozenPiRequest);
  const taskDigest = await sha256(args.piRequest.task);
  if (
    requestDigest !== args.exactFrozenRequestDigest ||
    taskDigest !== args.piTaskDigest
  ) {
    throw new Error(
      "Pi reservation digests do not match the exact frozen request.",
    );
  }
  await requireRequestMatchesFactoryWork(args, context);
  const factoryStartedAt = await currentFactoryStartedAt(args, context);
  if ((await inspectDispatch(args, context)) !== "before") {
    throw new Error("Reservation must precede Factory dispatch accounting.");
  }
  const dispatchToken = await tokenFor(args);
  const existing = await context.readResource(outboxName(dispatchToken));
  if (existing !== null) {
    const outbox = PiDispatchOutboxSchema.parse(existing);
    await requireCanonicalFrozenPiRequest(outbox, context);
    const existingIdentity = identityOf(outbox);
    const requestedIdentity = identityOf(args);
    if (
      canonicalJson(existingIdentity) !== canonicalJson(requestedIdentity) ||
      outbox.maximumTransportAttempts !== args.maximumTransportAttempts
    ) {
      throw new Error(
        "Existing Pi dispatch reservation has different immutable inputs.",
      );
    }
    if (
      outbox.schemaVersion === 2 && outbox.factoryStartedAt === factoryStartedAt
    ) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        dispatchToken,
        profileModelName: outbox.profileModelName,
        state: outbox.state,
      };
    }
    const priorEpoch = outbox.schemaVersion === 2
      ? outbox.factoryStartedAt
      : outbox.updatedAt;
    const hasExecutionOwnershipEvidence =
      outbox.claimNonceDigest !== undefined ||
      (await context.readResource(claimName(dispatchToken))) !== null ||
      (await context.readResource(piHandoffAcceptanceName(dispatchToken))) !==
        null ||
      outbox.piExecutionFailureReceiptDigest !== undefined;
    const recordedAttemptIds = new Set(
      outbox.submissionAttemptReceipts.map((receipt) =>
        receipt.submissionAttemptId
      ),
    );
    const hasCompleteExhaustionEvidence =
      outbox.transportAttempts === outbox.maximumTransportAttempts &&
      outbox.submissionAttemptReceipts.length ===
        outbox.maximumTransportAttempts &&
      recordedAttemptIds.size === outbox.maximumTransportAttempts &&
      outbox.submissionAttemptReceipts.every((receipt, index) =>
        receipt.ordinal === index + 1
      );
    const hasExhaustedUnclaimedTransportState =
      (outbox.state === "submission-parked" &&
        outbox.parkedReason === "transport-retries-exhausted") ||
      outbox.state === "submitted" ||
      outbox.state === "submission-uncertain";
    if (
      Date.parse(priorEpoch) >= Date.parse(factoryStartedAt) ||
      !hasExhaustedUnclaimedTransportState ||
      !hasCompleteExhaustionEvidence ||
      hasExecutionOwnershipEvidence
    ) {
      throw new Error(
        "Existing Pi dispatch reservation is not a safely recyclable pre-reset outbox.",
      );
    }
    await requireDurableSubmissionAttempt(outbox);
  }
  const at = currentTime(context);
  const outbox = CurrentPiDispatchOutboxSchema.parse({
    ...args,
    schemaVersion: 2,
    factoryStartedAt,
    profileModelName,
    failureAuthorizerWorkflow,
    dispatchToken,
    state: "reserved",
    canonicalFrozenPiRequest,
    transportAttempts: 0,
    reservedAt: at,
    updatedAt: at,
  });
  const handle = await writeOutbox(outbox, context);
  return {
    dataHandles: [handle],
    dispatchToken,
    profileModelName: outbox.profileModelName,
    state: outbox.state,
  };
}

export async function recordPiSubmissionAttempt(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  state: string;
  submissionAttemptReceiptDigest: string;
  transportAttempts: number;
  newlyConsumed: boolean;
  ordinal: number;
}> {
  const { dispatchToken, submissionAttemptId } =
    RecordPiSubmissionAttemptArgsSchema.parse(raw);
  let outbox = await readOutbox(dispatchToken, context);
  if ((await inspectDispatch(outbox, context)) !== "recorded") {
    throw new Error(
      "Pi submission attempt has no exact Factory dispatch journal entry.",
    );
  }
  const existing = outbox.submissionAttemptReceipts.find(
    (receipt) => receipt.submissionAttemptId === submissionAttemptId,
  );
  if (existing) {
    await requireDurableSubmissionAttempt(outbox);
    return {
      dataHandles: [{ name: outboxName(dispatchToken) }],
      state: outbox.state,
      submissionAttemptReceiptDigest: existing.receiptDigest,
      transportAttempts: outbox.transportAttempts,
      newlyConsumed: false,
      ordinal: existing.ordinal,
    };
  }
  if (outbox.state === "reserved") {
    outbox = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: "dispatch-recorded",
      updatedAt: currentTime(context),
    });
    await writeOutbox(outbox, context);
  }
  if (!["dispatch-recorded", "submission-retryable"].includes(outbox.state)) {
    throw new Error(
      `A fresh Pi submission attempt is not allowed from ${outbox.state}; explicit retry resolution is required.`,
    );
  }
  if (outbox.piRunId) throw new Error("A Pi run already owns this dispatch.");
  if (outbox.state === "dispatch-recorded") {
    if (
      outbox.transportAttempts !== 0 ||
      outbox.submissionAttemptReceipts.length !== 0
    ) {
      throw new Error(
        "Initial dispatch-recorded submission state already consumed an attempt.",
      );
    }
  } else {
    await requireDurableSubmissionAttempt(outbox);
  }
  if (outbox.transportAttempts >= outbox.maximumTransportAttempts) {
    throw new Error("Pi submission transport budget is exhausted.");
  }
  const ordinal = outbox.transportAttempts + 1;
  const receiptDigest = await sha256(
    canonicalJson({
      dispatchToken,
      submissionAttemptId,
      ordinal,
      exactFrozenRequestDigest: outbox.exactFrozenRequestDigest,
      factoryStartedAt: outbox.factoryStartedAt,
    }),
  );
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: "submit-pending",
    transportAttempts: ordinal,
    submissionAttemptReceipts: [
      ...outbox.submissionAttemptReceipts,
      {
        ordinal,
        submissionAttemptId,
        receiptDigest,
        recordedAt: currentTime(context),
      },
    ],
    parkedReason: undefined,
    updatedAt: currentTime(context),
  });
  const handle = await writeOutbox(updated, context);
  return {
    dataHandles: [handle],
    state: updated.state,
    submissionAttemptReceiptDigest: receiptDigest,
    transportAttempts: ordinal,
    newlyConsumed: true,
    ordinal,
  };
}

async function recordClaimedPiExecutionFailure(
  outbox: CurrentPiDispatchOutbox,
  observation: PiRuntimeLifecycleObservation,
  context: PiDispatchOutboxContext,
): Promise<{
  outbox: PiDispatchOutbox;
  handles: Array<{ name: string }>;
  factoryExecutionFailureReceiptName: string;
}> {
  if (!["failed", "stopped", "rejected"].includes(observation.state)) {
    throw new Error(
      "Pi execution failure receipt requires an exact terminal failure lifecycle.",
    );
  }
  if (
    !outbox.piRunId || outbox.piRunId !== observation.piRunId ||
    !outbox.piRuntimeReceiptDigest
  ) {
    throw new Error(
      "Pi execution failure is not bound to the exact verified launch.",
    );
  }
  const rawClaim = await context.readResource(claimName(outbox.dispatchToken));
  const claim = PiExecutionClaimSchema.parse(rawClaim);
  if (
    claim.piRunId !== observation.piRunId ||
    claim.claimNonceDigest !== outbox.claimNonceDigest
  ) {
    throw new Error(
      "Pi execution failure is not bound to the authorized execution claim.",
    );
  }
  const failureBase = {
    schemaVersion: 1 as const,
    ...identityOf(outbox),
    dispatchToken: outbox.dispatchToken,
    piRunId: observation.piRunId,
    dispatchRunId: outbox.exactFrozenRequestDigest,
    piRuntimeReceiptDigest: outbox.piRuntimeReceiptDigest,
    claimNonceDigest: claim.claimNonceDigest,
    runtimeState: observation.state as "failed" | "stopped" | "rejected",
    statusDigest: observation.statusDigest,
    sessionDigest: observation.sessionDigest,
    observedAt: currentTime(context),
  };
  const failureReceipt = PiExecutionFailureReceiptSchema.parse({
    ...failureBase,
    receiptDigest: await sha256(canonicalJson(failureBase)),
  });
  const piFailureHandle = await context.writeResource(
    "pi-execution-failure",
    piExecutionFailureName(failureReceipt.receiptDigest),
    failureReceipt,
  );
  const authorityContent = {
    schemaVersion: 6 as const,
    factoryStartedAt: outbox.factoryStartedAt,
    sourceFactoryId: outbox.sourceFactoryId,
    workItem: outbox.workItem,
    stage: outbox.stage,
    stageCycle: outbox.stageCycle,
    dispatchAttempt: outbox.dispatchAttempt,
    dispatchRunId: outbox.exactFrozenRequestDigest,
    failureKind: "operational" as const,
    category: "workflow-failed" as const,
    executionReceipt: {
      kind: "workflow" as const,
      receiptId: `pi:${failureReceipt.receiptDigest}`,
      status: "failed" as const,
      workflowName: "pi-subagents",
      workflowRunId: observation.piRunId,
      inputsDigest: outbox.exactFrozenRequestDigest,
    },
    retryable: true,
    error:
      `Claimed Pi execution ${observation.piRunId} entered ${observation.state}.`,
    occurredAt: failureReceipt.observedAt,
    authorityWorkflow: outbox.failureAuthorizerWorkflow,
  };
  const authorityDigest = await sha256(canonicalJson(authorityContent));
  const authorityReceiptName = `factory-execution-failure-${authorityDigest}`;
  const authorityReceipt = FactoryAuthorityReceiptSchema.parse({
    ...authorityContent,
    receiptDigest: authorityDigest,
    authorityReceiptName,
    authorityDigest,
  });
  const authorityHandle = await context.writeResource(
    "execution-failure",
    authorityReceiptName,
    authorityReceipt,
  );
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: "execution-failed",
    piExecutionFailureReceiptDigest: failureReceipt.receiptDigest,
    factoryExecutionFailureReceiptName: authorityReceiptName,
    updatedAt: currentTime(context),
  });
  const outboxHandle = await writeOutbox(updated, context);
  return {
    outbox: updated,
    handles: [piFailureHandle, authorityHandle, outboxHandle],
    factoryExecutionFailureReceiptName: authorityReceiptName,
  };
}

export async function reconcilePiDispatch(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  state: string;
  piRunId?: string;
  factoryExecutionFailureReceiptName?: string;
}> {
  const { dispatchToken } = PiDispatchTokenArgsSchema.parse(raw);
  let outbox = await readOutbox(dispatchToken, context);
  await requireDurableSubmissionAttempt(outbox);
  requirePiDispatchSourceState(
    outbox,
    "Pi dispatch reconciliation",
    PI_DISPATCH_SOURCE_STATES.reconcile,
  );
  if ((await inspectDispatch(outbox, context)) !== "recorded") {
    throw new Error(
      "Pi dispatch reconciliation has no exact Factory dispatch journal entry.",
    );
  }
  if (outbox.state === "handoff-ready") {
    return {
      dataHandles: [{ name: outboxName(dispatchToken) }],
      state: outbox.state,
      piRunId: outbox.piRunId!,
    };
  }
  const inspected = await inspectPiRuntimeReceipts(outbox, context);
  const rawClaim = await context.readResource(claimName(dispatchToken));
  const claim = rawClaim === null
    ? null
    : PiExecutionClaimSchema.parse(rawClaim);
  const ownerObservation = claim
    ? inspected.lifecycleObservations.find((candidate) =>
      candidate.piRunId === claim.piRunId
    )
    : undefined;
  if (
    claim &&
    ownerObservation &&
    ["failed", "stopped", "rejected"].includes(ownerObservation.state)
  ) {
    const failed = await recordClaimedPiExecutionFailure(
      outbox,
      ownerObservation,
      context,
    );
    return {
      dataHandles: failed.handles,
      state: failed.outbox.state,
      piRunId: claim.piRunId,
      factoryExecutionFailureReceiptName:
        failed.factoryExecutionFailureReceiptName,
    };
  }
  if (claim && ownerObservation?.state === "paused") {
    outbox = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: "submission-uncertain",
      parkedReason: "claimed-execution-paused",
      updatedAt: currentTime(context),
    });
    const handle = await writeOutbox(outbox, context);
    return {
      dataHandles: [handle],
      state: outbox.state,
      piRunId: claim.piRunId,
    };
  }
  if (!claim && outbox.piRunId) {
    const boundObservation = inspected.lifecycleObservations.find(
      (candidate) => candidate.piRunId === outbox.piRunId,
    );
    if (
      boundObservation &&
      ["failed", "stopped", "rejected"].includes(boundObservation.state)
    ) {
      const nextState =
        outbox.transportAttempts >= outbox.maximumTransportAttempts
          ? "submission-parked"
          : "submission-retryable";
      outbox = CurrentPiDispatchOutboxSchema.parse({
        ...outbox,
        state: nextState,
        piRunId: undefined,
        piRuntimeReceiptDigest: undefined,
        launchContractDigest: undefined,
        runtimeRequestDigest: undefined,
        launchContractVerified: false,
        parkedReason: nextState === "submission-parked"
          ? "transport-retries-exhausted"
          : undefined,
        updatedAt: currentTime(context),
      });
      const handle = await writeOutbox(outbox, context);
      return { dataHandles: [handle], state: outbox.state };
    }
    if (boundObservation?.state === "paused") {
      outbox = CurrentPiDispatchOutboxSchema.parse({
        ...outbox,
        state: "submission-uncertain",
        parkedReason: "runtime-paused",
        updatedAt: currentTime(context),
      });
      const handle = await writeOutbox(outbox, context);
      return {
        dataHandles: [handle],
        state: outbox.state,
        piRunId: outbox.piRunId,
      };
    }
    // A verified launch binds this dispatch to one exact Pi run. Historical
    // attempts remain durable evidence, but cannot make that owner ambiguous.
    return {
      dataHandles: [{ name: outboxName(dispatchToken) }],
      state: outbox.state,
      piRunId: outbox.piRunId,
    };
  }
  if (!claim) {
    if (inspected.relevantArtifactInvalid) {
      outbox = CurrentPiDispatchOutboxSchema.parse({
        ...outbox,
        state: "submission-uncertain",
        parkedReason: "invalid-runtime-artifact",
        updatedAt: currentTime(context),
      });
      const handle = await writeOutbox(outbox, context);
      return { dataHandles: [handle], state: outbox.state };
    }
    const exactTerminal = inspected.lifecycleObservations.filter((candidate) =>
      ["failed", "stopped", "rejected"].includes(candidate.state)
    );
    const exactPaused = inspected.lifecycleObservations.filter(
      (candidate) => candidate.state === "paused",
    );
    if (
      exactPaused.length > 0 ||
      exactTerminal.length > 1 ||
      (exactTerminal.length === 1 && inspected.lifecycleObservations.length > 1)
    ) {
      outbox = CurrentPiDispatchOutboxSchema.parse({
        ...outbox,
        state: "submission-uncertain",
        parkedReason: exactPaused.length > 0
          ? "runtime-paused"
          : "ambiguous-runtime",
        updatedAt: currentTime(context),
      });
      const handle = await writeOutbox(outbox, context);
      return { dataHandles: [handle], state: outbox.state };
    }
    if (exactTerminal.length === 1) {
      const nextState =
        outbox.transportAttempts >= outbox.maximumTransportAttempts
          ? "submission-parked"
          : "submission-retryable";
      outbox = CurrentPiDispatchOutboxSchema.parse({
        ...outbox,
        state: nextState,
        piRunId: undefined,
        piRuntimeReceiptDigest: undefined,
        launchContractDigest: undefined,
        runtimeRequestDigest: undefined,
        launchContractVerified: false,
        parkedReason: nextState === "submission-parked"
          ? "transport-retries-exhausted"
          : undefined,
        updatedAt: currentTime(context),
      });
      const handle = await writeOutbox(outbox, context);
      return { dataHandles: [handle], state: outbox.state };
    }
  }
  const monotonicBoundState = [
    "submitted",
    "execution-claimed",
    "handoff-ready",
    "completed",
    "execution-failed",
  ].includes(outbox.state);
  if (!inspected.available) {
    if (monotonicBoundState) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        state: outbox.state,
        ...(outbox.piRunId ? { piRunId: outbox.piRunId } : {}),
      };
    }
    if (
      outbox.state === "submission-uncertain" &&
      outbox.parkedReason === "runtime-unavailable"
    ) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        state: outbox.state,
      };
    }
    outbox = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: "submission-uncertain",
      parkedReason: "runtime-unavailable",
      updatedAt: currentTime(context),
    });
  } else if (inspected.relevantArtifactInvalid) {
    if (monotonicBoundState) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        state: outbox.state,
        ...(outbox.piRunId ? { piRunId: outbox.piRunId } : {}),
      };
    }
    if (
      outbox.state === "submission-uncertain" &&
      outbox.parkedReason === "invalid-runtime-artifact"
    ) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        state: outbox.state,
      };
    }
    outbox = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: "submission-uncertain",
      parkedReason: "invalid-runtime-artifact",
      updatedAt: currentTime(context),
    });
  } else if (inspected.receipts.length === 0) {
    if (monotonicBoundState) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        state: outbox.state,
        ...(outbox.piRunId ? { piRunId: outbox.piRunId } : {}),
      };
    }
    const nextState =
      outbox.transportAttempts >= outbox.maximumTransportAttempts
        ? "submission-parked"
        : "submission-retryable";
    const nextReason = nextState === "submission-parked"
      ? "transport-retries-exhausted"
      : undefined;
    if (outbox.state === nextState && outbox.parkedReason === nextReason) {
      return {
        dataHandles: [{ name: outboxName(dispatchToken) }],
        state: outbox.state,
      };
    }
    outbox = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: nextState,
      parkedReason: nextReason,
      updatedAt: currentTime(context),
    });
  } else if (inspected.receipts.length === 1) {
    return bindVerifiedLaunch(outbox, inspected.receipts[0]!, context);
  } else {
    const claim = await context.readResource(claimName(dispatchToken));
    if (claim) {
      const owner = PiExecutionClaimSchema.parse(claim).piRunId;
      const receipt = inspected.receipts.find((candidate) =>
        candidate.piRunId === owner
      );
      if (receipt) return bindVerifiedLaunch(outbox, receipt, context);
    }
    outbox = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: "submission-uncertain",
      parkedReason: "ambiguous-runtime",
      updatedAt: currentTime(context),
    });
  }
  const handle = await writeOutbox(outbox, context);
  return {
    dataHandles: [handle],
    state: outbox.state,
    ...(outbox.piRunId ? { piRunId: outbox.piRunId } : {}),
  };
}

async function bindVerifiedLaunch(
  outbox: PiDispatchOutbox,
  receipt: PiLaunchReceipt,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  state: string;
  piRunId: string;
}> {
  await requireReceiptMatchesSubmissionAttempt(outbox, receipt);
  if (outbox.piRunId && outbox.piRunId !== receipt.piRunId) {
    throw new Error("Pi launch binding cannot change run identity.");
  }
  const receiptHandle = await context.writeResource(
    "pi-launch-receipt",
    launchName(outbox.dispatchToken),
    receipt,
  );
  const preservedState =
    ["handoff-ready", "completed", "execution-failed"].includes(outbox.state)
      ? outbox.state
      : outbox.claimNonceDigest
      ? "execution-claimed"
      : "submitted";
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: preservedState,
    piRunId: receipt.piRunId,
    piRuntimeReceiptDigest: receipt.receiptDigest,
    ...(receipt.launchContractDigest
      ? { launchContractDigest: receipt.launchContractDigest }
      : {}),
    ...(receipt.runtimeRequestDigest
      ? { runtimeRequestDigest: receipt.runtimeRequestDigest }
      : {}),
    launchContractVerified: receipt.contractState === "verified",
    updatedAt: currentTime(context),
  });
  const outboxHandle = await writeOutbox(updated, context);
  return {
    dataHandles: [receiptHandle, outboxHandle],
    state: updated.state,
    piRunId: receipt.piRunId,
  };
}

const DEFAULT_PI_LAUNCH_BINDING_INSPECTIONS = 181;
const PI_LAUNCH_BINDING_WAIT_MILLISECONDS = 500;

async function waitForPiRuntimeArtifact(
  context: PiDispatchOutboxContext,
): Promise<void> {
  if (context.waitForPiRuntimeArtifact) {
    await context.waitForPiRuntimeArtifact();
    return;
  }
  await new Promise<void>((resolveWait) =>
    setTimeout(resolveWait, PI_LAUNCH_BINDING_WAIT_MILLISECONDS)
  );
}

async function inspectPiLaunchWhenReady(
  outbox: CurrentPiDispatchOutbox,
  context: PiDispatchOutboxContext,
  piRunId: string,
): Promise<PiRuntimeInspection> {
  const maximumInspections = context.piLaunchBindingMaximumInspections ??
    DEFAULT_PI_LAUNCH_BINDING_INSPECTIONS;
  if (!Number.isInteger(maximumInspections) || maximumInspections < 1) {
    throw new Error("Pi launch binding inspection bound is invalid.");
  }
  let inspected: PiRuntimeInspection | undefined;
  for (let inspection = 0; inspection < maximumInspections; inspection += 1) {
    inspected = await inspectPiRuntimeReceipts(outbox, context, piRunId);
    if (
      !inspected.available ||
      inspected.relevantArtifactInvalid ||
      inspected.receipts.length > 0
    ) {
      return inspected;
    }
    if (inspection + 1 < maximumInspections) {
      await waitForPiRuntimeArtifact(context);
    }
  }
  return inspected!;
}

export async function bindPiLaunch(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  state: string;
  piRunId: string;
}> {
  const args = BindPiLaunchArgsSchema.parse(raw);
  const outbox = await readOutbox(args.dispatchToken, context);
  await requireDurableSubmissionAttempt(outbox);
  requirePiDispatchSourceState(
    outbox,
    "Pi launch binding",
    PI_DISPATCH_SOURCE_STATES.bindLaunch,
  );
  if ((await inspectDispatch(outbox, context)) !== "recorded") {
    throw new Error("Pi launch has no exact Factory dispatch journal entry.");
  }
  const inspected = await inspectPiLaunchWhenReady(
    outbox,
    context,
    args.piRunId,
  );
  const bindingTimedOutWithoutReceipt = inspected.receipts.length === 0;
  if (
    !inspected.available ||
    inspected.relevantArtifactInvalid ||
    bindingTimedOutWithoutReceipt
  ) {
    const updated = CurrentPiDispatchOutboxSchema.parse({
      ...outbox,
      state: "submission-uncertain",
      parkedReason: !inspected.available
        ? "runtime-unavailable"
        : "invalid-runtime-artifact",
      updatedAt: currentTime(context),
    });
    await writeOutbox(updated, context);
    throw new Error(
      !inspected.available
        ? "Pi runtime artifacts are unavailable; launch binding paused."
        : "Pi runtime lifecycle artifact is malformed or schema-invalid.",
    );
  }
  if (
    inspected.receipts.length !== 1 ||
    inspected.requestedMatchKinds[0] !== "outer"
  ) {
    throw new Error(
      "Pi launch receipt is missing, child-scoped, or ambiguous.",
    );
  }
  return bindVerifiedLaunch(outbox, inspected.receipts[0]!, context);
}

export async function claimPiExecution(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  granted: boolean;
  claimNonce?: string;
  ownerPiRunId: string;
}> {
  const args = ClaimPiExecutionArgsSchema.parse(raw);
  let outbox = await readOutbox(args.dispatchToken, context);
  await requireDurableSubmissionAttempt(outbox);
  requirePiDispatchSourceState(
    outbox,
    "Pi execution claim",
    PI_DISPATCH_SOURCE_STATES.claimExecution,
  );
  if ((await inspectDispatch(outbox, context)) !== "recorded") {
    throw new Error("Execution claim has no current Factory dispatch.");
  }
  const inspected = await inspectPiLaunchWhenReady(
    outbox,
    context,
    args.piRunId,
  );
  if (
    !inspected.available ||
    inspected.relevantArtifactInvalid ||
    inspected.receipts.length !== 1 ||
    inspected.requestedMatchKinds.length !== 1
  ) {
    throw new Error("Execution claim lacks one verified Pi runtime receipt.");
  }
  const currentReceipt = inspected.receipts[0]!;
  const ownerPiRunId = currentReceipt.piRunId;
  await requireReceiptMatchesSubmissionAttempt(outbox, currentReceipt);
  if (outbox.state === "submitted" && outbox.piRunId !== ownerPiRunId) {
    throw new Error("Execution claim does not match the submitted Pi run.");
  }
  if (outbox.state === "submit-pending") {
    await bindVerifiedLaunch(outbox, currentReceipt, context);
    outbox = await readOutbox(args.dispatchToken, context);
  }
  if (await context.readResource(claimName(args.dispatchToken))) {
    throw new Error(
      "Execution claim already exists outside its allowed source state.",
    );
  }
  const claimNonce = await sha256(
    `${args.dispatchToken}:${ownerPiRunId}:claim-v1`,
  );
  const claim = PiExecutionClaimSchema.parse({
    schemaVersion: 1,
    dispatchToken: args.dispatchToken,
    piRunId: ownerPiRunId,
    claimNonce,
    claimNonceDigest: await sha256(claimNonce),
    claimedAt: currentTime(context),
  });
  const claimHandle = await context.writeResource(
    "pi-execution-claim",
    claimName(args.dispatchToken),
    claim,
  );
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: "execution-claimed",
    claimNonceDigest: claim.claimNonceDigest,
    updatedAt: currentTime(context),
  });
  const outboxHandle = await writeOutbox(updated, context);
  return {
    dataHandles: [claimHandle, outboxHandle],
    granted: true,
    claimNonce,
    ownerPiRunId,
  };
}

export async function bindPiHandoff(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{
  dataHandles: Array<{ name: string }>;
  accepted: boolean;
  state: string;
  acceptance: z.infer<typeof PiHandoffAcceptanceSchema>;
}> {
  const args = BindPiHandoffArgsSchema.parse(raw);
  let outbox = await readOutbox(args.dispatchToken, context);
  await requireDurableSubmissionAttempt(outbox);
  requirePiDispatchSourceState(
    outbox,
    "Pi handoff binding",
    PI_DISPATCH_SOURCE_STATES.bindHandoff,
  );
  if (outbox.piRunId !== args.piRunId) {
    throw new Error("Handoff does not match the execution-claimed Pi run.");
  }
  const claim = PiExecutionClaimSchema.parse(
    await context.readResource(claimName(args.dispatchToken)),
  );
  if (
    claim.piRunId !== args.piRunId ||
    claim.claimNonceDigest !== outbox.claimNonceDigest ||
    claim.claimNonceDigest !== (await sha256(args.claimNonce))
  ) {
    throw new Error("Handoff does not carry the granted Pi execution claim.");
  }
  const inspected = await inspectPiRuntimeReceipts(
    outbox,
    context,
    args.piRunId,
  );
  const finalReceipt = inspected.receipts.length === 1 &&
      inspected.requestedMatchKinds[0] === "outer"
    ? inspected.receipts[0]
    : undefined;
  if (
    !inspected.available ||
    !finalReceipt ||
    finalReceipt.contractState !== "verified" ||
    finalReceipt.launchContractDigest !== args.launchContractDigest ||
    finalReceipt.runtimeRequestDigest !== outbox.exactFrozenRequestDigest ||
    finalReceipt.handoffArtifactDigest !== args.handoffDigest
  ) {
    throw new Error(
      "Handoff lacks the verified final Pi workflow launch contract.",
    );
  }
  await bindVerifiedLaunch(outbox, finalReceipt, context);
  outbox = await readOutbox(args.dispatchToken, context);
  if (outbox.handoffDigest && outbox.handoffDigest !== args.handoffDigest) {
    throw new Error("A different handoff already owns this dispatch.");
  }
  const resourceName = piHandoffAcceptanceName(args.dispatchToken);
  const acceptanceBase = {
    schemaVersion: 1 as const,
    accepted: true as const,
    resourceName,
    dispatchToken: args.dispatchToken,
    piRunId: args.piRunId,
    sourceFactoryId: outbox.sourceFactoryId,
    workItem: outbox.workItem,
    rootEpicId: outbox.rootEpicId,
    stage: outbox.stage,
    stageCycle: outbox.stageCycle,
    dispatchAttempt: outbox.dispatchAttempt,
    claimNonceDigest: claim.claimNonceDigest,
    handoffDigest: args.handoffDigest,
    launchContractDigest: args.launchContractDigest,
    runtimeRequestDigest: finalReceipt.runtimeRequestDigest,
    piRuntimeReceiptDigest: finalReceipt.receiptDigest,
    acceptedAt: currentTime(context),
  };
  const acceptance = PiHandoffAcceptanceSchema.parse({
    ...acceptanceBase,
    receiptDigest: await sha256(canonicalJson(acceptanceBase)),
  });
  const acceptanceHandle = await context.writeResource(
    "pi-handoff-acceptance",
    resourceName,
    acceptance,
  );
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: "handoff-ready",
    handoffDigest: args.handoffDigest,
    launchContractDigest: args.launchContractDigest,
    runtimeRequestDigest: finalReceipt.runtimeRequestDigest,
    piRuntimeReceiptDigest: finalReceipt.receiptDigest,
    launchContractVerified: true,
    updatedAt: currentTime(context),
  });
  const handle = await writeOutbox(updated, context);
  return {
    dataHandles: [acceptanceHandle, handle],
    accepted: true,
    state: updated.state,
    acceptance,
  };
}

export async function authorizePiSubmissionRetry(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{ dataHandles: Array<{ name: string }>; state: string }> {
  const args = AuthorizePiSubmissionRetryArgsSchema.parse(raw);
  const outbox = await readOutbox(args.dispatchToken, context);
  requirePiDispatchSourceState(
    outbox,
    "Human Pi submission retry authorization",
    PI_DISPATCH_SOURCE_STATES.authorizeRetry,
  );
  await requireDurableSubmissionAttempt(outbox);
  if ((await inspectDispatch(outbox, context)) !== "recorded") {
    throw new Error(
      "Pi submission retry has no exact Factory dispatch journal entry.",
    );
  }
  if (
    outbox.piRunId ||
    outbox.claimNonceDigest ||
    (await context.readResource(claimName(args.dispatchToken))) !== null
  ) {
    throw new Error(
      "A bound or claimed Pi run must not be transferred to a retry.",
    );
  }
  if (outbox.transportAttempts >= outbox.maximumTransportAttempts) {
    throw new Error(
      "Pi submission retry requires a fresh Factory cycle after budget exhaustion.",
    );
  }
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: "submission-retryable",
    parkedReason: undefined,
    updatedAt: currentTime(context),
  });
  const handle = await writeOutbox(updated, context);
  return { dataHandles: [handle], state: updated.state };
}

export async function parkPiSubmission(
  raw: unknown,
  context: PiDispatchOutboxContext,
): Promise<{ dataHandles: Array<{ name: string }>; state: string }> {
  const args = ParkPiSubmissionArgsSchema.parse(raw);
  const outbox = await readOutbox(args.dispatchToken, context);
  requirePiDispatchSourceState(
    outbox,
    "Pi submission parking",
    PI_DISPATCH_SOURCE_STATES.parkSubmission,
  );
  if (
    outbox.piRunId ||
    outbox.claimNonceDigest ||
    (await context.readResource(claimName(args.dispatchToken))) !== null
  ) {
    throw new Error(
      "A bound or claimed Pi run must not be parked as ambiguous transport.",
    );
  }
  if (
    args.reason === "transport-retries-exhausted" &&
    outbox.transportAttempts < outbox.maximumTransportAttempts
  ) {
    throw new Error("Transport retry budget is not exhausted.");
  }
  const updated = CurrentPiDispatchOutboxSchema.parse({
    ...outbox,
    state: "submission-parked",
    parkedReason: args.reason,
    updatedAt: currentTime(context),
  });
  const handle = await writeOutbox(updated, context);
  return { dataHandles: [handle], state: updated.state };
}
