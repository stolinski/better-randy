import assert from "node:assert/strict";

import {
  DexRepositoryLockOwnershipError,
  DexRepositoryLockTimeoutError,
  PASSTHROUGH_DEX_REPOSITORY_LOCK,
} from "./dex-repository-lock.ts";

import {
  DexCommandBoundaryError,
  runBoundedDexProcess,
} from "./dex-bounded-process.ts";
import {
  type DexApprovedPlan,
  DexApprovedPlanSchema,
  type DexMcpCreateTaskArguments,
  type DexMcpUpdateTaskArguments,
  type DexPlanApplierDependencies,
  DexPlanApplierError,
  type DexPlanApplierMethodContext,
  DexPlanApplyArgsSchema,
  DexPlanApplyCheckpointSchema,
  DexPlanApplyReceiptSchema,
  DexPlanApplyResultSchema,
  type DexPlanCommandAdapter,
  executeDexPlanApply,
  type RawDexTask,
  verifyRepositoryLocalDexStore,
} from "./dex-plan-applier-adapter.ts";
import { model } from "./dex-plan-applier.ts";

const FIXED_NOW = "2026-08-05T21:00:00.000Z";

type FixtureWrite = {
  specName: string;
  name: string;
  data: Record<string, unknown>;
};

function rawTask(overrides: Partial<RawDexTask> = {}): RawDexTask {
  return {
    id: "existing-1",
    parent_id: null,
    name: "Existing task",
    description: "Existing description",
    priority: 41,
    completed: false,
    result: null,
    metadata: null,
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
    started_at: null,
    completed_at: null,
    blockedBy: [],
    blocks: [],
    children: [],
    ...overrides,
  };
}

function oneTaskPlan(
  overrides: Partial<DexApprovedPlan> = {},
): DexApprovedPlan {
  return DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "approved-plan-1",
    tasks: [
      {
        kind: "create",
        clientRef: "implementation-task",
        name: "Implement approved work",
        description: "Apply exactly the approved implementation scope.",
        priority: 73,
        parent: { kind: "root" },
        blockedBy: [],
      },
    ],
    ...overrides,
  });
}

class FakeDexPlanCommandAdapter implements DexPlanCommandAdapter {
  readonly tasks = new Map<string, RawDexTask>();
  readonly createCalls: DexMcpCreateTaskArguments[] = [];
  readonly updateCalls: DexMcpUpdateTaskArguments[] = [];
  listCalls = 0;
  failListCall: number | null = null;
  failCreateCall: number | null = null;
  uncertainCreateCall: number | null = null;
  duplicateUncertainCreateCall: number | null = null;
  failUpdateCall: number | null = null;
  uncertainUpdateCall: number | null = null;
  listDelayMs = 0;
  maxConcurrentCalls = 0;
  #activeCalls = 0;
  #nextId = 1;

  constructor(tasks: RawDexTask[] = []) {
    for (const task of tasks) this.tasks.set(task.id, structuredClone(task));
  }

  async listTasks(): Promise<RawDexTask[]> {
    this.listCalls += 1;
    return this.#withCall(async () => {
      if (this.failListCall === this.listCalls) {
        throw new Error("fixture list failure");
      }
      if (this.listDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.listDelayMs));
      }
      return [...this.tasks.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((task) => structuredClone(task));
    });
  }

  async createTask(
    _cwd: string,
    args: DexMcpCreateTaskArguments,
  ): Promise<RawDexTask> {
    this.createCalls.push(structuredClone(args));
    return this.#withCall(async () => {
      const call = this.createCalls.length;
      if (this.failCreateCall === call) {
        throw new Error("fixture create failure");
      }
      const id = `created-${String(this.#nextId).padStart(3, "0")}`;
      this.#nextId += 1;
      const task = rawTask({
        id,
        parent_id: args.parent_id ?? null,
        name: args.name,
        description: args.description,
        priority: args.priority,
      });
      this.tasks.set(id, task);
      this.#syncParent(id, null, task.parent_id);
      if (this.duplicateUncertainCreateCall === call) {
        const duplicateId = `created-${String(this.#nextId).padStart(3, "0")}`;
        this.#nextId += 1;
        const duplicate = structuredClone({ ...task, id: duplicateId });
        this.tasks.set(duplicateId, duplicate);
        this.#syncParent(duplicateId, null, duplicate.parent_id);
      }
      if (this.uncertainCreateCall === call) {
        throw new Error("fixture response lost after create");
      }
      return structuredClone(task);
    });
  }

  async updateTask(
    _cwd: string,
    args: DexMcpUpdateTaskArguments,
  ): Promise<RawDexTask> {
    this.updateCalls.push(structuredClone(args));
    return this.#withCall(async () => {
      const call = this.updateCalls.length;
      if (this.failUpdateCall === call) {
        throw new Error("fixture update failure");
      }
      const task = this.tasks.get(args.id);
      if (task === undefined) {
        throw new Error(`Missing fixture task ${args.id}`);
      }
      if (args.parent_id !== undefined && task.parent_id !== args.parent_id) {
        const previous = task.parent_id;
        task.parent_id = args.parent_id;
        this.#syncParent(task.id, previous, args.parent_id);
      }
      for (const blockerId of args.add_blocked_by ?? []) {
        const blocker = this.tasks.get(blockerId);
        if (blocker === undefined) {
          throw new Error(`Missing fixture blocker ${blockerId}`);
        }
        if (!task.blockedBy.includes(blockerId)) task.blockedBy.push(blockerId);
        if (!blocker.blocks.includes(task.id)) blocker.blocks.push(task.id);
      }
      task.updated_at = FIXED_NOW;
      if (this.uncertainUpdateCall === call) {
        throw new Error("fixture response lost after update");
      }
      return structuredClone(task);
    });
  }

  #syncParent(
    taskId: string,
    previousParentId: string | null,
    nextParentId: string | null,
  ): void {
    if (previousParentId !== null) {
      const previous = this.tasks.get(previousParentId);
      if (previous !== undefined) {
        previous.children = previous.children.filter((id) => id !== taskId);
      }
    }
    if (nextParentId !== null) {
      const next = this.tasks.get(nextParentId);
      if (next === undefined) {
        throw new Error(`Missing fixture parent ${nextParentId}`);
      }
      if (!next.children.includes(taskId)) next.children.push(taskId);
    }
  }

  async #withCall<T>(operation: () => Promise<T>): Promise<T> {
    this.#activeCalls += 1;
    this.maxConcurrentCalls = Math.max(
      this.maxConcurrentCalls,
      this.#activeCalls,
    );
    try {
      return await operation();
    } finally {
      this.#activeCalls -= 1;
    }
  }
}

function fixtureContext(
  ownerToken = "owner-token-exact",
  sharedResources = new Map<string, Record<string, unknown>>(),
): {
  context: DexPlanApplierMethodContext;
  writes: FixtureWrite[];
  resources: Map<string, Record<string, unknown>>;
} {
  const writes: FixtureWrite[] = [];
  return {
    writes,
    resources: sharedResources,
    context: {
      repoDir: "/fixture/repository",
      globalArgs: { ownerToken },
      logger: { info: () => undefined, warning: () => undefined },
      readResource: (name) =>
        Promise.resolve(sharedResources.get(name) ?? null),
      writeResource: (specName, name, data) => {
        const copy = structuredClone(data);
        writes.push({ specName, name, data: copy });
        sharedResources.set(name, copy);
        return Promise.resolve({ name });
      },
    },
  };
}

function dependencies(
  commandAdapter: DexPlanCommandAdapter,
): DexPlanApplierDependencies {
  return {
    commandAdapter,
    verifyRepository: () => Promise.resolve(),
    repositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
    now: () => FIXED_NOW,
  };
}

function latestWrite(writes: FixtureWrite[], specName: string): FixtureWrite {
  const matches = writes.filter((write) => write.specName === specName);
  const latest = matches.at(-1);
  assert.ok(latest, `Expected ${specName} write`);
  return latest;
}

async function assertPlanFailure(
  operation: Promise<unknown>,
  expectedCode: DexPlanApplierError["errorCode"],
): Promise<DexPlanApplierError> {
  try {
    await operation;
    assert.fail(`Expected ${expectedCode}`);
  } catch (error) {
    assert.ok(error instanceof DexPlanApplierError);
    assert.equal(error.errorCode, expectedCode);
    return error;
  }
}

Deno.test("model exposes one method and the three durable resource types", () => {
  assert.equal(model.type, "@club_aqua_back_deck/dex-plan-applier");
  assert.equal(model.version, "2026.08.06.1");
  assert.deepEqual(Object.keys(model.methods), ["apply-plan"]);
  assert.deepEqual(Object.keys(model.resources).sort(), [
    "checkpoint",
    "receipt",
    "result",
  ]);
});

Deno.test("one task preserves exact priority and owner attribution", async () => {
  const ownerToken = "  owner/token:EXACT\t";
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext(ownerToken);
  await executeDexPlanApply(
    { plan: oneTaskPlan() },
    fixture.context,
    dependencies(adapter),
  );

  assert.deepEqual(adapter.createCalls, [
    {
      name: "Implement approved work",
      description: "Apply exactly the approved implementation scope.",
      priority: 73,
    },
  ]);
  const result = DexPlanApplyResultSchema.parse(
    latestWrite(fixture.writes, "result").data,
  );
  assert.equal(result.ownerToken, ownerToken);
  assert.equal(
    adapter.tasks.get(result.taskIdsByClientRef["implementation-task"])
      ?.priority,
    73,
  );
  const receipt = DexPlanApplyReceiptSchema.parse(
    latestWrite(fixture.writes, "receipt").data,
  );
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.ownerToken, ownerToken);
});

Deno.test("plan application runs inside the shared repository lock", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const planDependencies = dependencies(adapter);
  let lockCalls = 0;
  planDependencies.repositoryLock = {
    runExclusive: async (_repoDir, operation) => {
      lockCalls += 1;
      return await operation();
    },
  };

  await executeDexPlanApply(
    { plan: oneTaskPlan({ planId: "shared-repository-lock" }) },
    fixtureContext().context,
    planDependencies,
  );
  assert.equal(lockCalls, 1);
});

Deno.test("pre-operation repository lock failure persists a retryable plan receipt", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  const planDependencies = dependencies(adapter);
  planDependencies.repositoryLock = {
    runExclusive: () =>
      Promise.reject(
        new DexRepositoryLockTimeoutError("/fixture/repository/.dex/lock", 10),
      ),
  };

  const failure = await assertPlanFailure(
    executeDexPlanApply(
      { plan: oneTaskPlan({ planId: "lock-acquisition-failure" }) },
      fixture.context,
      planDependencies,
    ),
    "repository-lock-acquisition-failed",
  );
  assert.equal(failure.retryDisposition, "retry");
  assert.equal(adapter.listCalls, 0);
  assert.equal(
    fixture.writes.some((write) => write.specName === "checkpoint"),
    false,
  );
  const receipt = DexPlanApplyReceiptSchema.parse(
    latestWrite(fixture.writes, "receipt").data,
  );
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.errorCode, "repository-lock-acquisition-failed");
  assert.equal(receipt.retryDisposition, "retry");
});

Deno.test("post-commit repository lock cleanup failure preserves plan success", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  const planDependencies = dependencies(adapter);
  planDependencies.repositoryLock = {
    runExclusive: async (_repoDir, operation) => {
      await operation();
      throw new DexRepositoryLockOwnershipError(
        "/fixture/repository/.dex/lock",
      );
    },
  };

  const result = await executeDexPlanApply(
    { plan: oneTaskPlan({ planId: "lock-cleanup-after-plan-commit" }) },
    fixture.context,
    planDependencies,
  );
  assert.equal(adapter.createCalls.length, 1);
  assert.equal(
    fixture.writes.filter((write) => write.specName === "receipt").length,
    1,
  );
  assert.equal(
    DexPlanApplyReceiptSchema.parse(latestWrite(fixture.writes, "receipt").data)
      .status,
    "succeeded",
  );
  assert.equal(
    DexPlanApplyCheckpointSchema.parse(
      latestWrite(fixture.writes, "checkpoint").data,
    ).status,
    "succeeded",
  );
  assert.deepEqual(
    new Set(result.dataHandles.map((handle) => handle.name)),
    new Set(fixture.writes.slice(-3).map((write) => write.name)),
  );
});

Deno.test("optional epic hierarchy creates root, task, and subtask in parent order", async () => {
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "epic-hierarchy",
    epic: {
      clientRef: "approved-epic",
      name: "Approved epic",
      description: "Approved epic description",
      priority: 2,
      blockedBy: [],
    },
    tasks: [
      {
        kind: "create",
        clientRef: "parent-task",
        name: "Parent task",
        description: "Parent description",
        priority: 3,
        parent: { kind: "reference", clientRef: "approved-epic" },
        blockedBy: [],
      },
      {
        kind: "create",
        clientRef: "child-task",
        name: "Child task",
        description: "Child description",
        priority: 4,
        parent: { kind: "reference", clientRef: "parent-task" },
        blockedBy: [],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));

  assert.deepEqual(
    adapter.createCalls.map((call) => call.name),
    ["Approved epic", "Parent task", "Child task"],
  );
  assert.equal(adapter.createCalls[1].parent_id, "created-001");
  assert.equal(adapter.createCalls[2].parent_id, "created-002");
});

Deno.test("blockers are applied after every task has a stable mapping", async () => {
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "blocker-plan",
    tasks: [
      {
        kind: "create",
        clientRef: "first-task",
        name: "First task",
        description: "First description",
        priority: 1,
        parent: { kind: "root" },
        blockedBy: [],
      },
      {
        kind: "create",
        clientRef: "second-task",
        name: "Second task",
        description: "Second description",
        priority: 2,
        parent: { kind: "root" },
        blockedBy: ["first-task"],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));

  assert.deepEqual(adapter.updateCalls, [{
    id: "created-002",
    add_blocked_by: ["created-001"],
  }]);
  assert.deepEqual(adapter.tasks.get("created-002")?.blockedBy, [
    "created-001",
  ]);
});

Deno.test("existing task attachment reparents without changing content or priority", async () => {
  const existing = rawTask();
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "existing-attachment",
    epic: {
      clientRef: "new-epic",
      name: "New epic",
      description: "New epic description",
      priority: 1,
      blockedBy: [],
    },
    tasks: [
      {
        kind: "attachExisting",
        clientRef: "existing-task",
        selector: { kind: "id", taskId: existing.id },
        expected: {
          name: existing.name,
          description: existing.description,
          priority: existing.priority,
        },
        parent: { kind: "reference", clientRef: "new-epic" },
        addBlockedBy: [],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter([existing]);
  const fixture = fixtureContext();
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));

  assert.deepEqual(adapter.updateCalls, [
    {
      id: existing.id,
      parent_id: "created-001",
    },
  ]);
  assert.equal(adapter.tasks.get(existing.id)?.name, existing.name);
  assert.equal(
    adapter.tasks.get(existing.id)?.description,
    existing.description,
  );
  assert.equal(adapter.tasks.get(existing.id)?.priority, existing.priority);
});

Deno.test("retry resumes after a confirmed partial create without duplicates", async () => {
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "partial-create",
    tasks: [
      {
        kind: "create",
        clientRef: "alpha-task",
        name: "Alpha",
        description: "Alpha description",
        priority: 1,
        parent: { kind: "root" },
        blockedBy: [],
      },
      {
        kind: "create",
        clientRef: "beta-task",
        name: "Beta",
        description: "Beta description",
        priority: 2,
        parent: { kind: "root" },
        blockedBy: [],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.failCreateCall = 2;
  const fixture = fixtureContext();
  await assertPlanFailure(
    executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
    "dex-create-failed",
  );
  assert.equal(adapter.tasks.size, 1);
  const failed = DexPlanApplyCheckpointSchema.parse(
    latestWrite(fixture.writes, "checkpoint").data,
  );
  assert.equal(failed.taskIdsByClientRef["alpha-task"], "created-001");

  adapter.failCreateCall = null;
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
  assert.equal(adapter.tasks.size, 2);
  assert.equal(
    adapter.createCalls.filter((call) => call.name === "Alpha").length,
    1,
  );
  assert.equal(
    adapter.createCalls.filter((call) => call.name === "Beta").length,
    2,
  );
});

Deno.test("retry rejects an externally added blocker before further mutation", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.failListCall = 4;
  const fixture = fixtureContext();
  const plan = oneTaskPlan({ planId: "retry-unapproved-blocker" });
  await assertPlanFailure(
    executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
    "dex-list-failed",
  );
  const created = adapter.tasks.get("created-001");
  assert.ok(created);
  created.blockedBy.push("external-blocker");
  adapter.tasks.set(
    "external-blocker",
    rawTask({
      id: "external-blocker",
      name: "External blocker",
      blocks: [created.id],
    }),
  );
  adapter.failListCall = null;
  const createCount = adapter.createCalls.length;
  const updateCount = adapter.updateCalls.length;

  await assertPlanFailure(
    executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
    "existing-task-drift",
  );
  assert.equal(adapter.createCalls.length, createCount);
  assert.equal(adapter.updateCalls.length, updateCount);
  assert.equal(
    DexPlanApplyReceiptSchema.parse(latestWrite(fixture.writes, "receipt").data)
      .errorCode,
    "existing-task-drift",
  );
});

Deno.test("retry restores missing approved blockers on mapped created tasks", async () => {
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "retry-missing-approved-blocker",
    tasks: [
      {
        kind: "create",
        clientRef: "alpha-task",
        name: "Alpha",
        description: "Alpha description",
        priority: 1,
        parent: { kind: "root" },
        blockedBy: [],
      },
      {
        kind: "create",
        clientRef: "beta-task",
        name: "Beta",
        description: "Beta description",
        priority: 2,
        parent: { kind: "root" },
        blockedBy: ["alpha-task"],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.failUpdateCall = 1;
  const fixture = fixtureContext();
  await assertPlanFailure(
    executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
    "dex-update-failed",
  );
  assert.deepEqual(adapter.tasks.get("created-002")?.blockedBy, []);

  adapter.failUpdateCall = null;
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
  assert.deepEqual(adapter.tasks.get("created-002")?.blockedBy, [
    "created-001",
  ]);
});

Deno.test("uncertain create is recovered by unique post-baseline identity", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.uncertainCreateCall = 1;
  const fixture = fixtureContext();
  await executeDexPlanApply(
    { plan: oneTaskPlan() },
    fixture.context,
    dependencies(adapter),
  );

  assert.equal(adapter.tasks.size, 1);
  assert.equal(adapter.createCalls.length, 1);
  const result = DexPlanApplyResultSchema.parse(
    latestWrite(fixture.writes, "result").data,
  );
  assert.equal(result.taskIdsByClientRef["implementation-task"], "created-001");
});

Deno.test("ambiguous uncertain create fails closed for manual review", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.uncertainCreateCall = 1;
  adapter.duplicateUncertainCreateCall = 1;
  const fixture = fixtureContext();
  const failure = await assertPlanFailure(
    executeDexPlanApply(
      { plan: oneTaskPlan() },
      fixture.context,
      dependencies(adapter),
    ),
    "recovery-ambiguous",
  );
  assert.equal(failure.retryDisposition, "manual-review");
  assert.equal(adapter.createCalls.length, 1);
  assert.equal(adapter.tasks.size, 2);
  const receipt = DexPlanApplyReceiptSchema.parse(
    latestWrite(fixture.writes, "receipt").data,
  );
  assert.equal(receipt.retryDisposition, "manual-review");
});

Deno.test(
  "completed plan replay verifies and re-emits run-scoped handles without creating a task",
  async () => {
    const adapter = new FakeDexPlanCommandAdapter();
    const fixture = fixtureContext();
    const plan = oneTaskPlan();
    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
    const writeCount = fixture.writes.length;
    const replay = await executeDexPlanApply(
      { plan },
      fixture.context,
      dependencies(adapter),
    );
    assert.equal(adapter.createCalls.length, 1);
    assert.equal(adapter.tasks.size, 1);
    assert.deepEqual(
      fixture.writes.slice(writeCount).map((write) => write.specName),
      ["result", "receipt", "checkpoint"],
    );
    assert.deepEqual(
      replay.dataHandles.map((handle) => handle.name),
      fixture.writes
        .slice(writeCount)
        .reverse()
        .map((write) => write.name),
    );
    assert.equal(
      DexPlanApplyCheckpointSchema.parse(
        latestWrite(fixture.writes, "checkpoint").data,
      ).attempt,
      2,
    );
  },
);

Deno.test("replay attempts remain monotonic across failed verification and repair", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  const plan = oneTaskPlan({ planId: "monotonic-replay-attempts" });
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
  const created = adapter.tasks.get("created-001");
  assert.ok(created);
  const external = rawTask({ id: "external-1", blocks: ["created-001"] });
  adapter.tasks.set(external.id, external);
  created.blockedBy = [external.id];

  await assertPlanFailure(
    executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
    "existing-task-drift",
  );
  assert.equal(
    DexPlanApplyReceiptSchema.parse(latestWrite(fixture.writes, "receipt").data)
      .attempt,
    2,
  );

  created.blockedBy = [];
  external.blocks = [];
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
  assert.equal(
    DexPlanApplyReceiptSchema.parse(latestWrite(fixture.writes, "receipt").data)
      .attempt,
    3,
  );
  assert.equal(
    DexPlanApplyCheckpointSchema.parse(
      latestWrite(fixture.writes, "checkpoint").data,
    ).attempt,
    3,
  );
});

Deno.test(
  "succeeded replay reconstructs missing and failed receipts before re-emitting terminal outputs",
  async () => {
    const adapter = new FakeDexPlanCommandAdapter();
    const fixture = fixtureContext();
    const plan = oneTaskPlan({ planId: "receipt-reconstruction" });
    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
    const checkpointWrite = latestWrite(fixture.writes, "checkpoint");
    const receiptWrite = latestWrite(fixture.writes, "receipt");
    const checkpointBeforeReplay = structuredClone(checkpointWrite.data);
    fixture.resources.delete(receiptWrite.name);
    const writeCount = fixture.writes.length;

    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));

    assert.equal(adapter.createCalls.length, 1);
    assert.deepEqual(
      fixture.writes.slice(writeCount).map((write) => write.specName),
      ["result", "receipt", "checkpoint"],
    );
    const checkpointAfterReplay = DexPlanApplyCheckpointSchema.parse(
      fixture.resources.get(checkpointWrite.name),
    );
    const checkpointBefore = DexPlanApplyCheckpointSchema.parse(
      checkpointBeforeReplay,
    );
    assert.equal(checkpointAfterReplay.attempt, checkpointBefore.attempt + 1);
    assert.deepEqual(
      { ...checkpointAfterReplay, attempt: checkpointBefore.attempt },
      checkpointBefore,
    );
    assert.equal(
      DexPlanApplyReceiptSchema.parse(
        latestWrite(fixture.writes, "receipt").data,
      ).status,
      "succeeded",
    );

    const reconstructed = DexPlanApplyReceiptSchema.parse(
      latestWrite(fixture.writes, "receipt").data,
    );
    fixture.resources.set(receiptWrite.name, {
      ...reconstructed,
      status: "failed",
      retryDisposition: "retry",
      errorCode: "resource-write-failed",
      resultName: null,
    });
    const failedReceiptWriteCount = fixture.writes.length;
    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
    assert.deepEqual(
      fixture.writes.slice(failedReceiptWriteCount).map((write) =>
        write.specName
      ),
      ["result", "receipt", "checkpoint"],
    );
    assert.equal(
      DexPlanApplyReceiptSchema.parse(
        latestWrite(fixture.writes, "receipt").data,
      ).status,
      "succeeded",
    );

    fixture.resources.set(receiptWrite.name, {
      ...reconstructed,
      status: "succeeded",
      errorCode: "verification-failed",
    });
    const inconsistentReceiptWriteCount = fixture.writes.length;
    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
    assert.deepEqual(
      fixture.writes.slice(inconsistentReceiptWriteCount).map((write) =>
        write.specName
      ),
      ["result", "receipt", "checkpoint"],
    );
    assert.equal(
      DexPlanApplyReceiptSchema.parse(
        latestWrite(fixture.writes, "receipt").data,
      ).status,
      "succeeded",
    );
  },
);

Deno.test("receipt schema enforces terminal success and failure invariants", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  await executeDexPlanApply(
    { plan: oneTaskPlan({ planId: "receipt-invariants" }) },
    fixture.context,
    dependencies(adapter),
  );
  const success = DexPlanApplyReceiptSchema.parse(
    latestWrite(fixture.writes, "receipt").data,
  );
  assert.equal(
    DexPlanApplyReceiptSchema.safeParse({
      ...success,
      errorCode: "verification-failed",
    }).success,
    false,
  );
  const failure = {
    ...success,
    status: "failed",
    retryDisposition: "retry",
    errorCode: "verification-failed",
    resultName: null,
  };
  assert.equal(DexPlanApplyReceiptSchema.safeParse(failure).success, true);
  assert.equal(
    DexPlanApplyReceiptSchema.safeParse({ ...failure, errorCode: null })
      .success,
    false,
  );
  assert.equal(
    DexPlanApplyReceiptSchema.safeParse({
      ...failure,
      resultName: success.resultName,
    }).success,
    false,
  );
});

Deno.test("succeeded replay rejects inconsistent result mappings before re-emission", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  const plan = oneTaskPlan({ planId: "inconsistent-result-mappings" });
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
  const checkpointWrite = latestWrite(fixture.writes, "checkpoint");
  const checkpointBeforeReplay = structuredClone(checkpointWrite.data);
  const resultWrite = latestWrite(fixture.writes, "result");
  const result = DexPlanApplyResultSchema.parse(resultWrite.data);
  const mapping = result.mappings[0];
  assert.ok(mapping);
  const invalidMappings = [
    [{ ...mapping, dexTaskId: "wrong-task-id" }],
    [{ ...mapping, disposition: "attachedExisting" }],
    [mapping, mapping],
  ];
  for (const mappings of invalidMappings) {
    fixture.resources.set(resultWrite.name, { ...result, mappings });
    const writeCount = fixture.writes.length;
    await assertPlanFailure(
      executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
      "verification-failed",
    );
    assert.deepEqual(
      fixture.writes.slice(writeCount).map((write) => write.specName),
      ["receipt"],
    );
    assert.equal(
      DexPlanApplyReceiptSchema.parse(
        latestWrite(fixture.writes, "receipt").data,
      ).status,
      "failed",
    );
  }
  assert.deepEqual(
    fixture.resources.get(checkpointWrite.name),
    checkpointBeforeReplay,
  );
});

Deno.test("success persists result and receipt before the terminal checkpoint", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  await executeDexPlanApply(
    { plan: oneTaskPlan({ planId: "terminal-write-order" }) },
    fixture.context,
    dependencies(adapter),
  );

  assert.deepEqual(
    fixture.writes.slice(-3).map((write) => write.specName),
    ["result", "receipt", "checkpoint"],
  );
  assert.equal(
    DexPlanApplyCheckpointSchema.parse(fixture.writes.at(-1)?.data).status,
    "succeeded",
  );
});

Deno.test("duplicate client references fail before the first mutation", async () => {
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "duplicate-refs",
    tasks: [
      {
        kind: "create",
        clientRef: "same-task",
        name: "First",
        description: "First description",
        priority: 1,
        parent: { kind: "root" },
        blockedBy: [],
      },
      {
        kind: "create",
        clientRef: "same-task",
        name: "Second",
        description: "Second description",
        priority: 2,
        parent: { kind: "root" },
        blockedBy: [],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  await assertPlanFailure(
    executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
    "duplicate-client-reference",
  );
  assert.equal(adapter.createCalls.length, 0);
  assert.equal(
    DexPlanApplyReceiptSchema.parse(latestWrite(fixture.writes, "receipt").data)
      .errorCode,
    "duplicate-client-reference",
  );
  assert.equal(
    fixture.writes.some((write) => write.specName === "checkpoint"),
    false,
  );
});

Deno.test("inventory failure persists a retryable receipt before checkpoint creation", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.failListCall = 1;
  const fixture = fixtureContext();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: oneTaskPlan({ planId: "inventory-failure" }) },
      fixture.context,
      dependencies(adapter),
    ),
    "dex-list-failed",
  );

  const receipt = DexPlanApplyReceiptSchema.parse(
    latestWrite(fixture.writes, "receipt").data,
  );
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.retryDisposition, "retry");
  assert.equal(receipt.attempt, 1);
  assert.deepEqual(receipt.taskIdsByClientRef, {});
});

Deno.test(
  "receipt attempts advance across preflight failures into the first checkpoint",
  async () => {
    const expected = rawTask({
      id: "appears-later",
      name: "Appears later",
      description: "Approved existing task",
      priority: 5,
    });
    const plan = DexApprovedPlanSchema.parse({
      schemaVersion: 1,
      planId: "receipt-attempt-sequence",
      tasks: [
        {
          kind: "attachExisting",
          clientRef: "existing-task",
          selector: { kind: "id", taskId: expected.id },
          expected: {
            name: expected.name,
            description: expected.description,
            priority: expected.priority,
          },
          parent: { kind: "preserve" },
          addBlockedBy: [],
        },
      ],
    });
    const adapter = new FakeDexPlanCommandAdapter();
    const fixture = fixtureContext();
    for (const attempt of [1, 2]) {
      await assertPlanFailure(
        executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
        "existing-task-not-found",
      );
      assert.equal(
        DexPlanApplyReceiptSchema.parse(
          latestWrite(fixture.writes, "receipt").data,
        ).attempt,
        attempt,
      );
    }
    assert.equal(
      fixture.writes.some((write) => write.specName === "checkpoint"),
      false,
    );

    adapter.tasks.set(expected.id, expected);
    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
    assert.equal(
      DexPlanApplyCheckpointSchema.parse(
        latestWrite(fixture.writes, "checkpoint").data,
      ).attempt,
      3,
    );
    assert.equal(
      DexPlanApplyReceiptSchema.parse(
        latestWrite(fixture.writes, "receipt").data,
      ).attempt,
      3,
    );
  },
);

Deno.test("missing parent reference fails before the first mutation", async () => {
  const plan = oneTaskPlan({
    planId: "missing-reference",
    tasks: [
      {
        kind: "create",
        clientRef: "orphan-task",
        name: "Orphan task",
        description: "Orphan description",
        priority: 1,
        parent: { kind: "reference", clientRef: "missing-parent" },
        blockedBy: [],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan },
      fixtureContext().context,
      dependencies(adapter),
    ),
    "missing-client-reference",
  );
  assert.equal(adapter.createCalls.length, 0);
});

Deno.test("hierarchy and blocker cycles fail before mutation", async () => {
  const hierarchyPlan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "hierarchy-cycle",
    tasks: [
      {
        kind: "create",
        clientRef: "alpha-task",
        name: "Alpha",
        description: "Alpha description",
        priority: 1,
        parent: { kind: "reference", clientRef: "beta-task" },
        blockedBy: [],
      },
      {
        kind: "create",
        clientRef: "beta-task",
        name: "Beta",
        description: "Beta description",
        priority: 2,
        parent: { kind: "reference", clientRef: "alpha-task" },
        blockedBy: [],
      },
    ],
  });
  const hierarchyAdapter = new FakeDexPlanCommandAdapter();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: hierarchyPlan },
      fixtureContext().context,
      dependencies(hierarchyAdapter),
    ),
    "hierarchy-cycle",
  );
  assert.equal(hierarchyAdapter.createCalls.length, 0);

  const blockerPlan = DexApprovedPlanSchema.parse({
    ...hierarchyPlan,
    planId: "blocker-cycle",
    tasks: hierarchyPlan.tasks.map((task, index) => ({
      ...task,
      parent: { kind: "root" as const },
      blockedBy: [hierarchyPlan.tasks[index === 0 ? 1 : 0].clientRef],
    })),
  });
  const blockerAdapter = new FakeDexPlanCommandAdapter();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: blockerPlan },
      fixtureContext().context,
      dependencies(blockerAdapter),
    ),
    "blocker-cycle",
  );
  assert.equal(blockerAdapter.createCalls.length, 0);
});

Deno.test("fourth hierarchy level fails before mutation", async () => {
  const refs = ["root-task", "level-one", "level-two", "level-three"];
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "depth-overflow",
    tasks: refs.map((clientRef, index) => ({
      kind: "create" as const,
      clientRef,
      name: clientRef,
      description: `${clientRef} description`,
      priority: index,
      parent: index === 0
        ? { kind: "root" as const }
        : { kind: "reference" as const, clientRef: refs[index - 1] },
      blockedBy: [],
    })),
  });
  const adapter = new FakeDexPlanCommandAdapter();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan },
      fixtureContext().context,
      dependencies(adapter),
    ),
    "hierarchy-depth-exceeded",
  );
  assert.equal(adapter.createCalls.length, 0);
});

Deno.test("missing and ambiguous existing selectors fail closed", async () => {
  const existingPlan = (planId: string): DexApprovedPlan =>
    DexApprovedPlanSchema.parse({
      schemaVersion: 1,
      planId,
      tasks: [
        {
          kind: "attachExisting",
          clientRef: "existing-task",
          selector: { kind: "exactName", name: "Duplicate name" },
          expected: {
            name: "Duplicate name",
            description: "Description",
            priority: 1,
          },
          parent: { kind: "preserve" },
          addBlockedBy: [],
        },
      ],
    });

  const missingAdapter = new FakeDexPlanCommandAdapter();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: existingPlan("missing-existing") },
      fixtureContext().context,
      dependencies(missingAdapter),
    ),
    "existing-task-not-found",
  );

  const duplicateTasks = [
    rawTask({
      id: "duplicate-1",
      name: "Duplicate name",
      description: "Description",
      priority: 1,
    }),
    rawTask({
      id: "duplicate-2",
      name: "Duplicate name",
      description: "Description",
      priority: 1,
    }),
  ];
  const ambiguousAdapter = new FakeDexPlanCommandAdapter(duplicateTasks);
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: existingPlan("ambiguous-existing") },
      fixtureContext().context,
      dependencies(ambiguousAdapter),
    ),
    "existing-task-ambiguous",
  );
  assert.equal(ambiguousAdapter.updateCalls.length, 0);
});

Deno.test(
  "retry uses the checkpoint mapping instead of re-resolving an existing selector",
  async () => {
    const selected = rawTask({
      id: "selected-existing",
      name: "Selector target",
      description: "Approved selector target",
      priority: 8,
    });
    const plan = DexApprovedPlanSchema.parse({
      schemaVersion: 1,
      planId: "authoritative-retry-mapping",
      tasks: [
        {
          kind: "attachExisting",
          clientRef: "selected-task",
          selector: { kind: "exactName", name: selected.name },
          expected: {
            name: selected.name,
            description: selected.description,
            priority: selected.priority,
          },
          parent: { kind: "preserve" },
          addBlockedBy: [],
        },
        {
          kind: "create",
          clientRef: "new-task",
          name: "New task",
          description: "New task description",
          priority: 9,
          parent: { kind: "root" },
          blockedBy: [],
        },
      ],
    });
    const adapter = new FakeDexPlanCommandAdapter([selected]);
    adapter.failCreateCall = 1;
    const fixture = fixtureContext();
    await assertPlanFailure(
      executeDexPlanApply({ plan }, fixture.context, dependencies(adapter)),
      "dex-create-failed",
    );
    const failedCheckpoint = DexPlanApplyCheckpointSchema.parse(
      latestWrite(fixture.writes, "checkpoint").data,
    );
    assert.equal(
      failedCheckpoint.taskIdsByClientRef["selected-task"],
      selected.id,
    );

    adapter.tasks.set(
      "later-duplicate",
      rawTask({ ...selected, id: "later-duplicate" }),
    );
    adapter.failCreateCall = null;
    await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));

    const result = DexPlanApplyResultSchema.parse(
      latestWrite(fixture.writes, "result").data,
    );
    assert.equal(result.taskIdsByClientRef["selected-task"], selected.id);
  },
);

Deno.test("existing hierarchy detaches every moving task before reparenting", async () => {
  const parent = rawTask({
    id: "existing-parent",
    name: "Existing parent",
    description: "Existing parent description",
    priority: 1,
    children: ["existing-child"],
  });
  const child = rawTask({
    id: "existing-child",
    parent_id: parent.id,
    name: "Existing child",
    description: "Existing child description",
    priority: 2,
  });
  const plan = DexApprovedPlanSchema.parse({
    schemaVersion: 1,
    planId: "safe-existing-reparent",
    tasks: [
      {
        kind: "attachExisting",
        clientRef: "alpha-parent",
        selector: { kind: "id", taskId: parent.id },
        expected: {
          name: parent.name,
          description: parent.description,
          priority: parent.priority,
        },
        parent: { kind: "reference", clientRef: "beta-child" },
        addBlockedBy: [],
      },
      {
        kind: "attachExisting",
        clientRef: "beta-child",
        selector: { kind: "id", taskId: child.id },
        expected: {
          name: child.name,
          description: child.description,
          priority: child.priority,
        },
        parent: { kind: "root" },
        addBlockedBy: [],
      },
    ],
  });
  const adapter = new FakeDexPlanCommandAdapter([parent, child]);
  await executeDexPlanApply(
    { plan },
    fixtureContext().context,
    dependencies(adapter),
  );

  assert.deepEqual(adapter.updateCalls, [
    { id: child.id, parent_id: null },
    { id: parent.id, parent_id: child.id },
  ]);
  assert.equal(adapter.tasks.get(parent.id)?.parent_id, child.id);
  assert.equal(adapter.tasks.get(child.id)?.parent_id, null);
});

Deno.test("invalid inverse hierarchy and blocker edges fail before mutation", async () => {
  const invalidHierarchy = [
    rawTask({
      id: "inverse-parent",
      name: "Inverse parent",
      children: [],
    }),
    rawTask({
      id: "inverse-child",
      parent_id: "inverse-parent",
      name: "Inverse child",
    }),
  ];
  const hierarchyAdapter = new FakeDexPlanCommandAdapter(invalidHierarchy);
  const hierarchyFixture = fixtureContext();
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: oneTaskPlan({ planId: "invalid-inverse-hierarchy" }) },
      hierarchyFixture.context,
      dependencies(hierarchyAdapter),
    ),
    "existing-graph-invalid",
  );
  assert.equal(hierarchyAdapter.createCalls.length, 0);
  assert.equal(
    DexPlanApplyReceiptSchema.parse(
      latestWrite(hierarchyFixture.writes, "receipt").data,
    ).errorCode,
    "existing-graph-invalid",
  );

  const invalidBlockers = [
    rawTask({ id: "inverse-blocker", name: "Inverse blocker", blocks: [] }),
    rawTask({
      id: "inverse-blocked",
      name: "Inverse blocked",
      blockedBy: ["inverse-blocker"],
    }),
  ];
  const blockerAdapter = new FakeDexPlanCommandAdapter(invalidBlockers);
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: oneTaskPlan({ planId: "invalid-inverse-blockers" }) },
      fixtureContext().context,
      dependencies(blockerAdapter),
    ),
    "existing-graph-invalid",
  );
  assert.equal(blockerAdapter.createCalls.length, 0);
});

Deno.test("idempotency conflict rejects changed content under the same plan id", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  const plan = oneTaskPlan();
  await executeDexPlanApply({ plan }, fixture.context, dependencies(adapter));
  const checkpointWrite = latestWrite(fixture.writes, "checkpoint");
  const checkpointBeforeConflict = structuredClone(checkpointWrite.data);
  const originalTask = plan.tasks[0];
  assert.equal(originalTask.kind, "create");
  if (originalTask.kind !== "create") {
    throw new TypeError("Expected create fixture");
  }
  const changed = oneTaskPlan({
    tasks: [
      {
        ...originalTask,
        name: "Changed after approval",
      },
    ],
  });
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: changed },
      fixture.context,
      dependencies(adapter),
    ),
    "idempotency-conflict",
  );
  assert.equal(adapter.createCalls.length, 1);
  assert.deepEqual(
    fixture.resources.get(checkpointWrite.name),
    checkpointBeforeConflict,
  );
  assert.equal(
    DexPlanApplyReceiptSchema.parse(latestWrite(fixture.writes, "receipt").data)
      .errorCode,
    "idempotency-conflict",
  );
});

Deno.test("same-repository invocations are serialized and share the succeeded result", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  adapter.listDelayMs = 5;
  const resources = new Map<string, Record<string, unknown>>();
  const first = fixtureContext("owner-a", resources);
  const second = fixtureContext("owner-a", resources);
  const plan = oneTaskPlan({ planId: "concurrent-plan" });
  await Promise.all([
    executeDexPlanApply({ plan }, first.context, dependencies(adapter)),
    executeDexPlanApply({ plan }, second.context, dependencies(adapter)),
  ]);
  assert.equal(adapter.maxConcurrentCalls, 1);
  assert.equal(adapter.createCalls.length, 1);
  assert.equal(adapter.tasks.size, 1);
});

Deno.test("approved-plan graph boundaries reject unknown fields", () => {
  const plan = {
    ...oneTaskPlan({ planId: "strict-approved-plan" }),
    unapprovedMutation: true,
  };
  assert.throws(() => DexPlanApplyArgsSchema.parse({ plan }));
});

Deno.test("repository verification accepts only the canonical repository-local Dex store", async () => {
  const repository = await Deno.makeTempDir({ prefix: "dex-plan-repository-" });
  const external = await Deno.makeTempDir({ prefix: "dex-plan-external-" });
  try {
    await Deno.mkdir(`${repository}/.dex`);
    const canonicalDexDirectory = await Deno.realPath(`${repository}/.dex`);
    await verifyRepositoryLocalDexStore(
      repository,
      () => Promise.resolve(canonicalDexDirectory),
    );
    const failure = await assertPlanFailure(
      verifyRepositoryLocalDexStore(
        repository,
        () => Deno.realPath(external),
      ),
      "repository-layout-invalid",
    );
    assert.equal(failure.retryDisposition, "do-not-retry");
  } finally {
    await Deno.remove(repository, { recursive: true });
    await Deno.remove(external, { recursive: true });
  }
});

Deno.test("repository verification rejects a symlinked Dex store", async () => {
  const repository = await Deno.makeTempDir({ prefix: "dex-plan-repository-" });
  const external = await Deno.makeTempDir({ prefix: "dex-plan-external-" });
  try {
    await Deno.symlink(external, `${repository}/.dex`);
    await assertPlanFailure(
      verifyRepositoryLocalDexStore(
        repository,
        () => Deno.realPath(external),
      ),
      "repository-layout-invalid",
    );
  } finally {
    await Deno.remove(repository, { recursive: true });
    await Deno.remove(external, { recursive: true });
  }
});

Deno.test("bounded Dex process aborts on timeout and output overflow", async () => {
  const repository = await Deno.makeTempDir({ prefix: "dex-plan-process-" });
  try {
    await assert.rejects(
      () =>
        runBoundedDexProcess(
          repository,
          ["-c", "sleep 1"],
          null,
          { executable: "/bin/sh", timeoutMs: 10 },
        ),
      (error: unknown) =>
        error instanceof DexCommandBoundaryError &&
        error.boundary === "timeout",
    );
    await assert.rejects(
      () =>
        runBoundedDexProcess(
          repository,
          ["-c", "head -c 1024 /dev/zero"],
          null,
          { executable: "/bin/sh", maxOutputBytes: 64 },
        ),
      (error: unknown) =>
        error instanceof DexCommandBoundaryError &&
        error.boundary === "output-limit",
    );
  } finally {
    await Deno.remove(repository, { recursive: true });
  }
});

Deno.test("repository layout failure persists a non-retryable receipt before locking", async () => {
  const adapter = new FakeDexPlanCommandAdapter();
  const fixture = fixtureContext();
  const planDependencies = dependencies(adapter);
  let lockCalls = 0;
  planDependencies.verifyRepository = () =>
    Promise.reject(
      new DexPlanApplierError(
        "repository-layout-invalid",
        "Dex storage is not a verified repository-local directory",
        "do-not-retry",
      ),
    );
  planDependencies.repositoryLock = {
    runExclusive: (_repoDir, operation) => {
      lockCalls += 1;
      return operation();
    },
  };
  await assertPlanFailure(
    executeDexPlanApply(
      { plan: oneTaskPlan({ planId: "repository-layout-failure" }) },
      fixture.context,
      planDependencies,
    ),
    "repository-layout-invalid",
  );
  assert.equal(lockCalls, 0);
  assert.equal(adapter.listCalls, 0);
  const receipt = DexPlanApplyReceiptSchema.parse(
    latestWrite(fixture.writes, "receipt").data,
  );
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.retryDisposition, "do-not-retry");
});

Deno.test("public plan errors discard raw filesystem causes", async () => {
  const pathSentinel = "/tmp/dex-plan-private-path-sentinel-does-not-exist";
  try {
    await verifyRepositoryLocalDexStore(
      pathSentinel,
      () => Promise.reject(new Error("stderr-secret-sentinel")),
    );
    assert.fail("Expected repository verification to fail");
  } catch (error) {
    assert.ok(error instanceof DexPlanApplierError);
    assert.equal(
      error.message,
      "Dex storage is not a verified repository-local directory",
    );
    assert.equal(error.cause, undefined);
    const publicFields = Object.fromEntries(
      Object.getOwnPropertyNames(error).map((name) => [
        name,
        Reflect.get(error, name),
      ]),
    );
    const serialized = JSON.stringify(publicFields);
    assert.equal(serialized.includes(pathSentinel), false);
    assert.equal(serialized.includes("stderr-secret-sentinel"), false);
  }
});
