/**
 * Typed, checkpointed Dex plan application for a human-approved task graph.
 *
 * The adapter makes no planning decisions. It validates the complete graph,
 * applies it serially through Dex MCP, and only rolls forward after failures.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  type BoundedDexProcessResult,
  DexCommandBoundaryError,
  runBoundedDexProcess,
} from "./dex-bounded-process.ts";

import {
  DEFAULT_DEX_REPOSITORY_LOCK,
  type DexRepositoryLock,
  DexRepositoryLockOwnershipError,
  DexRepositoryLockTimeoutError,
} from "./dex-repository-lock.ts";

export const DEX_PLAN_APPLIER_VERSION = "2026.08.06.1";

const MAX_DEX_CONTENT_LENGTH = 50 * 1024;
const MAX_PLAN_NODES = 250;
const CLIENT_REF_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PLAN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TASK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const ClientRefSchema = z.string().min(1).max(64).regex(CLIENT_REF_PATTERN);
const PlanIdSchema = z.string().regex(PLAN_ID_PATTERN);
const TaskIdSchema = z.string().min(1).max(128).regex(TASK_ID_PATTERN);
const OwnerTokenSchema = z.string().min(1).max(256);
const DexTaskNameSchema = z.string().min(1).max(MAX_DEX_CONTENT_LENGTH);
const DexCreatedTaskDescriptionSchema = z.string().min(1).max(
  MAX_DEX_CONTENT_LENGTH,
);
const DexExistingTaskDescriptionSchema = z.string().max(MAX_DEX_CONTENT_LENGTH);
const DexPrioritySchema = z.number().int().min(0).max(100);
const IsoTimestampSchema = z.string().datetime();
const Sha256Schema = z.string().regex(SHA256_PATTERN);

const ParentTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("root") }),
  z.strictObject({ kind: z.literal("reference"), clientRef: ClientRefSchema }),
]);

const ExistingParentTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("preserve") }),
  z.strictObject({ kind: z.literal("root") }),
  z.strictObject({ kind: z.literal("reference"), clientRef: ClientRefSchema }),
]);

const ExistingTaskSelectorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("id"), taskId: TaskIdSchema }),
  z.strictObject({ kind: z.literal("exactName"), name: DexTaskNameSchema }),
]);

const ExpectedExistingTaskSchema = z.strictObject({
  name: DexTaskNameSchema,
  description: DexExistingTaskDescriptionSchema,
  priority: DexPrioritySchema,
});

const DexPlanEpicSchema = z.strictObject({
  clientRef: ClientRefSchema,
  name: DexTaskNameSchema,
  description: DexCreatedTaskDescriptionSchema,
  priority: DexPrioritySchema,
  blockedBy: z.array(ClientRefSchema).max(MAX_PLAN_NODES),
});

const DexPlanCreateTaskSchema = z.strictObject({
  kind: z.literal("create"),
  clientRef: ClientRefSchema,
  name: DexTaskNameSchema,
  description: DexCreatedTaskDescriptionSchema,
  priority: DexPrioritySchema,
  parent: ParentTargetSchema,
  blockedBy: z.array(ClientRefSchema).max(MAX_PLAN_NODES),
});

const DexPlanAttachExistingTaskSchema = z.strictObject({
  kind: z.literal("attachExisting"),
  clientRef: ClientRefSchema,
  selector: ExistingTaskSelectorSchema,
  expected: ExpectedExistingTaskSchema,
  parent: ExistingParentTargetSchema,
  addBlockedBy: z.array(ClientRefSchema).max(MAX_PLAN_NODES),
});

const DexPlanTaskSchema = z.discriminatedUnion("kind", [
  DexPlanCreateTaskSchema,
  DexPlanAttachExistingTaskSchema,
]);

/** Complete task graph emitted by the separate, human-gated planning Factory. */
export const DexApprovedPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    planId: PlanIdSchema,
    epic: DexPlanEpicSchema.optional(),
    tasks: z.array(DexPlanTaskSchema).min(1).max(MAX_PLAN_NODES),
  })
  .refine(
    (plan) =>
      plan.tasks.length + (plan.epic === undefined ? 0 : 1) <= MAX_PLAN_NODES,
    `A plan may contain at most ${MAX_PLAN_NODES} nodes`,
  );

// Swamp includes evaluated global arguments in the object passed through method
// validation, so the outer method schema strips those known runtime extras. The
// approved plan itself remains strict at every graph boundary.
export const DexPlanApplyArgsSchema = z.object({ plan: DexApprovedPlanSchema });

export const DexPlanApplierGlobalArgsSchema = z.strictObject({
  ownerToken: OwnerTokenSchema,
});

export type DexApprovedPlan = z.infer<typeof DexApprovedPlanSchema>;
export type DexPlanApplyArgs = z.infer<typeof DexPlanApplyArgsSchema>;
export type DexPlanApplierGlobalArgs = z.infer<
  typeof DexPlanApplierGlobalArgsSchema
>;

const RawDexTaskSchema = z.object({
  id: TaskIdSchema,
  parent_id: TaskIdSchema.nullable(),
  name: z.string(),
  description: z.string(),
  priority: DexPrioritySchema,
  completed: z.boolean(),
  result: z.string().nullable(),
  metadata: z.unknown().nullable(),
  created_at: IsoTimestampSchema,
  updated_at: IsoTimestampSchema,
  started_at: IsoTimestampSchema.nullable(),
  completed_at: IsoTimestampSchema.nullable(),
  blockedBy: z.array(TaskIdSchema),
  blocks: z.array(TaskIdSchema),
  children: z.array(TaskIdSchema),
});

export type RawDexTask = z.infer<typeof RawDexTaskSchema>;

const DexPlanApplyErrorCodeSchema = z.enum([
  "duplicate-client-reference",
  "duplicate-blocker-reference",
  "missing-client-reference",
  "duplicate-existing-attachment",
  "self-blocker",
  "hierarchy-cycle",
  "blocker-cycle",
  "hierarchy-depth-exceeded",
  "existing-graph-invalid",
  "existing-task-not-found",
  "existing-task-ambiguous",
  "existing-task-drift",
  "idempotency-conflict",
  "dex-list-failed",
  "dex-create-failed",
  "dex-update-failed",
  "dex-response-invalid",
  "mcp-command-failed",
  "mcp-protocol-invalid",
  "mcp-json-invalid",
  "mcp-tool-failed",
  "recovery-unavailable",
  "recovery-ambiguous",
  "verification-failed",
  "resource-write-failed",
  "repository-layout-invalid",
  "repository-lock-acquisition-failed",
  "repository-lock-ownership-lost",
  "unexpected-failure",
]);

export type DexPlanApplyErrorCode = z.infer<typeof DexPlanApplyErrorCodeSchema>;

const RetryDispositionSchema = z.enum([
  "retry",
  "do-not-retry",
  "manual-review",
]);
export type DexPlanRetryDisposition = z.infer<typeof RetryDispositionSchema>;

const ApplyPhaseSchema = z.enum([
  "preflight",
  "detach-existing",
  "create-hierarchy",
  "attach-hierarchy",
  "add-blockers",
  "verify",
  "persist-result",
]);
const DexPlanOperationSchema = z.strictObject({
  operationKey: Sha256Schema,
  clientRef: ClientRefSchema,
  phase: z.enum(["detach", "hierarchy", "blockers"]),
  status: z.enum(["pending", "succeeded", "preserved"]),
  dexTaskId: TaskIdSchema.nullable(),
});

/** Durable roll-forward state, overwritten as a new resource version per checkpoint. */
export const DexPlanApplyCheckpointSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapterVersion: z.literal(DEX_PLAN_APPLIER_VERSION),
  planId: PlanIdSchema,
  planHash: Sha256Schema,
  idempotencyKey: Sha256Schema,
  ownerToken: OwnerTokenSchema,
  attempt: z.number().int().positive(),
  status: z.enum(["applying", "succeeded", "failed"]),
  phase: ApplyPhaseSchema,
  retryDisposition: RetryDispositionSchema.nullable(),
  errorCode: DexPlanApplyErrorCodeSchema.nullable(),
  failedClientRef: ClientRefSchema.nullable(),
  startedAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  baselineTaskIds: z.array(TaskIdSchema),
  taskIdsByClientRef: z.record(ClientRefSchema, TaskIdSchema),
  operations: z.array(DexPlanOperationSchema),
});

type DexPlanApplyCheckpoint = z.infer<typeof DexPlanApplyCheckpointSchema>;

const DexPlanApplyReceiptBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapterVersion: z.literal(DEX_PLAN_APPLIER_VERSION),
  planId: PlanIdSchema,
  planHash: Sha256Schema,
  idempotencyKey: Sha256Schema,
  ownerToken: OwnerTokenSchema,
  attempt: z.number().int().positive(),
  occurredAt: IsoTimestampSchema,
  checkpointName: z.string().min(1),
  taskIdsByClientRef: z.record(ClientRefSchema, TaskIdSchema),
});

/** One versioned terminal outcome for each apply attempt. */
export const DexPlanApplyReceiptSchema = z.discriminatedUnion("status", [
  DexPlanApplyReceiptBaseSchema.extend({
    status: z.literal("succeeded"),
    retryDisposition: z.null(),
    errorCode: z.null(),
    failedClientRef: z.null(),
    resultName: z.string().min(1),
  }),
  DexPlanApplyReceiptBaseSchema.extend({
    status: z.literal("failed"),
    retryDisposition: RetryDispositionSchema,
    errorCode: DexPlanApplyErrorCodeSchema,
    failedClientRef: ClientRefSchema.nullable(),
    resultName: z.null(),
  }),
]);

const DexPlanMappingEntrySchema = z.strictObject({
  clientRef: ClientRefSchema,
  dexTaskId: TaskIdSchema,
  disposition: z.enum(["created", "attachedExisting"]),
});

/** Stable terminal mapping consumed by later planning Factory stages. */
export const DexPlanApplyResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  adapterVersion: z.literal(DEX_PLAN_APPLIER_VERSION),
  planId: PlanIdSchema,
  planHash: Sha256Schema,
  idempotencyKey: Sha256Schema,
  ownerToken: OwnerTokenSchema,
  status: z.literal("succeeded"),
  appliedAt: IsoTimestampSchema,
  taskIdsByClientRef: z.record(ClientRefSchema, TaskIdSchema),
  mappings: z.array(DexPlanMappingEntrySchema),
});

type DexPlanApplyResult = z.infer<typeof DexPlanApplyResultSchema>;

export type DexMcpCreateTaskArguments = {
  name: string;
  description: string;
  priority: number;
  parent_id?: string;
};

export type DexMcpUpdateTaskArguments = {
  id: string;
  parent_id?: string | null;
  add_blocked_by?: string[];
};

/** Injected in tests so fixtures never mutate the repository's real Dex graph. */
export interface DexPlanCommandAdapter {
  listTasks(cwd: string): Promise<RawDexTask[]>;
  createTask(cwd: string, args: DexMcpCreateTaskArguments): Promise<RawDexTask>;
  updateTask(cwd: string, args: DexMcpUpdateTaskArguments): Promise<RawDexTask>;
}

export type DexPlanApplierMethodContext = {
  repoDir: string;
  globalArgs: DexPlanApplierGlobalArgs;
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

export type DexPlanApplierExecutionResult = {
  dataHandles: Array<{ name: string }>;
};

export type DexPlanApplierDependencies = {
  commandAdapter: DexPlanCommandAdapter;
  verifyRepository: (repoDir: string) => Promise<void>;
  repositoryLock: DexRepositoryLock;
  now: () => string;
};

/** Stable coded failure persisted in receipts without command diagnostics. */
export class DexPlanApplierError extends Error {
  readonly errorCode: DexPlanApplyErrorCode;
  readonly retryDisposition: DexPlanRetryDisposition;
  readonly failedClientRef: string | null;

  constructor(
    errorCode: DexPlanApplyErrorCode,
    message: string,
    retryDisposition: DexPlanRetryDisposition,
    failedClientRef: string | null = null,
  ) {
    super(message);
    this.name = "DexPlanApplierError";
    this.errorCode = errorCode;
    this.retryDisposition = retryDisposition;
    this.failedClientRef = failedClientRef;
  }
}

type CreatePlanNode = {
  kind: "create";
  clientRef: string;
  name: string;
  description: string;
  priority: number;
  parent: z.infer<typeof ParentTargetSchema>;
  blockedBy: string[];
  disposition: "created";
};

type ExistingPlanNode = {
  kind: "attachExisting";
  clientRef: string;
  selector: z.infer<typeof ExistingTaskSelectorSchema>;
  expected: z.infer<typeof ExpectedExistingTaskSchema>;
  parent: z.infer<typeof ExistingParentTargetSchema>;
  blockedBy: string[];
  disposition: "attachedExisting";
};

type PlanNode = CreatePlanNode | ExistingPlanNode;

type PreflightState = {
  nodes: PlanNode[];
  resolvedIdsByRef: Map<string, string>;
  createOrder: CreatePlanNode[];
};

const invocationTails = new Map<string, Promise<void>>();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function planError(
  errorCode: DexPlanApplyErrorCode,
  message: string,
  retryDisposition: DexPlanRetryDisposition = "do-not-retry",
  failedClientRef: string | null = null,
  cause?: unknown,
): DexPlanApplierError {
  // Raw causes may contain subprocess diagnostics or consumer filesystem paths.
  // The coded public error is the entire cross-boundary diagnostic contract.
  void cause;
  return new DexPlanApplierError(
    errorCode,
    message,
    retryDisposition,
    failedClientRef,
  );
}

function normalizePlanError(error: unknown): DexPlanApplierError {
  if (error instanceof DexPlanApplierError) return error;
  return planError(
    "unexpected-failure",
    "Unexpected Dex plan application failure",
    "retry",
    null,
    error,
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonicalize(object[key])]),
  );
}

function normalizedPlanForHash(plan: DexApprovedPlan): Record<string, unknown> {
  const epic = plan.epic === undefined
    ? undefined
    : { ...plan.epic, blockedBy: [...plan.epic.blockedBy].sort() };
  const tasks = [...plan.tasks]
    .sort((left, right) => left.clientRef.localeCompare(right.clientRef))
    .map((task) =>
      task.kind === "create"
        ? { ...task, blockedBy: [...task.blockedBy].sort() }
        : { ...task, addBlockedBy: [...task.addBlockedBy].sort() }
    );
  return {
    schemaVersion: plan.schemaVersion,
    planId: plan.planId,
    epic,
    tasks,
  };
}

async function createPlanIdentity(
  plan: DexApprovedPlan,
  ownerToken: string,
): Promise<{
  planHash: string;
  idempotencyKey: string;
  checkpointName: string;
  receiptName: string;
  resultName: string;
}> {
  const planHash = await sha256Hex(
    JSON.stringify(
      canonicalize({ ownerToken, plan: normalizedPlanForHash(plan) }),
    ),
  );
  const idempotencyKey = await sha256Hex(
    `dex-plan-applier\0v1\0${plan.planId}`,
  );
  return {
    planHash,
    idempotencyKey,
    checkpointName: `apply-plan-checkpoint-${idempotencyKey}`,
    receiptName: `apply-plan-receipt-${idempotencyKey}`,
    resultName: `apply-plan-result-${idempotencyKey}`,
  };
}

function planNodes(plan: DexApprovedPlan): PlanNode[] {
  const epic: CreatePlanNode[] = plan.epic === undefined ? [] : [
    {
      kind: "create",
      clientRef: plan.epic.clientRef,
      name: plan.epic.name,
      description: plan.epic.description,
      priority: plan.epic.priority,
      parent: { kind: "root" },
      blockedBy: plan.epic.blockedBy,
      disposition: "created",
    },
  ];
  return [
    ...epic,
    ...plan.tasks.map((task): PlanNode =>
      task.kind === "create" ? { ...task, disposition: "created" } : {
        ...task,
        blockedBy: task.addBlockedBy,
        disposition: "attachedExisting",
      }
    ),
  ];
}

function requireUniqueReferences(nodes: PlanNode[]): Map<string, PlanNode> {
  const nodesByRef = new Map<string, PlanNode>();
  for (const node of nodes) {
    if (nodesByRef.has(node.clientRef)) {
      throw planError(
        "duplicate-client-reference",
        `Client reference ${node.clientRef} appears more than once`,
      );
    }
    nodesByRef.set(node.clientRef, node);
  }
  return nodesByRef;
}

function requireReferences(
  nodes: PlanNode[],
  nodesByRef: Map<string, PlanNode>,
): void {
  for (const node of nodes) {
    const parentRef = node.parent.kind === "reference"
      ? node.parent.clientRef
      : null;
    if (parentRef !== null && !nodesByRef.has(parentRef)) {
      throw planError(
        "missing-client-reference",
        `Parent reference ${parentRef} does not exist`,
        "do-not-retry",
        node.clientRef,
      );
    }
    const seenBlockers = new Set<string>();
    for (const blockerRef of node.blockedBy) {
      if (!nodesByRef.has(blockerRef)) {
        throw planError(
          "missing-client-reference",
          `Blocker reference ${blockerRef} does not exist`,
          "do-not-retry",
          node.clientRef,
        );
      }
      if (blockerRef === node.clientRef) {
        throw planError(
          "self-blocker",
          `Task ${node.clientRef} cannot block itself`,
          "do-not-retry",
          node.clientRef,
        );
      }
      if (seenBlockers.has(blockerRef)) {
        throw planError(
          "duplicate-blocker-reference",
          `Blocker ${blockerRef} is repeated for ${node.clientRef}`,
          "do-not-retry",
          node.clientRef,
        );
      }
      seenBlockers.add(blockerRef);
    }
  }
}

function graphIntegrityError(
  message: string,
  retryDisposition: DexPlanRetryDisposition,
): DexPlanApplierError {
  return planError("existing-graph-invalid", message, retryDisposition);
}

function requireUniqueRelations(
  taskId: string,
  relationName: "children" | "blockedBy" | "blocks",
  relations: string[],
  retryDisposition: DexPlanRetryDisposition,
): void {
  if (new Set(relations).size !== relations.length) {
    throw graphIntegrityError(
      `Dex task ${taskId} has duplicate ${relationName} references`,
      retryDisposition,
    );
  }
}

function validateDexGraphIntegrity(
  tasks: RawDexTask[],
  retryDisposition: DexPlanRetryDisposition,
): void {
  const tasksById = new Map<string, RawDexTask>();
  for (const task of tasks) {
    if (tasksById.has(task.id)) {
      throw graphIntegrityError(
        `Dex task id ${task.id} is duplicated`,
        retryDisposition,
      );
    }
    tasksById.set(task.id, task);
  }
  for (const task of tasks) {
    requireUniqueRelations(
      task.id,
      "children",
      task.children,
      retryDisposition,
    );
    requireUniqueRelations(
      task.id,
      "blockedBy",
      task.blockedBy,
      retryDisposition,
    );
    requireUniqueRelations(task.id, "blocks", task.blocks, retryDisposition);
    if (task.parent_id !== null) {
      const parent = tasksById.get(task.parent_id);
      if (parent === undefined || !parent.children.includes(task.id)) {
        throw graphIntegrityError(
          `Dex task ${task.id} parent relationship is not bidirectional`,
          retryDisposition,
        );
      }
    }
    for (const childId of task.children) {
      const child = tasksById.get(childId);
      if (child === undefined || child.parent_id !== task.id) {
        throw graphIntegrityError(
          `Dex task ${task.id} child relationship is not bidirectional`,
          retryDisposition,
        );
      }
    }
    for (const blockerId of task.blockedBy) {
      const blocker = tasksById.get(blockerId);
      if (blocker === undefined || !blocker.blocks.includes(task.id)) {
        throw graphIntegrityError(
          `Dex task ${task.id} blocker relationship is not bidirectional`,
          retryDisposition,
        );
      }
    }
    for (const blockedId of task.blocks) {
      const blocked = tasksById.get(blockedId);
      if (blocked === undefined || !blocked.blockedBy.includes(task.id)) {
        throw graphIntegrityError(
          `Dex task ${task.id} blocks relationship is not bidirectional`,
          retryDisposition,
        );
      }
    }
  }
}

function requireApprovedExistingContent(
  task: RawDexTask,
  node: ExistingPlanNode,
): void {
  if (
    task.name !== node.expected.name ||
    task.description !== node.expected.description ||
    task.priority !== node.expected.priority
  ) {
    throw planError(
      "existing-task-drift",
      `Existing task ${task.id} no longer matches approved content`,
      "do-not-retry",
      node.clientRef,
    );
  }
}

function requireApprovedCreatedContent(
  task: RawDexTask,
  node: CreatePlanNode,
): void {
  if (
    task.name !== node.name ||
    task.description !== node.description ||
    task.priority !== node.priority
  ) {
    throw planError(
      "existing-task-drift",
      `Mapped created task ${task.id} no longer matches approved content`,
      "do-not-retry",
      node.clientRef,
    );
  }
}

function resolveExistingTasks(
  nodes: PlanNode[],
  currentTasks: RawDexTask[],
  priorMapping: Record<string, string>,
): Map<string, string> {
  const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
  const idsByRef = new Map<string, string>();
  const claimedIds = new Set<string>();
  for (const node of nodes) {
    const priorTaskId = priorMapping[node.clientRef];
    if (priorTaskId !== undefined) {
      const priorTask = tasksById.get(priorTaskId);
      if (priorTask === undefined) {
        throw planError(
          "existing-task-not-found",
          `Checkpoint task ${priorTaskId} for ${node.clientRef} was not found`,
          "do-not-retry",
          node.clientRef,
        );
      }
      if (node.kind === "create") {
        requireApprovedCreatedContent(priorTask, node);
      } else {
        requireApprovedExistingContent(priorTask, node);
      }
      if (claimedIds.has(priorTaskId)) {
        throw planError(
          "duplicate-existing-attachment",
          `Checkpoint task ${priorTaskId} is mapped more than once`,
          "do-not-retry",
          node.clientRef,
        );
      }
      claimedIds.add(priorTaskId);
      idsByRef.set(node.clientRef, priorTaskId);
      continue;
    }
    if (node.kind !== "attachExisting") continue;
    const selector = node.selector;
    const matches = selector.kind === "id"
      ? currentTasks.filter((task) => task.id === selector.taskId)
      : currentTasks.filter((task) => task.name === selector.name);
    if (matches.length === 0) {
      throw planError(
        "existing-task-not-found",
        `Existing task for ${node.clientRef} was not found`,
        "do-not-retry",
        node.clientRef,
      );
    }
    if (matches.length > 1) {
      throw planError(
        "existing-task-ambiguous",
        `Existing task selector for ${node.clientRef} matched more than once`,
        "do-not-retry",
        node.clientRef,
      );
    }
    const task = matches[0];
    requireApprovedExistingContent(task, node);
    if (claimedIds.has(task.id)) {
      throw planError(
        "duplicate-existing-attachment",
        `Existing task ${task.id} is attached more than once`,
        "do-not-retry",
        node.clientRef,
      );
    }
    claimedIds.add(task.id);
    idsByRef.set(node.clientRef, task.id);
  }
  return idsByRef;
}

function validateMappedCreatedTasks(
  nodes: PlanNode[],
  currentTasks: RawDexTask[],
  priorMapping: Record<string, string>,
  resolvedIdsByRef: Map<string, string>,
): void {
  const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
  for (const node of nodes) {
    if (node.kind !== "create" || priorMapping[node.clientRef] === undefined) {
      continue;
    }
    const task = tasksById.get(priorMapping[node.clientRef]);
    if (task === undefined) continue;
    const approvedParentId = node.parent.kind === "root"
      ? null
      : resolvedIdsByRef.get(node.parent.clientRef);
    if (approvedParentId === undefined || task.parent_id !== approvedParentId) {
      throw planError(
        "existing-task-drift",
        `Mapped created task ${task.id} no longer has its approved parent`,
        "do-not-retry",
        node.clientRef,
      );
    }
    const approvedBlockerIds = new Set(
      node.blockedBy
        .map((clientRef) => resolvedIdsByRef.get(clientRef))
        .filter((taskId): taskId is string => taskId !== undefined),
    );
    if (task.blockedBy.some((taskId) => !approvedBlockerIds.has(taskId))) {
      throw planError(
        "existing-task-drift",
        `Mapped created task ${task.id} has an unapproved blocker`,
        "do-not-retry",
        node.clientRef,
      );
    }
  }
}

function syntheticId(clientRef: string): string {
  return `planned:${clientRef}`;
}

function graphIdForRef(
  clientRef: string,
  resolvedIdsByRef: Map<string, string>,
): string {
  return resolvedIdsByRef.get(clientRef) ?? syntheticId(clientRef);
}

function validateHierarchy(
  nodes: PlanNode[],
  currentTasks: RawDexTask[],
  resolvedIdsByRef: Map<string, string>,
): void {
  const parentById = new Map(
    currentTasks.map((task) => [task.id, task.parent_id]),
  );
  const affected = new Set<string>();
  for (const node of nodes) {
    const id = graphIdForRef(node.clientRef, resolvedIdsByRef);
    affected.add(id);
    if (node.parent.kind === "preserve") continue;
    parentById.set(
      id,
      node.parent.kind === "root"
        ? null
        : graphIdForRef(node.parent.clientRef, resolvedIdsByRef),
    );
  }

  const childrenById = new Map<string, string[]>();
  for (const [id, parentId] of parentById) {
    if (parentId === null) continue;
    childrenById.set(parentId, [...(childrenById.get(parentId) ?? []), id]);
  }
  const pending = [...affected];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined) continue;
    for (const child of childrenById.get(id) ?? []) {
      if (!affected.has(child)) {
        affected.add(child);
        pending.push(child);
      }
    }
  }

  for (const startId of affected) {
    const seen = new Set<string>();
    let id: string | null = startId;
    let depth = 0;
    while (id !== null) {
      if (seen.has(id)) {
        throw planError(
          "hierarchy-cycle",
          `Hierarchy cycle reaches ${startId}`,
        );
      }
      seen.add(id);
      const parentId: string | null = parentById.get(id) ?? null;
      if (parentId !== null) depth += 1;
      id = parentId;
    }
    if (depth > 2) {
      throw planError(
        "hierarchy-depth-exceeded",
        `Hierarchy depth ${depth} exceeds Dex's three-level limit`,
      );
    }
  }
}

function validateBlockers(
  nodes: PlanNode[],
  currentTasks: RawDexTask[],
  resolvedIdsByRef: Map<string, string>,
): void {
  const blockersById = new Map(
    currentTasks.map((task) => [task.id, [...task.blockedBy]]),
  );
  const affected: string[] = [];
  for (const node of nodes) {
    const id = graphIdForRef(node.clientRef, resolvedIdsByRef);
    affected.push(id);
    const additions = node.blockedBy.map((ref) =>
      graphIdForRef(ref, resolvedIdsByRef)
    );
    blockersById.set(
      id,
      node.kind === "create"
        ? additions
        : [...new Set([...(blockersById.get(id) ?? []), ...additions])],
    );
  }

  for (const startId of affected) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) {
        throw planError("blocker-cycle", `Blocker cycle reaches ${startId}`);
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const blocker of blockersById.get(id) ?? []) visit(blocker);
      visiting.delete(id);
      visited.add(id);
    };
    visit(startId);
  }
}

function createOrder(
  nodes: PlanNode[],
  nodesByRef: Map<string, PlanNode>,
): CreatePlanNode[] {
  const creates = nodes.filter((node): node is CreatePlanNode =>
    node.kind === "create"
  );
  const indegree = new Map(creates.map((node) => [node.clientRef, 0]));
  const children = new Map<string, string[]>();
  for (const node of creates) {
    if (node.parent.kind !== "reference") continue;
    const parent = nodesByRef.get(node.parent.clientRef);
    if (parent?.kind !== "create") continue;
    indegree.set(node.clientRef, (indegree.get(node.clientRef) ?? 0) + 1);
    children.set(parent.clientRef, [
      ...(children.get(parent.clientRef) ?? []),
      node.clientRef,
    ]);
  }
  const ready = creates
    .filter((node) => indegree.get(node.clientRef) === 0)
    .map((node) => node.clientRef)
    .sort();
  const ordered: CreatePlanNode[] = [];
  while (ready.length > 0) {
    const ref = ready.shift();
    if (ref === undefined) continue;
    const node = nodesByRef.get(ref);
    if (node?.kind === "create") ordered.push(node);
    for (const child of (children.get(ref) ?? []).sort()) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  if (ordered.length !== creates.length) {
    throw planError(
      "hierarchy-cycle",
      "Planned create hierarchy contains a cycle",
    );
  }
  return ordered;
}

function preflightPlan(
  plan: DexApprovedPlan,
  currentTasks: RawDexTask[],
  priorMapping: Record<string, string>,
): PreflightState {
  const nodes = planNodes(plan);
  const nodesByRef = requireUniqueReferences(nodes);
  requireReferences(nodes, nodesByRef);
  validateDexGraphIntegrity(currentTasks, "do-not-retry");
  const resolvedIdsByRef = resolveExistingTasks(
    nodes,
    currentTasks,
    priorMapping,
  );
  validateMappedCreatedTasks(
    nodes,
    currentTasks,
    priorMapping,
    resolvedIdsByRef,
  );
  validateHierarchy(nodes, currentTasks, resolvedIdsByRef);
  validateBlockers(nodes, currentTasks, resolvedIdsByRef);
  return {
    nodes,
    resolvedIdsByRef,
    createOrder: createOrder(nodes, nodesByRef),
  };
}

function operationKey(
  idempotencyKey: string,
  clientRef: string,
  phase: "detach" | "hierarchy" | "blockers",
): Promise<string> {
  return sha256Hex(`${idempotencyKey}\0${clientRef}\0${phase}`);
}

async function initialOperations(
  nodes: PlanNode[],
  idempotencyKey: string,
): Promise<z.infer<typeof DexPlanOperationSchema>[]> {
  const operations: z.infer<typeof DexPlanOperationSchema>[] = [];
  for (
    const node of [...nodes].sort((left, right) =>
      left.clientRef.localeCompare(right.clientRef)
    )
  ) {
    if (node.kind === "attachExisting") {
      operations.push({
        operationKey: await operationKey(
          idempotencyKey,
          node.clientRef,
          "detach",
        ),
        clientRef: node.clientRef,
        phase: "detach",
        status: node.parent.kind === "preserve" ? "preserved" : "pending",
        dexTaskId: null,
      });
    }
    operations.push({
      operationKey: await operationKey(
        idempotencyKey,
        node.clientRef,
        "hierarchy",
      ),
      clientRef: node.clientRef,
      phase: "hierarchy",
      status: node.kind === "attachExisting" && node.parent.kind === "preserve"
        ? "preserved"
        : "pending",
      dexTaskId: null,
    });
    operations.push({
      operationKey: await operationKey(
        idempotencyKey,
        node.clientRef,
        "blockers",
      ),
      clientRef: node.clientRef,
      phase: "blockers",
      status: node.blockedBy.length === 0 ? "preserved" : "pending",
      dexTaskId: null,
    });
  }
  return operations;
}

function sortedMapping(
  mapping: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(mapping).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
}

function checkpointOperation(
  checkpoint: DexPlanApplyCheckpoint,
  clientRef: string,
  phase: "detach" | "hierarchy" | "blockers",
  status: "succeeded" | "preserved",
  dexTaskId: string,
): void {
  const operation = checkpoint.operations.find(
    (candidate) =>
      candidate.clientRef === clientRef && candidate.phase === phase,
  );
  if (operation === undefined) {
    throw planError(
      "unexpected-failure",
      `Missing checkpoint operation ${clientRef}/${phase}`,
      "retry",
    );
  }
  operation.status = status;
  operation.dexTaskId = dexTaskId;
}

async function writeCheckpoint(
  context: DexPlanApplierMethodContext,
  name: string,
  checkpoint: DexPlanApplyCheckpoint,
): Promise<{ name: string }> {
  try {
    return await context.writeResource(
      "checkpoint",
      name,
      DexPlanApplyCheckpointSchema.parse(checkpoint),
    );
  } catch (error) {
    throw planError(
      "resource-write-failed",
      "Could not persist Dex plan checkpoint",
      "retry",
      null,
      error,
    );
  }
}

function desiredParentId(
  node: PlanNode,
  mapping: Record<string, string>,
  currentTask: RawDexTask | undefined,
): string | null {
  if (node.kind === "attachExisting" && node.parent.kind === "preserve") {
    return currentTask?.parent_id ?? null;
  }
  if (node.parent.kind === "root") return null;
  if (node.parent.kind !== "reference") {
    throw planError(
      "unexpected-failure",
      "Unsupported parent directive",
      "retry",
    );
  }
  const parentId = mapping[node.parent.clientRef];
  if (parentId === undefined) {
    throw planError(
      "missing-client-reference",
      `Parent ${node.parent.clientRef} has no Dex mapping`,
      "retry",
      node.clientRef,
    );
  }
  return parentId;
}

function matchesCreateTask(
  task: RawDexTask,
  node: CreatePlanNode,
  parentId: string | null,
): boolean {
  return (
    task.name === node.name &&
    task.description === node.description &&
    task.priority === node.priority &&
    task.parent_id === parentId
  );
}

function requireCreateTask(
  task: RawDexTask,
  node: CreatePlanNode,
  parentId: string | null,
): RawDexTask {
  if (!matchesCreateTask(task, node, parentId)) {
    throw planError(
      "verification-failed",
      `Created task ${task.id} does not match ${node.clientRef}`,
      "manual-review",
      node.clientRef,
    );
  }
  return task;
}

async function recoverCreatedTask(
  adapter: DexPlanCommandAdapter,
  context: DexPlanApplierMethodContext,
  node: CreatePlanNode,
  parentId: string | null,
  baselineTaskIds: Set<string>,
  mappedTaskIds: Set<string>,
): Promise<RawDexTask | null> {
  let tasks: RawDexTask[];
  try {
    tasks = await adapter.listTasks(context.repoDir);
  } catch (error) {
    throw planError(
      "recovery-unavailable",
      `Could not inspect uncertain create for ${node.clientRef}`,
      "retry",
      node.clientRef,
      error,
    );
  }
  const candidates = tasks.filter(
    (task) =>
      !baselineTaskIds.has(task.id) &&
      !mappedTaskIds.has(task.id) &&
      matchesCreateTask(task, node, parentId),
  );
  if (candidates.length > 1) {
    throw planError(
      "recovery-ambiguous",
      `Uncertain create for ${node.clientRef} matched multiple tasks`,
      "manual-review",
      node.clientRef,
    );
  }
  return candidates[0] ?? null;
}

async function applyExistingDetachment(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
  checkpointName: string,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies,
): Promise<void> {
  checkpoint.phase = "detach-existing";
  for (
    const node of preflight.nodes
      .filter((candidate): candidate is ExistingPlanNode =>
        candidate.kind === "attachExisting"
      )
      .sort((left, right) => left.clientRef.localeCompare(right.clientRef))
  ) {
    const taskId = checkpoint.taskIdsByClientRef[node.clientRef];
    if (taskId === undefined) {
      throw planError(
        "unexpected-failure",
        `Missing attachment mapping ${node.clientRef}`,
        "retry",
      );
    }
    const currentTask =
      (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
        (candidate) => candidate.id === taskId,
      );
    if (currentTask === undefined) {
      throw planError(
        "existing-task-not-found",
        `Attached task ${taskId} disappeared before detachment`,
        "manual-review",
        node.clientRef,
      );
    }
    if (node.parent.kind === "preserve") {
      checkpointOperation(
        checkpoint,
        node.clientRef,
        "detach",
        "preserved",
        taskId,
      );
      continue;
    }
    const finalParentId = node.parent.kind === "root"
      ? null
      : checkpoint.taskIdsByClientRef[node.parent.clientRef];
    if (
      currentTask.parent_id === null ||
      (finalParentId !== undefined && currentTask.parent_id === finalParentId)
    ) {
      checkpointOperation(
        checkpoint,
        node.clientRef,
        "detach",
        "preserved",
        taskId,
      );
      continue;
    }
    let detached: RawDexTask;
    try {
      detached = await dependencies.commandAdapter.updateTask(context.repoDir, {
        id: taskId,
        parent_id: null,
      });
    } catch (error) {
      const refreshed =
        (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
          (candidate) => candidate.id === taskId,
        );
      if (refreshed?.parent_id !== null) {
        throw planError(
          "dex-update-failed",
          `Could not detach ${node.clientRef} before hierarchy creation`,
          "retry",
          node.clientRef,
          error,
        );
      }
      detached = refreshed;
    }
    if (detached.parent_id !== null) {
      throw planError(
        "verification-failed",
        `Detached task ${taskId} still has a parent`,
        "manual-review",
        node.clientRef,
      );
    }
    checkpointOperation(
      checkpoint,
      node.clientRef,
      "detach",
      "succeeded",
      taskId,
    );
    checkpoint.updatedAt = dependencies.now();
    await writeCheckpoint(context, checkpointName, checkpoint);
  }
}

async function applyCreateHierarchy(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
  checkpointName: string,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies,
): Promise<void> {
  checkpoint.phase = "create-hierarchy";
  const baselineTaskIds = new Set(checkpoint.baselineTaskIds);
  for (const node of preflight.createOrder) {
    const currentMapping = checkpoint.taskIdsByClientRef[node.clientRef];
    const parentId = desiredParentId(
      node,
      checkpoint.taskIdsByClientRef,
      undefined,
    );
    if (currentMapping !== undefined) {
      const existing =
        (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
          (task) => task.id === currentMapping,
        );
      if (existing === undefined) {
        throw planError(
          "verification-failed",
          `Mapped task ${currentMapping} disappeared`,
          "manual-review",
          node.clientRef,
        );
      }
      requireCreateTask(existing, node, parentId);
      checkpointOperation(
        checkpoint,
        node.clientRef,
        "hierarchy",
        "succeeded",
        existing.id,
      );
      continue;
    }

    const mappedIds = new Set(Object.values(checkpoint.taskIdsByClientRef));
    let task = await recoverCreatedTask(
      dependencies.commandAdapter,
      context,
      node,
      parentId,
      baselineTaskIds,
      mappedIds,
    );
    if (task === null) {
      try {
        task = await dependencies.commandAdapter.createTask(context.repoDir, {
          name: node.name,
          description: node.description,
          priority: node.priority,
          ...(parentId === null ? {} : { parent_id: parentId }),
        });
      } catch (error) {
        task = await recoverCreatedTask(
          dependencies.commandAdapter,
          context,
          node,
          parentId,
          baselineTaskIds,
          mappedIds,
        );
        if (task === null) {
          throw planError(
            "dex-create-failed",
            `Dex did not create ${node.clientRef}`,
            "retry",
            node.clientRef,
            error,
          );
        }
      }
    }
    requireCreateTask(task, node, parentId);
    checkpoint.taskIdsByClientRef[node.clientRef] = task.id;
    checkpoint.taskIdsByClientRef = sortedMapping(
      checkpoint.taskIdsByClientRef,
    );
    checkpointOperation(
      checkpoint,
      node.clientRef,
      "hierarchy",
      "succeeded",
      task.id,
    );
    checkpoint.updatedAt = dependencies.now();
    await writeCheckpoint(context, checkpointName, checkpoint);
  }
}

async function applyExistingHierarchy(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
  checkpointName: string,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies,
): Promise<void> {
  checkpoint.phase = "attach-hierarchy";
  for (
    const node of preflight.nodes
      .filter((candidate): candidate is ExistingPlanNode =>
        candidate.kind === "attachExisting"
      )
      .sort((left, right) => left.clientRef.localeCompare(right.clientRef))
  ) {
    const taskId = checkpoint.taskIdsByClientRef[node.clientRef];
    if (taskId === undefined) {
      throw planError(
        "unexpected-failure",
        `Missing attachment mapping ${node.clientRef}`,
        "retry",
      );
    }
    const currentTask =
      (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
        (candidate) => candidate.id === taskId,
      );
    if (currentTask === undefined) {
      throw planError(
        "existing-task-not-found",
        `Attached task ${taskId} disappeared`,
        "manual-review",
        node.clientRef,
      );
    }
    let task: RawDexTask = currentTask;
    if (node.parent.kind === "preserve") {
      checkpointOperation(
        checkpoint,
        node.clientRef,
        "hierarchy",
        "preserved",
        taskId,
      );
      continue;
    }
    const parentId = desiredParentId(node, checkpoint.taskIdsByClientRef, task);
    if (task.parent_id !== parentId) {
      try {
        task = await dependencies.commandAdapter.updateTask(context.repoDir, {
          id: taskId,
          parent_id: parentId,
        });
      } catch (error) {
        const refreshed =
          (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
            (candidate) => candidate.id === taskId,
          );
        if (refreshed?.parent_id !== parentId) {
          throw planError(
            "dex-update-failed",
            `Could not attach ${node.clientRef}`,
            "retry",
            node.clientRef,
            error,
          );
        }
        task = refreshed;
      }
    }
    if (task.parent_id !== parentId) {
      throw planError(
        "verification-failed",
        `Attached task ${taskId} has the wrong parent`,
        "manual-review",
        node.clientRef,
      );
    }
    checkpointOperation(
      checkpoint,
      node.clientRef,
      "hierarchy",
      "succeeded",
      taskId,
    );
    checkpoint.updatedAt = dependencies.now();
    await writeCheckpoint(context, checkpointName, checkpoint);
  }
}

async function applyBlockers(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
  checkpointName: string,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies,
): Promise<void> {
  checkpoint.phase = "add-blockers";
  for (
    const node of [...preflight.nodes].sort((left, right) =>
      left.clientRef.localeCompare(right.clientRef)
    )
  ) {
    const taskId = checkpoint.taskIdsByClientRef[node.clientRef];
    if (taskId === undefined) {
      throw planError(
        "unexpected-failure",
        `Missing task mapping ${node.clientRef}`,
        "retry",
      );
    }
    const currentTask =
      (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
        (candidate) => candidate.id === taskId,
      );
    if (currentTask === undefined) {
      throw planError(
        "verification-failed",
        `Task ${taskId} disappeared before blocker application`,
        "manual-review",
        node.clientRef,
      );
    }
    let task: RawDexTask = currentTask;
    const desiredBlockers = node.blockedBy.map((ref) => {
      const blockerId = checkpoint.taskIdsByClientRef[ref];
      if (blockerId === undefined) {
        throw planError(
          "missing-client-reference",
          `Blocker ${ref} has no Dex mapping`,
          "retry",
        );
      }
      return blockerId;
    });
    const missing = desiredBlockers.filter((blockerId) =>
      !task.blockedBy.includes(blockerId)
    );
    if (missing.length > 0) {
      try {
        task = await dependencies.commandAdapter.updateTask(context.repoDir, {
          id: taskId,
          add_blocked_by: missing,
        });
      } catch (error) {
        const refreshed =
          (await dependencies.commandAdapter.listTasks(context.repoDir)).find(
            (candidate) => candidate.id === taskId,
          );
        if (
          refreshed === undefined ||
          !desiredBlockers.every((blockerId) =>
            refreshed.blockedBy.includes(blockerId)
          )
        ) {
          throw planError(
            "dex-update-failed",
            `Could not add blockers for ${node.clientRef}`,
            "retry",
            node.clientRef,
            error,
          );
        }
        task = refreshed;
      }
    }
    if (
      !desiredBlockers.every((blockerId) => task.blockedBy.includes(blockerId))
    ) {
      throw planError(
        "verification-failed",
        `Task ${taskId} is missing approved blockers`,
        "manual-review",
        node.clientRef,
      );
    }
    checkpointOperation(
      checkpoint,
      node.clientRef,
      "blockers",
      desiredBlockers.length === 0 ? "preserved" : "succeeded",
      taskId,
    );
    checkpoint.updatedAt = dependencies.now();
    await writeCheckpoint(context, checkpointName, checkpoint);
  }
}

function requireExpectedExisting(
  task: RawDexTask,
  node: ExistingPlanNode,
): void {
  if (
    task.name !== node.expected.name ||
    task.description !== node.expected.description ||
    task.priority !== node.expected.priority
  ) {
    throw planError(
      "verification-failed",
      `Attached task ${task.id} changed during application`,
      "manual-review",
      node.clientRef,
    );
  }
}

async function verifyFinalGraph(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
  context: DexPlanApplierMethodContext,
  adapter: DexPlanCommandAdapter,
): Promise<void> {
  checkpoint.phase = "verify";
  let tasks: RawDexTask[];
  try {
    tasks = await adapter.listTasks(context.repoDir);
  } catch (error) {
    throw planError(
      "dex-list-failed",
      "Could not verify final Dex graph",
      "retry",
      null,
      error,
    );
  }
  validateDexGraphIntegrity(tasks, "manual-review");
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  for (const node of preflight.nodes) {
    const taskId = checkpoint.taskIdsByClientRef[node.clientRef];
    const task = taskId === undefined ? undefined : tasksById.get(taskId);
    if (task === undefined) {
      throw planError(
        "verification-failed",
        `Mapped task for ${node.clientRef} is missing`,
        "manual-review",
        node.clientRef,
      );
    }
    const parentId = desiredParentId(node, checkpoint.taskIdsByClientRef, task);
    if (node.kind === "create") {
      requireCreateTask(task, node, parentId);
    } else {
      requireExpectedExisting(task, node);
      if (node.parent.kind !== "preserve" && task.parent_id !== parentId) {
        throw planError(
          "verification-failed",
          `Attached task ${task.id} has the wrong parent`,
          "manual-review",
          node.clientRef,
        );
      }
    }
    const desiredBlockers = node.blockedBy.map((ref) =>
      checkpoint.taskIdsByClientRef[ref]
    );
    if (desiredBlockers.some((blockerId) => blockerId === undefined)) {
      throw planError(
        "verification-failed",
        "A blocker mapping is missing",
        "manual-review",
      );
    }
    const blockerIds = desiredBlockers.filter((id): id is string =>
      id !== undefined
    );
    if (!blockerIds.every((id) => task.blockedBy.includes(id))) {
      throw planError(
        "verification-failed",
        `Task ${task.id} is missing approved blockers`,
        "manual-review",
        node.clientRef,
      );
    }
    if (
      node.kind === "create" &&
      [...task.blockedBy].sort().join("\0") !==
        [...blockerIds].sort().join("\0")
    ) {
      throw planError(
        "verification-failed",
        `Created task ${task.id} has unapproved blockers`,
        "manual-review",
        node.clientRef,
      );
    }
  }
}

function resultForPlan(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
  appliedAt: string,
): DexPlanApplyResult {
  return DexPlanApplyResultSchema.parse({
    schemaVersion: 1,
    adapterVersion: DEX_PLAN_APPLIER_VERSION,
    planId: checkpoint.planId,
    planHash: checkpoint.planHash,
    idempotencyKey: checkpoint.idempotencyKey,
    ownerToken: checkpoint.ownerToken,
    status: "succeeded",
    appliedAt,
    taskIdsByClientRef: sortedMapping(checkpoint.taskIdsByClientRef),
    mappings: expectedResultMappings(preflight, checkpoint),
  });
}

async function writeResult(
  context: DexPlanApplierMethodContext,
  name: string,
  result: DexPlanApplyResult,
): Promise<{ name: string }> {
  try {
    return await context.writeResource("result", name, result);
  } catch (error) {
    throw planError(
      "resource-write-failed",
      "Could not persist Dex plan result",
      "retry",
      null,
      error,
    );
  }
}

async function writeReceipt(
  context: DexPlanApplierMethodContext,
  name: string,
  receipt: z.infer<typeof DexPlanApplyReceiptSchema>,
): Promise<{ name: string }> {
  try {
    return await context.writeResource(
      "receipt",
      name,
      DexPlanApplyReceiptSchema.parse(receipt),
    );
  } catch (error) {
    throw planError(
      "resource-write-failed",
      "Could not persist Dex plan receipt",
      "retry",
      null,
      error,
    );
  }
}

async function withRepositoryInvocationLock<T>(
  repoDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = invocationTails.get(repoDir) ?? Promise.resolve();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  invocationTails.set(repoDir, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (invocationTails.get(repoDir) === tail) invocationTails.delete(repoDir);
  }
}

const JsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.number(), z.string()]),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
  })
  .refine((response) =>
    (response.result === undefined) !== (response.error === undefined)
  );

const McpToolResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  isError: z.boolean().optional(),
});

function parseJsonRpcResponses(
  stdout: string,
): Array<z.infer<typeof JsonRpcResponseSchema>> {
  const responses: Array<z.infer<typeof JsonRpcResponseSchema>> = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.length === 0) continue;
    try {
      responses.push(JsonRpcResponseSchema.parse(JSON.parse(line)));
    } catch (error) {
      throw planError(
        "mcp-protocol-invalid",
        "Dex MCP returned an invalid JSON-RPC response",
        "retry",
        null,
        error,
      );
    }
  }
  return responses;
}

function mcpResult(
  responses: Array<z.infer<typeof JsonRpcResponseSchema>>,
  id: number,
  operation: string,
): unknown {
  const response = responses.find((candidate) => candidate.id === id);
  if (response === undefined || response.error !== undefined) {
    throw planError(
      "mcp-protocol-invalid",
      `Dex MCP ${operation} did not return a result`,
      "retry",
    );
  }
  return response.result;
}

function parseMcpPayload(value: unknown, operation: string): unknown {
  let response: z.infer<typeof McpToolResponseSchema>;
  try {
    response = McpToolResponseSchema.parse(value);
  } catch (error) {
    throw planError(
      "mcp-protocol-invalid",
      `Invalid ${operation} response`,
      "retry",
      null,
      error,
    );
  }
  const text = response.content.find(
    (block): block is { type: string; text: string } =>
      block.type === "text" && block.text !== undefined,
  )?.text;
  if (text === undefined) {
    throw planError(
      "mcp-protocol-invalid",
      `${operation} returned no JSON payload`,
      "retry",
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw planError(
      "mcp-json-invalid",
      `${operation} returned malformed JSON`,
      "retry",
      null,
      error,
    );
  }
  if (response.isError === true) {
    throw planError("mcp-tool-failed", `Dex MCP ${operation} failed`, "retry");
  }
  return payload;
}

async function callDexMcpTool(
  cwd: string,
  toolName: "list_tasks" | "create_task" | "update_task",
  args: Record<string, unknown>,
): Promise<unknown> {
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "swamp-dex-plan-applier",
          version: DEX_PLAN_APPLIER_VERSION,
        },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    },
  ] as const;
  let output: BoundedDexProcessResult;
  try {
    output = await runBoundedDexProcess(
      cwd,
      ["mcp"],
      `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
    );
  } catch (error) {
    throw planError(
      "mcp-command-failed",
      error instanceof DexCommandBoundaryError && error.boundary === "timeout"
        ? "Dex MCP command timed out"
        : error instanceof DexCommandBoundaryError
        ? "Dex MCP command exceeded the output limit"
        : "Dex MCP command could not be executed",
      "retry",
      null,
      error,
    );
  }
  if (output.code !== 0) {
    throw planError(
      "mcp-command-failed",
      "Dex MCP command exited with a nonzero status",
      "retry",
    );
  }
  const stdout = textDecoder.decode(output.stdout);
  const responses = parseJsonRpcResponses(stdout);
  mcpResult(responses, 1, "initialization");
  return parseMcpPayload(mcpResult(responses, 2, toolName), toolName);
}

export async function verifyRepositoryLocalDexStore(
  repoDir: string,
  resolveDexDirectory: (cwd: string) => Promise<string> = async (cwd) => {
    const result = await runBoundedDexProcess(cwd, ["dir"], null);
    if (result.code !== 0) {
      throw new Error("Dex directory lookup failed");
    }
    return textDecoder.decode(result.stdout).trim();
  },
): Promise<void> {
  try {
    const canonicalRepository = await Deno.realPath(repoDir);
    const expectedDirectory = `${canonicalRepository}/.dex`;
    const expectedInfo = await Deno.lstat(expectedDirectory);
    if (!expectedInfo.isDirectory || expectedInfo.isSymlink) {
      throw new Error("Unsafe Dex directory");
    }
    const configuredDirectory = await resolveDexDirectory(repoDir);
    if (
      configuredDirectory.length === 0 || configuredDirectory.includes("\n") ||
      !configuredDirectory.startsWith("/")
    ) {
      throw new Error("Invalid Dex directory response");
    }
    const [canonicalExpected, canonicalConfigured] = await Promise.all([
      Deno.realPath(expectedDirectory),
      Deno.realPath(configuredDirectory),
    ]);
    if (
      canonicalExpected !== expectedDirectory ||
      canonicalConfigured !== canonicalExpected
    ) {
      throw new Error("Dex directory is not repository-local");
    }
  } catch (error) {
    throw planError(
      "repository-layout-invalid",
      "Dex storage is not a verified repository-local directory",
      "do-not-retry",
      null,
      error,
    );
  }
}

function parseRawTask(value: unknown): RawDexTask {
  try {
    return RawDexTaskSchema.parse(value);
  } catch (error) {
    throw planError(
      "dex-response-invalid",
      "Dex returned an invalid task",
      "retry",
      null,
      error,
    );
  }
}

function createDenoDexPlanCommandAdapter(): DexPlanCommandAdapter {
  return {
    listTasks: async (cwd) => {
      const payload = await callDexMcpTool(cwd, "list_tasks", { all: true });
      try {
        return z.array(RawDexTaskSchema).parse(payload);
      } catch (error) {
        throw planError(
          "dex-response-invalid",
          "Dex returned an invalid task inventory",
          "retry",
          null,
          error,
        );
      }
    },
    createTask: async (cwd, args) =>
      parseRawTask(await callDexMcpTool(cwd, "create_task", args)),
    updateTask: async (cwd, args) =>
      parseRawTask(await callDexMcpTool(cwd, "update_task", args)),
  };
}

const DEFAULT_DEPENDENCIES: DexPlanApplierDependencies = {
  commandAdapter: createDenoDexPlanCommandAdapter(),
  verifyRepository: verifyRepositoryLocalDexStore,
  repositoryLock: DEFAULT_DEX_REPOSITORY_LOCK,
  now: () => new Date().toISOString(),
};

type DexPlanIdentity = Awaited<ReturnType<typeof createPlanIdentity>>;

function mappingsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  return JSON.stringify(sortedMapping(left)) ===
    JSON.stringify(sortedMapping(right));
}

function expectedResultMappings(
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
): z.infer<typeof DexPlanMappingEntrySchema>[] {
  return [...preflight.nodes]
    .sort((left, right) => left.clientRef.localeCompare(right.clientRef))
    .map((node) => {
      const dexTaskId = checkpoint.taskIdsByClientRef[node.clientRef];
      if (dexTaskId === undefined) {
        throw planError(
          "verification-failed",
          `Result mapping for ${node.clientRef} is missing`,
          "manual-review",
          node.clientRef,
        );
      }
      return {
        clientRef: node.clientRef,
        dexTaskId,
        disposition: node.disposition,
      };
    });
}

function resultMappingsEqual(
  result: DexPlanApplyResult,
  preflight: PreflightState,
  checkpoint: DexPlanApplyCheckpoint,
): boolean {
  const actual = [...result.mappings].sort((left, right) =>
    left.clientRef.localeCompare(right.clientRef)
  );
  return JSON.stringify(actual) ===
    JSON.stringify(expectedResultMappings(preflight, checkpoint));
}

function requireResultForCheckpoint(
  value: unknown,
  checkpoint: DexPlanApplyCheckpoint,
  preflight: PreflightState,
): DexPlanApplyResult {
  let result: DexPlanApplyResult;
  try {
    result = DexPlanApplyResultSchema.parse(value);
  } catch (error) {
    throw planError(
      "verification-failed",
      "Succeeded checkpoint result is invalid",
      "manual-review",
      null,
      error,
    );
  }
  if (
    result.planId !== checkpoint.planId ||
    result.planHash !== checkpoint.planHash ||
    result.idempotencyKey !== checkpoint.idempotencyKey ||
    result.ownerToken !== checkpoint.ownerToken ||
    !mappingsEqual(result.taskIdsByClientRef, checkpoint.taskIdsByClientRef) ||
    !resultMappingsEqual(result, preflight, checkpoint)
  ) {
    throw planError(
      "verification-failed",
      "Succeeded checkpoint and result do not describe the same plan",
      "manual-review",
    );
  }
  return result;
}

function isCurrentSuccessReceipt(
  value: unknown,
  checkpoint: DexPlanApplyCheckpoint,
  identity: DexPlanIdentity,
): boolean {
  const parsed = DexPlanApplyReceiptSchema.safeParse(value);
  if (!parsed.success) return false;
  const receipt = parsed.data;
  return (
    receipt.status === "succeeded" &&
    receipt.planId === checkpoint.planId &&
    receipt.planHash === checkpoint.planHash &&
    receipt.idempotencyKey === checkpoint.idempotencyKey &&
    receipt.ownerToken === checkpoint.ownerToken &&
    receipt.attempt === checkpoint.attempt &&
    receipt.checkpointName === identity.checkpointName &&
    receipt.resultName === identity.resultName &&
    mappingsEqual(receipt.taskIdsByClientRef, checkpoint.taskIdsByClientRef)
  );
}

function successReceipt(
  checkpoint: DexPlanApplyCheckpoint,
  identity: DexPlanIdentity,
  occurredAt: string,
): z.infer<typeof DexPlanApplyReceiptSchema> {
  return {
    schemaVersion: 1,
    adapterVersion: DEX_PLAN_APPLIER_VERSION,
    planId: checkpoint.planId,
    planHash: checkpoint.planHash,
    idempotencyKey: checkpoint.idempotencyKey,
    ownerToken: checkpoint.ownerToken,
    attempt: checkpoint.attempt,
    status: "succeeded",
    retryDisposition: null,
    errorCode: null,
    failedClientRef: null,
    occurredAt,
    checkpointName: identity.checkpointName,
    resultName: identity.resultName,
    taskIdsByClientRef: checkpoint.taskIdsByClientRef,
  };
}

function samePlanReceipt(
  value: unknown,
  plan: DexApprovedPlan,
  identity: DexPlanIdentity,
  ownerToken: string,
): z.infer<typeof DexPlanApplyReceiptSchema> | null {
  const parsed = DexPlanApplyReceiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const receipt = parsed.data;
  return receipt.planId === plan.planId &&
      receipt.planHash === identity.planHash &&
      receipt.idempotencyKey === identity.idempotencyKey &&
      receipt.ownerToken === ownerToken
    ? receipt
    : null;
}

async function persistFailureReceipt(
  context: DexPlanApplierMethodContext,
  identity: DexPlanIdentity,
  plan: DexApprovedPlan,
  attempt: number,
  failure: DexPlanApplierError,
  taskIdsByClientRef: Record<string, string>,
  occurredAt: string,
): Promise<void> {
  await writeReceipt(context, identity.receiptName, {
    schemaVersion: 1,
    adapterVersion: DEX_PLAN_APPLIER_VERSION,
    planId: plan.planId,
    planHash: identity.planHash,
    idempotencyKey: identity.idempotencyKey,
    ownerToken: context.globalArgs.ownerToken,
    attempt,
    status: "failed",
    retryDisposition: failure.retryDisposition,
    errorCode: failure.errorCode,
    failedClientRef: failure.failedClientRef,
    occurredAt,
    checkpointName: identity.checkpointName,
    resultName: null,
    taskIdsByClientRef: sortedMapping(taskIdsByClientRef),
  });
}

function repositoryLockPlanError(error: unknown): DexPlanApplierError {
  return error instanceof DexRepositoryLockOwnershipError
    ? planError(
      "repository-lock-ownership-lost",
      "Dex repository lock ownership was lost",
      "retry",
      null,
      error,
    )
    : planError(
      "repository-lock-acquisition-failed",
      error instanceof DexRepositoryLockTimeoutError
        ? "Timed out acquiring the Dex repository lock"
        : "Could not acquire the Dex repository lock",
      "retry",
      null,
      error,
    );
}

function checkpointForIdentity(
  value: unknown,
  identity: DexPlanIdentity,
  ownerToken: string,
): DexPlanApplyCheckpoint | null {
  const parsed = DexPlanApplyCheckpointSchema.safeParse(value);
  if (!parsed.success) return null;
  const checkpoint = parsed.data;
  return checkpoint.planHash === identity.planHash &&
      checkpoint.idempotencyKey === identity.idempotencyKey &&
      checkpoint.ownerToken === ownerToken
    ? checkpoint
    : null;
}

async function persistRepositoryLockPlanFailure(
  plan: DexApprovedPlan,
  identity: DexPlanIdentity,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies,
  failure: DexPlanApplierError,
): Promise<void> {
  const checkpoint = checkpointForIdentity(
    await context.readResource(identity.checkpointName),
    identity,
    context.globalArgs.ownerToken,
  );
  if (checkpoint?.status === "succeeded") return;
  const priorReceipt = samePlanReceipt(
    await context.readResource(identity.receiptName),
    plan,
    identity,
    context.globalArgs.ownerToken,
  );
  const attempt =
    Math.max(checkpoint?.attempt ?? 0, priorReceipt?.attempt ?? 0) + 1;
  await persistFailureReceipt(
    context,
    identity,
    plan,
    attempt,
    failure,
    checkpoint?.taskIdsByClientRef ?? {},
    dependencies.now(),
  );
}

async function executeDexPlanApplyLocked(
  plan: DexApprovedPlan,
  identity: DexPlanIdentity,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies,
): Promise<DexPlanApplierExecutionResult> {
  let prior: DexPlanApplyCheckpoint | null = null;
  let checkpoint: DexPlanApplyCheckpoint | null = null;
  let invocationAttempt = 1;
  try {
    const priorRaw = await context.readResource(identity.checkpointName);
    prior = priorRaw === null
      ? null
      : DexPlanApplyCheckpointSchema.parse(priorRaw);
    const priorReceipt = samePlanReceipt(
      await context.readResource(identity.receiptName),
      plan,
      identity,
      context.globalArgs.ownerToken,
    );
    invocationAttempt =
      Math.max(prior?.attempt ?? 0, priorReceipt?.attempt ?? 0) + 1;
    if (prior !== null && prior.planHash !== identity.planHash) {
      throw planError(
        "idempotency-conflict",
        `Plan ${plan.planId} was already used with different approved content`,
      );
    }

    let currentTasks: RawDexTask[];
    try {
      currentTasks = await dependencies.commandAdapter.listTasks(
        context.repoDir,
      );
    } catch (error) {
      throw planError(
        "dex-list-failed",
        "Could not inventory Dex tasks",
        "retry",
        null,
        error,
      );
    }
    const priorMapping = prior?.taskIdsByClientRef ?? {};
    const preflight = preflightPlan(plan, currentTasks, priorMapping);
    const now = dependencies.now();
    const resolvedMapping = Object.fromEntries(preflight.resolvedIdsByRef);

    if (prior?.status === "succeeded") {
      const replayCheckpoint = DexPlanApplyCheckpointSchema.parse({
        ...prior,
        attempt: invocationAttempt,
        updatedAt: now,
      });
      const resultRaw = await context.readResource(identity.resultName);
      if (resultRaw === null) {
        throw planError(
          "resource-write-failed",
          "Succeeded plan result is missing",
          "retry",
        );
      }
      const result = requireResultForCheckpoint(
        resultRaw,
        replayCheckpoint,
        preflight,
      );
      await verifyFinalGraph(
        preflight,
        structuredClone(replayCheckpoint),
        context,
        dependencies.commandAdapter,
      );
      const receiptRaw = await context.readResource(identity.receiptName);
      const receipt =
        isCurrentSuccessReceipt(receiptRaw, replayCheckpoint, identity)
          ? DexPlanApplyReceiptSchema.parse(receiptRaw)
          : successReceipt(replayCheckpoint, identity, dependencies.now());
      const resultHandle = await writeResult(
        context,
        identity.resultName,
        result,
      );
      const receiptHandle = await writeReceipt(
        context,
        identity.receiptName,
        receipt,
      );
      const checkpointHandle = await writeCheckpoint(
        context,
        identity.checkpointName,
        replayCheckpoint,
      );
      return {
        dataHandles: [checkpointHandle, receiptHandle, resultHandle],
      };
    }

    checkpoint = prior === null
      ? DexPlanApplyCheckpointSchema.parse({
        schemaVersion: 1,
        adapterVersion: DEX_PLAN_APPLIER_VERSION,
        planId: plan.planId,
        planHash: identity.planHash,
        idempotencyKey: identity.idempotencyKey,
        ownerToken: context.globalArgs.ownerToken,
        attempt: invocationAttempt,
        status: "applying",
        phase: "preflight",
        retryDisposition: null,
        errorCode: null,
        failedClientRef: null,
        startedAt: now,
        updatedAt: now,
        baselineTaskIds: currentTasks.map((task) => task.id).sort(),
        taskIdsByClientRef: sortedMapping(resolvedMapping),
        operations: await initialOperations(
          preflight.nodes,
          identity.idempotencyKey,
        ),
      })
      : DexPlanApplyCheckpointSchema.parse({
        ...prior,
        attempt: invocationAttempt,
        status: "applying",
        phase: "preflight",
        retryDisposition: null,
        errorCode: null,
        failedClientRef: null,
        updatedAt: now,
        taskIdsByClientRef: sortedMapping(resolvedMapping),
      });

    await writeCheckpoint(context, identity.checkpointName, checkpoint);
    await applyExistingDetachment(
      preflight,
      checkpoint,
      identity.checkpointName,
      context,
      dependencies,
    );
    await applyCreateHierarchy(
      preflight,
      checkpoint,
      identity.checkpointName,
      context,
      dependencies,
    );
    await applyExistingHierarchy(
      preflight,
      checkpoint,
      identity.checkpointName,
      context,
      dependencies,
    );
    await applyBlockers(
      preflight,
      checkpoint,
      identity.checkpointName,
      context,
      dependencies,
    );
    await verifyFinalGraph(
      preflight,
      checkpoint,
      context,
      dependencies.commandAdapter,
    );
    checkpoint.phase = "persist-result";
    checkpoint.updatedAt = dependencies.now();
    await writeCheckpoint(context, identity.checkpointName, checkpoint);
    const result = resultForPlan(preflight, checkpoint, dependencies.now());
    const resultHandle = await writeResult(
      context,
      identity.resultName,
      result,
    );
    const receiptHandle = await writeReceipt(
      context,
      identity.receiptName,
      successReceipt(checkpoint, identity, dependencies.now()),
    );
    checkpoint.status = "succeeded";
    checkpoint.retryDisposition = null;
    checkpoint.errorCode = null;
    checkpoint.failedClientRef = null;
    checkpoint.updatedAt = dependencies.now();
    const checkpointHandle = await writeCheckpoint(
      context,
      identity.checkpointName,
      checkpoint,
    );
    context.logger.info("Applied Dex plan {planId} with {taskCount} task(s)", {
      planId: plan.planId,
      taskCount: preflight.nodes.length,
    });
    return { dataHandles: [checkpointHandle, receiptHandle, resultHandle] };
  } catch (error) {
    const failure = normalizePlanError(error);
    let terminalFailure = failure;
    context.logger.warning("Dex plan {planId} failed with {errorCode}", {
      planId: plan.planId,
      errorCode: failure.errorCode,
    });
    if (checkpoint !== null && checkpoint.status !== "succeeded") {
      checkpoint.status = "failed";
      checkpoint.retryDisposition = failure.retryDisposition;
      checkpoint.errorCode = failure.errorCode;
      checkpoint.failedClientRef = failure.failedClientRef;
      checkpoint.updatedAt = dependencies.now();
      try {
        await writeCheckpoint(context, identity.checkpointName, checkpoint);
      } catch (writeError) {
        if (failure.errorCode !== "resource-write-failed") {
          terminalFailure = normalizePlanError(writeError);
        }
      }
    }
    const isConflict = failure.errorCode === "idempotency-conflict";
    const failureMapping = checkpoint?.taskIdsByClientRef ??
      (!isConflict && prior?.planHash === identity.planHash
        ? prior.taskIdsByClientRef
        : {});
    try {
      await persistFailureReceipt(
        context,
        identity,
        plan,
        checkpoint?.attempt ?? invocationAttempt,
        terminalFailure,
        failureMapping,
        dependencies.now(),
      );
    } catch (writeError) {
      if (terminalFailure.errorCode !== "resource-write-failed") {
        terminalFailure = normalizePlanError(writeError);
      }
    }
    throw terminalFailure;
  }
}

/** Apply one approved plan under in-process and cross-process repository locks. */
export function executeDexPlanApply(
  args: DexPlanApplyArgs,
  context: DexPlanApplierMethodContext,
  dependencies: DexPlanApplierDependencies = DEFAULT_DEPENDENCIES,
): Promise<DexPlanApplierExecutionResult> {
  const plan = DexApprovedPlanSchema.parse(args.plan);
  return withRepositoryInvocationLock(context.repoDir, async () => {
    const identity = await createPlanIdentity(
      plan,
      context.globalArgs.ownerToken,
    );
    try {
      await dependencies.verifyRepository(context.repoDir);
    } catch (error) {
      const failure = normalizePlanError(error);
      try {
        await persistRepositoryLockPlanFailure(
          plan,
          identity,
          context,
          dependencies,
          failure,
        );
      } catch (writeError) {
        throw normalizePlanError(writeError);
      }
      throw failure;
    }
    let committedResult: DexPlanApplierExecutionResult | null = null;
    try {
      return await dependencies.repositoryLock.runExclusive(
        context.repoDir,
        async () => {
          const result = await executeDexPlanApplyLocked(
            plan,
            identity,
            context,
            dependencies,
          );
          committedResult = result;
          return result;
        },
      );
    } catch (error) {
      if (committedResult !== null) {
        context.logger.warning(
          "Dex repository lock cleanup failed after plan commit",
          {
            planId: plan.planId,
          },
        );
        return committedResult;
      }
      if (error instanceof DexPlanApplierError) throw error;
      const failure = repositoryLockPlanError(error);
      try {
        await persistRepositoryLockPlanFailure(
          plan,
          identity,
          context,
          dependencies,
          failure,
        );
      } catch (writeError) {
        throw normalizePlanError(writeError);
      }
      throw failure;
    }
  });
}
