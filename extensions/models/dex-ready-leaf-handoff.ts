/**
 * Atomic Dex ready-leaf ownership for repository Delivery Factories.
 *
 * Planning supplies an audited, human-approved boundary. This adapter decides
 * no backlog content: under the canonical Dex repository lock it resumes the
 * one active item or claims the unique global top-priority ready leaf.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import { runBoundedDexProcess } from "./dex-bounded-process.ts";
import {
  DEFAULT_DEX_REPOSITORY_LOCK,
  type DexRepositoryLock,
  DexRepositoryLockOwnershipError,
  DexRepositoryLockTimeoutError,
} from "./dex-repository-lock.ts";

export const DEX_READY_LEAF_HANDOFF_VERSION = "2026.08.06.2";

const MAX_DEX_TASKS = 500;
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PLAN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TaskIdSchema = z.string().min(1).max(128).regex(TASK_ID_PATTERN);
const TaskIdArraySchema = z.array(TaskIdSchema).max(MAX_DEX_TASKS).superRefine(
  (values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Task ids must be unique" });
    }
  },
);

/** Compact, audited Planning output accepted by the ownership boundary. */
export const DexReadyLeafApprovalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planningWorkItem: TaskIdSchema,
  planId: z.string().regex(PLAN_ID_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  proposalPlanHash: z.string().regex(SHA256_PATTERN),
  applicationIdempotencyKey: z.string().regex(SHA256_PATTERN),
  applicationCheckpointDataName: z.string().min(1),
  applicationReceiptDataName: z.string().min(1),
  applicationResultDataName: z.string().min(1),
  graphProposalFingerprint: z.string().regex(SHA256_PATTERN),
  approvedPlanFingerprint: z.string().regex(SHA256_PATTERN),
  applicationFingerprint: z.string().regex(SHA256_PATTERN),
  planningAuditFingerprint: z.string().regex(SHA256_PATTERN),
  humanApprovalFingerprint: z.string().regex(SHA256_PATTERN),
  planningHandoffFingerprint: z.string().regex(SHA256_PATTERN),
  approvalGateId: z.string().min(1),
  proposalCycle: z.number().int().min(1),
  approvalCycle: z.number().int().min(1),
  approvedAt: z.string().datetime(),
  sourceDataNames: z.strictObject({
    graphProposal: z.string().min(1),
    approvedPlan: z.string().min(1),
    humanApproval: z.string().min(1),
    planApplication: z.string().min(1),
    planningAudit: z.string().min(1),
    planningHandoff: z.string().min(1),
  }),
  status: z.enum(["ready", "no-ready-work", "human-gate"]),
  candidateTaskId: TaskIdSchema.nullable(),
  approvedEpicTaskId: TaskIdSchema.nullable(),
  approvedTaskIds: TaskIdArraySchema,
  auditedTaskIds: TaskIdArraySchema,
  summary: z.string().min(1).max(800),
  approvalFingerprint: z.string().regex(SHA256_PATTERN),
  authorizationSignature: z.string().regex(SHA256_PATTERN),
});

export const DexReadyLeafClaimArgsSchema = z.object({
  approval: DexReadyLeafApprovalSchema,
  authorizationCapability: z.string().min(32).max(256)
    .meta({ sensitive: true }),
  activeFactoryWorkItems: z.array(TaskIdSchema).max(MAX_DEX_TASKS).superRefine(
    (values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "Active Factory work items must be unique",
        });
      }
    },
  ),
});

const DexReadyLeafReasonSchema = z.enum([
  "claimed-ready-leaf",
  "resumed-active-factory",
  "recovered-started-task",
  "no-ready-work",
  "planning-no-ready-work-stale",
  "planning-human-gate",
  "multiple-active-factory-runs",
  "multiple-started-tasks",
  "started-task-ownership-ambiguous",
  "active-factory-task-invalid",
  "approved-epic-boundary-missing",
  "approved-boundary-invalid",
  "global-runway-ambiguous",
  "runway-outside-approved-plan",
  "candidate-mismatch",
  "claim-intent-invalid",
]);

/** Persisted result consumed by the repository Delivery handoff workflow. */
export const DexReadyLeafClaimSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapterVersion: z.literal(DEX_READY_LEAF_HANDOFF_VERSION),
  planningWorkItem: TaskIdSchema,
  planId: z.string().regex(PLAN_ID_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  approvalFingerprint: z.string().regex(SHA256_PATTERN),
  status: z.enum(["claimed", "resumed", "no-ready-work", "human-gate"]),
  reason: DexReadyLeafReasonSchema,
  selectedTaskId: TaskIdSchema.nullable(),
  approvedEpicTaskId: TaskIdSchema.nullable(),
  topPriority: z.number().int().min(0).max(100).nullable(),
  readyTaskIds: TaskIdArraySchema,
  activeFactoryWorkItems: z.array(TaskIdSchema).max(MAX_DEX_TASKS),
  trackerStarted: z.boolean(),
  occurredAt: z.string().datetime(),
});

export const DexReadyLeafIntentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapterVersion: z.literal(DEX_READY_LEAF_HANDOFF_VERSION),
  status: z.literal("claiming"),
  planningWorkItem: TaskIdSchema,
  planId: z.string().regex(PLAN_ID_PATTERN),
  planHash: z.string().regex(SHA256_PATTERN),
  approvalFingerprint: z.string().regex(SHA256_PATTERN),
  selectedTaskId: TaskIdSchema,
  occurredAt: z.string().datetime(),
});

export type DexReadyLeafIntent = z.infer<typeof DexReadyLeafIntentSchema>;

export type DexReadyLeafApproval = z.infer<
  typeof DexReadyLeafApprovalSchema
>;
export type DexReadyLeafClaimArgs = z.infer<
  typeof DexReadyLeafClaimArgsSchema
>;
export type DexReadyLeafClaim = z.infer<typeof DexReadyLeafClaimSchema>;

function canonicalHandoffJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalHandoffJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) =>
        `${JSON.stringify(key)}:${canonicalHandoffJson(entry)}`
      ).join(",");
    return `{${entries}}`;
  }
  return JSON.stringify(value);
}

/** Fingerprint every compact Planning authorization field except the digest. */
export async function createDexReadyLeafApprovalFingerprint(
  approval: Omit<
    DexReadyLeafApproval,
    "approvalFingerprint" | "authorizationSignature"
  >,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalHandoffJson(approval)),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** HMAC proof that the repository authorizer emitted this persisted approval. */
export async function createDexReadyLeafAuthorizationSignature(
  approval: Omit<DexReadyLeafApproval, "authorizationSignature">,
  authorizationKey: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authorizationKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalHandoffJson(approval)),
  );
  return [...new Uint8Array(signature)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

const DexListTaskSchema = z.object({
  id: TaskIdSchema,
  parent_id: TaskIdSchema.nullable(),
  priority: z.number().int().min(0).max(100),
  completed: z.boolean(),
  started_at: z.string().datetime().nullable(),
  blockedBy: z.array(z.union([TaskIdSchema, z.object({ id: TaskIdSchema })]))
    .max(MAX_DEX_TASKS)
    .transform((relations) =>
      relations.map((relation) =>
        typeof relation === "string" ? relation : relation.id
      )
    ),
});
const DexListSchema = z.array(DexListTaskSchema).max(MAX_DEX_TASKS);
type DexListTask = z.infer<typeof DexListTaskSchema>;

export type DexReadyLeafHandoffMethodContext = {
  repoDir: string;
  globalArgs: {
    deliveryHandoffAuthorizationKey?: string;
  };
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

export interface DexReadyLeafCommandAdapter {
  listAll(cwd: string): Promise<unknown>;
  read(cwd: string, taskId: string): Promise<unknown>;
  start(cwd: string, taskId: string): Promise<void>;
}

export type DexReadyLeafHandoffDependencies = {
  commandAdapter: DexReadyLeafCommandAdapter;
  repositoryLock: DexRepositoryLock;
  now: () => string;
};

function parseDexList(value: unknown): DexListTask[] {
  const tasks = DexListSchema.parse(value);
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error("Dex list contains duplicate task ids");
  }
  return tasks;
}

function findReadyLeaves(tasks: DexListTask[]): DexListTask[] {
  const openTasks = tasks.filter((task) => !task.completed);
  const openIds = new Set(openTasks.map((task) => task.id));
  const parentsWithOpenChildren = new Set(
    openTasks.flatMap((task) =>
      task.parent_id === null ? [] : [task.parent_id]
    ),
  );
  return openTasks.filter((task) =>
    task.started_at === null &&
    !parentsWithOpenChildren.has(task.id) &&
    !task.blockedBy.some((blockerId) => openIds.has(blockerId))
  );
}

function isInsideBoundary(
  taskId: string,
  boundaryTaskId: string,
  tasksById: Map<string, DexListTask>,
): boolean {
  let currentId: string | null = taskId;
  const visited = new Set<string>();
  while (currentId !== null) {
    if (currentId === boundaryTaskId) return taskId !== boundaryTaskId;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    currentId = tasksById.get(currentId)?.parent_id ?? null;
  }
  return false;
}

function claimResult(
  args: DexReadyLeafClaimArgs,
  values: Omit<
    DexReadyLeafClaim,
    | "schemaVersion"
    | "adapterVersion"
    | "planningWorkItem"
    | "planId"
    | "planHash"
    | "approvalFingerprint"
    | "activeFactoryWorkItems"
    | "occurredAt"
  >,
  occurredAt: string,
): DexReadyLeafClaim {
  return DexReadyLeafClaimSchema.parse({
    schemaVersion: 1,
    adapterVersion: DEX_READY_LEAF_HANDOFF_VERSION,
    planningWorkItem: args.approval.planningWorkItem,
    planId: args.approval.planId,
    planHash: args.approval.planHash,
    approvalFingerprint: args.approval.approvalFingerprint,
    activeFactoryWorkItems: args.activeFactoryWorkItems,
    occurredAt,
    ...values,
  });
}

async function selectOrClaimReadyLeaf(
  args: DexReadyLeafClaimArgs,
  context: DexReadyLeafHandoffMethodContext,
  dependencies: DexReadyLeafHandoffDependencies,
  priorIntent: DexReadyLeafIntent | null,
): Promise<DexReadyLeafClaim> {
  const occurredAt = dependencies.now();
  const tasks = parseDexList(
    await dependencies.commandAdapter.listAll(context.repoDir),
  );
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const readyLeaves = findReadyLeaves(tasks).sort((left, right) =>
    left.priority - right.priority || left.id.localeCompare(right.id)
  );
  const readyTaskIds = readyLeaves.map((task) => task.id);
  const topPriority = readyLeaves[0]?.priority ?? null;
  const startedTasks = tasks.filter((task) =>
    !task.completed && task.started_at !== null
  );

  if (args.activeFactoryWorkItems.length > 1) {
    return claimResult(args, {
      status: "human-gate",
      reason: "multiple-active-factory-runs",
      selectedTaskId: null,
      approvedEpicTaskId: args.approval.approvedEpicTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  if (startedTasks.length > 1) {
    return claimResult(args, {
      status: "human-gate",
      reason: "multiple-started-tasks",
      selectedTaskId: null,
      approvedEpicTaskId: args.approval.approvedEpicTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  const activeFactoryWorkItem = args.activeFactoryWorkItems[0];
  if (activeFactoryWorkItem !== undefined) {
    const activeTask = tasksById.get(activeFactoryWorkItem);
    if (
      activeTask === undefined ||
      activeTask.completed ||
      (startedTasks.length === 1 &&
        startedTasks[0].id !== activeFactoryWorkItem)
    ) {
      return claimResult(args, {
        status: "human-gate",
        reason: "active-factory-task-invalid",
        selectedTaskId: null,
        approvedEpicTaskId: args.approval.approvedEpicTaskId,
        topPriority,
        readyTaskIds,
        trackerStarted: false,
      }, occurredAt);
    }
    let trackerStarted = false;
    if (activeTask.started_at === null) {
      await dependencies.commandAdapter.start(context.repoDir, activeTask.id);
      trackerStarted = true;
    }
    return claimResult(args, {
      status: "resumed",
      reason: "resumed-active-factory",
      selectedTaskId: activeTask.id,
      approvedEpicTaskId: args.approval.approvedEpicTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted,
    }, occurredAt);
  }

  if (startedTasks.length === 1) {
    const startedTask = startedTasks[0];
    const boundaryTaskId = args.approval.approvedEpicTaskId;
    const sameApprovedClaim = priorIntent !== null &&
      priorIntent.approvalFingerprint === args.approval.approvalFingerprint &&
      priorIntent.selectedTaskId === startedTask.id &&
      args.approval.status === "ready" &&
      args.approval.candidateTaskId === startedTask.id &&
      args.approval.approvedTaskIds.includes(startedTask.id) &&
      args.approval.auditedTaskIds.includes(startedTask.id) &&
      boundaryTaskId !== null &&
      isInsideBoundary(startedTask.id, boundaryTaskId, tasksById);
    return claimResult(args, {
      status: sameApprovedClaim ? "claimed" : "human-gate",
      reason: sameApprovedClaim
        ? "recovered-started-task"
        : "started-task-ownership-ambiguous",
      selectedTaskId: sameApprovedClaim ? startedTask.id : null,
      approvedEpicTaskId: boundaryTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  if (args.approval.status === "human-gate") {
    return claimResult(args, {
      status: "human-gate",
      reason: "planning-human-gate",
      selectedTaskId: null,
      approvedEpicTaskId: args.approval.approvedEpicTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }
  if (readyLeaves.length === 0) {
    return claimResult(args, {
      status: priorIntent === null ? "no-ready-work" : "human-gate",
      reason: priorIntent === null ? "no-ready-work" : "claim-intent-invalid",
      selectedTaskId: null,
      approvedEpicTaskId: args.approval.approvedEpicTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }
  if (args.approval.status === "no-ready-work") {
    return claimResult(args, {
      status: "human-gate",
      reason: "planning-no-ready-work-stale",
      selectedTaskId: null,
      approvedEpicTaskId: args.approval.approvedEpicTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  const boundaryTaskId = args.approval.approvedEpicTaskId;
  if (boundaryTaskId === null) {
    return claimResult(args, {
      status: "human-gate",
      reason: "approved-epic-boundary-missing",
      selectedTaskId: null,
      approvedEpicTaskId: null,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }
  if (!tasksById.has(boundaryTaskId)) {
    return claimResult(args, {
      status: "human-gate",
      reason: "approved-boundary-invalid",
      selectedTaskId: null,
      approvedEpicTaskId: boundaryTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  const topReadyLeaves = readyLeaves.filter((task) =>
    task.priority === topPriority
  );
  if (topReadyLeaves.length !== 1) {
    return claimResult(args, {
      status: "human-gate",
      reason: "global-runway-ambiguous",
      selectedTaskId: null,
      approvedEpicTaskId: boundaryTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  const selectedTask = topReadyLeaves[0];
  const approvedIds = new Set(args.approval.approvedTaskIds);
  const auditedIds = new Set(args.approval.auditedTaskIds);
  if (
    !approvedIds.has(selectedTask.id) ||
    !auditedIds.has(selectedTask.id) ||
    !isInsideBoundary(selectedTask.id, boundaryTaskId, tasksById)
  ) {
    return claimResult(args, {
      status: "human-gate",
      reason: "runway-outside-approved-plan",
      selectedTaskId: null,
      approvedEpicTaskId: boundaryTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }
  if (args.approval.candidateTaskId !== selectedTask.id) {
    return claimResult(args, {
      status: "human-gate",
      reason: "candidate-mismatch",
      selectedTaskId: null,
      approvedEpicTaskId: boundaryTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }

  if (
    priorIntent !== null &&
    priorIntent.selectedTaskId !== selectedTask.id
  ) {
    return claimResult(args, {
      status: "human-gate",
      reason: "claim-intent-invalid",
      selectedTaskId: null,
      approvedEpicTaskId: boundaryTaskId,
      topPriority,
      readyTaskIds,
      trackerStarted: false,
    }, occurredAt);
  }
  if (priorIntent === null) {
    const intent = DexReadyLeafIntentSchema.parse({
      schemaVersion: 1,
      adapterVersion: DEX_READY_LEAF_HANDOFF_VERSION,
      status: "claiming",
      planningWorkItem: args.approval.planningWorkItem,
      planId: args.approval.planId,
      planHash: args.approval.planHash,
      approvalFingerprint: args.approval.approvalFingerprint,
      selectedTaskId: selectedTask.id,
      occurredAt,
    });
    await context.writeResource(
      "ready-leaf-intent",
      await handoffResourceName("intent", args.approval),
      intent,
    );
  }
  await dependencies.commandAdapter.start(context.repoDir, selectedTask.id);
  const updated = DexListTaskSchema.parse(
    await dependencies.commandAdapter.read(context.repoDir, selectedTask.id),
  );
  if (
    updated.id !== selectedTask.id ||
    updated.completed ||
    updated.started_at === null
  ) {
    throw new Error("Dex did not preserve the claimed ready leaf");
  }
  return claimResult(args, {
    status: "claimed",
    reason: "claimed-ready-leaf",
    selectedTaskId: selectedTask.id,
    approvedEpicTaskId: boundaryTaskId,
    topPriority,
    readyTaskIds,
    trackerStarted: true,
  }, occurredAt);
}

async function handoffResourceName(
  kind: "intent" | "claim",
  approval: DexReadyLeafApproval,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    adapterVersion: DEX_READY_LEAF_HANDOFF_VERSION,
    planningWorkItem: approval.planningWorkItem,
    planId: approval.planId,
    planHash: approval.planHash,
    approvalFingerprint: approval.approvalFingerprint,
  }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `ready-leaf-${kind}-${hex}`;
}

function createDefaultCommandAdapter(): DexReadyLeafCommandAdapter {
  return {
    listAll: async (cwd) => {
      const result = await runBoundedDexProcess(
        cwd,
        ["list", "--all", "--json"],
        null,
      );
      if (result.code !== 0) throw new Error("Dex list failed");
      try {
        return JSON.parse(new TextDecoder().decode(result.stdout));
      } catch (error) {
        throw new Error("Dex list returned invalid JSON", { cause: error });
      }
    },
    read: async (cwd, taskId) => {
      const result = await runBoundedDexProcess(
        cwd,
        ["show", taskId, "--json"],
        null,
      );
      if (result.code !== 0) throw new Error("Dex show failed");
      try {
        return JSON.parse(new TextDecoder().decode(result.stdout));
      } catch (error) {
        throw new Error("Dex show returned invalid JSON", { cause: error });
      }
    },
    start: async (cwd, taskId) => {
      const result = await runBoundedDexProcess(cwd, ["start", taskId], null);
      if (result.code !== 0) throw new Error("Dex start failed");
    },
  };
}

const DEFAULT_DEPENDENCIES: DexReadyLeafHandoffDependencies = {
  commandAdapter: createDefaultCommandAdapter(),
  repositoryLock: DEFAULT_DEX_REPOSITORY_LOCK,
  now: () => new Date().toISOString(),
};

/** Atomically resume repository ownership or claim one approved ready leaf. */
export async function executeDexReadyLeafClaim(
  rawArgs: DexReadyLeafClaimArgs,
  context: DexReadyLeafHandoffMethodContext,
  dependencies: DexReadyLeafHandoffDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = DexReadyLeafClaimArgsSchema.parse(rawArgs);
  const authorizationKey = context.globalArgs.deliveryHandoffAuthorizationKey;
  if (authorizationKey === undefined) {
    throw new Error("Dex ready-leaf authorization is not configured");
  }
  if (!timingSafeHexEqual(authorizationKey, args.authorizationCapability)) {
    throw new Error("Dex ready-leaf authorization capability is invalid");
  }
  const { authorizationSignature, approvalFingerprint, ...approvalIdentity } =
    args.approval;
  if (
    await createDexReadyLeafApprovalFingerprint(approvalIdentity) !==
      approvalFingerprint
  ) {
    throw new Error("Dex ready-leaf approval fingerprint is invalid");
  }
  const expectedSignature = await createDexReadyLeafAuthorizationSignature(
    { ...approvalIdentity, approvalFingerprint },
    authorizationKey,
  );
  if (!timingSafeHexEqual(expectedSignature, authorizationSignature)) {
    throw new Error("Dex ready-leaf authorization signature is invalid");
  }
  let committed: { dataHandles: Array<{ name: string }> } | null = null;
  try {
    return await dependencies.repositoryLock.runExclusive(
      context.repoDir,
      async () => {
        const claimName = await handoffResourceName("claim", args.approval);
        const rawClaim = await context.readResource(claimName);
        const parsedClaim = DexReadyLeafClaimSchema.safeParse(rawClaim);
        if (rawClaim !== null && !parsedClaim.success) {
          throw new Error("Stored Dex ready-leaf claim is invalid");
        }
        if (
          parsedClaim.success &&
          parsedClaim.data.status === "claimed" &&
          parsedClaim.data.approvalFingerprint ===
            args.approval.approvalFingerprint
        ) {
          const replayHandle = await context.writeResource(
            "ready-leaf-claim",
            claimName,
            parsedClaim.data,
          );
          committed = { dataHandles: [replayHandle] };
          return committed;
        }
        const intentName = await handoffResourceName("intent", args.approval);
        const rawIntent = await context.readResource(intentName);
        const parsedIntent = DexReadyLeafIntentSchema.safeParse(rawIntent);
        if (rawIntent !== null && !parsedIntent.success) {
          throw new Error("Stored Dex ready-leaf intent is invalid");
        }
        const claim = await selectOrClaimReadyLeaf(
          args,
          context,
          dependencies,
          parsedIntent.success ? parsedIntent.data : null,
        );
        const handle = await context.writeResource(
          "ready-leaf-claim",
          claimName,
          claim,
        );
        committed = { dataHandles: [handle] };
        context.logger.info("Dex ready-leaf handoff reached {status}", {
          status: claim.status,
          reason: claim.reason,
        });
        return committed;
      },
    );
  } catch (error) {
    if (committed !== null) {
      context.logger.warning(
        "Dex repository lock cleanup failed after ready-leaf handoff commit",
      );
      return committed;
    }
    if (
      error instanceof DexRepositoryLockTimeoutError ||
      error instanceof DexRepositoryLockOwnershipError
    ) {
      throw new Error("Dex ready-leaf repository lock failed", {
        cause: error,
      });
    }
    throw error;
  }
}
