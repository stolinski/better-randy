import assert from "node:assert/strict";

import {
  DexRepositoryLockOwnershipError,
  DexRepositoryLockTimeoutError,
  PASSTHROUGH_DEX_REPOSITORY_LOCK,
} from "./dex-repository-lock.ts";

import {
  type DexCommandResult,
  type DexMcpUpdateTaskArguments,
  type DexTaskCommandAdapter,
  DexTaskCompleteArgsSchema,
  DexTaskGetArgsSchema,
  DexTaskSnapshotSchema,
  type DexTaskTrackerDependencies,
  DexTaskTrackerError,
  type DexTaskTrackerMethodContext,
  DexTaskTrackerReceiptSchema,
  executeDexTaskAddNote,
  executeDexTaskComplete,
  executeDexTaskGet,
  executeDexTaskReopen,
  executeDexTaskStart,
} from "./dex-task-tracker-adapter.ts";
import { model } from "./dex-task-tracker.ts";

const FIXED_NOW = "2026-08-05T18:30:00.000Z";

type RawDexTask = {
  id: string;
  parent_id: string | null;
  name: string;
  description: string;
  priority: number;
  completed: boolean;
  result: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  blockedBy: Array<string | { id: string; name?: string }>;
  blocks: Array<string | { id: string; name?: string }>;
  children: Array<string | { id: string; name?: string }>;
  ancestors: unknown[];
  subtasks: Record<string, unknown>;
};

type FixtureWrite = {
  specName: string;
  name: string;
  data: Record<string, unknown>;
};

function rawDexTask(overrides: Partial<RawDexTask> = {}): RawDexTask {
  return {
    id: "task-123",
    parent_id: "parent-456",
    name: "Fixture task",
    description: "Original description",
    priority: 73,
    completed: false,
    result: null,
    metadata: { source: "fixture" },
    created_at: "2026-08-05T12:00:00.000Z",
    updated_at: "2026-08-05T12:00:00.000Z",
    started_at: null,
    completed_at: null,
    blockedBy: ["blocker-1"],
    blocks: ["blocked-1"],
    children: ["child-1"],
    ancestors: [{ id: "presentation-only" }],
    subtasks: { pending: 1 },
    ...overrides,
  };
}

class FakeDexCommandAdapter implements DexTaskCommandAdapter {
  readonly cliCalls: Array<{ cwd: string; args: string[] }> = [];
  readonly mcpCalls: Array<{ cwd: string; args: DexMcpUpdateTaskArguments }> =
    [];
  task: RawDexTask | null;
  malformedShowJson = false;
  failMutation = false;
  showDelayMs = 0;
  maxConcurrentRuns = 0;
  #activeRuns = 0;

  constructor(task: RawDexTask | null = rawDexTask()) {
    this.task = task;
  }

  async run(args: readonly string[], cwd: string): Promise<DexCommandResult> {
    this.cliCalls.push({ cwd, args: [...args] });
    this.#activeRuns += 1;
    this.maxConcurrentRuns = Math.max(this.maxConcurrentRuns, this.#activeRuns);
    try {
      if (this.showDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.showDelayMs));
      }
      return this.#executeCommand(args);
    } finally {
      this.#activeRuns -= 1;
    }
  }

  #executeCommand(args: readonly string[]): DexCommandResult {
    return args[0] === "show"
      ? this.#showTask(args[1])
      : this.#mutateTask(args);
  }

  #showTask(taskId: string | undefined): DexCommandResult {
    if (this.task === null) {
      return { code: 1, stdout: "", stderr: `Task '${taskId}' not found` };
    }
    return {
      code: 0,
      stdout: this.malformedShowJson ? "{not-json" : JSON.stringify(this.task),
      stderr: "",
    };
  }

  #mutateTask(args: readonly string[]): DexCommandResult {
    if (this.failMutation) {
      return { code: 9, stdout: "", stderr: "fixture command failure" };
    }
    if (this.task === null) {
      return { code: 1, stdout: "", stderr: "Task not found" };
    }
    return args[0] === "start" ? this.#startTask() : this.#completeTask(args);
  }

  #startTask(): DexCommandResult {
    if (this.task === null) {
      return { code: 1, stdout: "", stderr: "Task not found" };
    }
    this.task.started_at = FIXED_NOW;
    this.task.updated_at = FIXED_NOW;
    return { code: 0, stdout: "", stderr: "" };
  }

  #completeTask(args: readonly string[]): DexCommandResult {
    if (args[0] !== "complete" || this.task === null) {
      return { code: 2, stdout: "", stderr: "Unexpected fake command" };
    }
    this.task.completed = true;
    this.task.result = args[3] ?? null;
    this.task.completed_at = FIXED_NOW;
    this.task.updated_at = FIXED_NOW;
    return { code: 0, stdout: "", stderr: "" };
  }

  updateTask(cwd: string, args: DexMcpUpdateTaskArguments): Promise<void> {
    this.mcpCalls.push({ cwd, args });
    if (this.task === null) throw new Error("Fake task missing");
    if ("description" in args) {
      this.task.description = args.description;
    } else {
      this.task.completed = args.completed;
      this.task.started_at = args.started_at;
      this.task.completed_at = null;
    }
    this.task.updated_at = FIXED_NOW;
    return Promise.resolve();
  }
}

function fixtureContext(ownerToken = "owner-token-exact"): {
  context: DexTaskTrackerMethodContext;
  writes: FixtureWrite[];
} {
  const writes: FixtureWrite[] = [];
  const resources = new Map<string, Record<string, unknown>>();
  return {
    writes,
    context: {
      repoDir: "/fixture/repository",
      globalArgs: { ownerToken },
      logger: { info: () => undefined, warning: () => undefined },
      readResource: (name) => Promise.resolve(resources.get(name) ?? null),
      writeResource: (specName, name, data) => {
        writes.push({ specName, name, data });
        resources.set(name, data);
        return Promise.resolve({ name });
      },
    },
  };
}

function dependencies(
  commandAdapter: DexTaskCommandAdapter,
): DexTaskTrackerDependencies {
  return {
    commandAdapter,
    repositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
    now: () => FIXED_NOW,
  };
}

function receiptWrites(writes: FixtureWrite[]): FixtureWrite[] {
  return writes.filter((write) => write.specName === "receipt");
}

function taskWrites(writes: FixtureWrite[]): FixtureWrite[] {
  return writes.filter((write) => write.specName === "task");
}

async function assertTrackerFailure(
  operation: Promise<unknown>,
  expectedCode: DexTaskTrackerError["errorCode"],
): Promise<void> {
  try {
    await operation;
    assert.fail(`Expected ${expectedCode}`);
  } catch (error) {
    assert.ok(error instanceof DexTaskTrackerError);
    assert.equal(error.errorCode, expectedCode);
  }
}

Deno.test("model exposes the locked type, version, resources, and method set", () => {
  assert.equal(model.type, "@club_aqua_back_deck/dex-task-tracker");
  assert.equal(model.version, "2026.08.15.1");
  assert.deepEqual(Object.keys(model.resources).sort(), [
    "ready-leaf-claim",
    "ready-leaf-intent",
    "receipt",
    "task",
  ]);
  assert.deepEqual(Object.keys(model.methods).sort(), [
    "add-note",
    "claim-next-ready",
    "complete",
    "get",
    "reopen",
    "start",
  ]);
  assert.equal(
    DexTaskCompleteArgsSchema.safeParse({
      taskId: "task-123",
      result: "Done",
      commit: { kind: "noCommit" },
    }).success,
    true,
  );
  assert.deepEqual(
    DexTaskGetArgsSchema.parse({
      taskId: "task-123",
      ownerToken: "evaluated-global",
    }),
    { taskId: "task-123" },
  );
});

Deno.test(
  "get normalizes presentation-rich Dex JSON and preserves owner and priority exactly",
  async () => {
    const ownerToken = "  owner/token:EXACT\t";
    const adapter = new FakeDexCommandAdapter();
    const fixture = fixtureContext(ownerToken);
    await executeDexTaskGet(
      { taskId: "task-123" },
      fixture.context,
      dependencies(adapter),
    );

    assert.deepEqual(adapter.cliCalls[0], {
      cwd: "/fixture/repository",
      args: ["show", "task-123", "--json"],
    });
    const snapshot = DexTaskSnapshotSchema.parse(
      taskWrites(fixture.writes)[0].data,
    );
    assert.equal(snapshot.ownerToken, ownerToken);
    assert.equal(snapshot.priority, 73);
    assert.equal(snapshot.parentId, "parent-456");
    assert.equal("ancestors" in snapshot, false);
    const receipt = DexTaskTrackerReceiptSchema.parse(
      receiptWrites(fixture.writes)[0].data,
    );
    assert.equal(receipt.ownerToken, ownerToken);
    assert.equal(receipt.task?.priority, 73);
  },
);

Deno.test("mutations use the repository lock while get remains lock-free", async () => {
  const adapter = new FakeDexCommandAdapter();
  const trackerDependencies = dependencies(adapter);
  let lockCalls = 0;
  trackerDependencies.repositoryLock = {
    runExclusive: async (_repoDir, operation) => {
      lockCalls += 1;
      return await operation();
    },
  };

  await executeDexTaskGet(
    { taskId: "task-123" },
    fixtureContext().context,
    trackerDependencies,
  );
  assert.equal(lockCalls, 0);
  await executeDexTaskStart(
    { taskId: "task-123" },
    fixtureContext().context,
    trackerDependencies,
  );
  assert.equal(lockCalls, 1);
});

Deno.test("pre-operation repository lock failure persists a stable tracker receipt", async () => {
  const adapter = new FakeDexCommandAdapter();
  const fixture = fixtureContext();
  const trackerDependencies = dependencies(adapter);
  trackerDependencies.repositoryLock = {
    runExclusive: () =>
      Promise.reject(
        new DexRepositoryLockTimeoutError("/fixture/repository/.dex/lock", 10),
      ),
  };

  await assertTrackerFailure(
    executeDexTaskStart(
      { taskId: "task-123" },
      fixture.context,
      trackerDependencies,
    ),
    "repository-lock-acquisition-failed",
  );
  assert.equal(adapter.cliCalls.length, 0);
  assert.equal(taskWrites(fixture.writes).length, 0);
  const receipt = DexTaskTrackerReceiptSchema.parse(
    receiptWrites(fixture.writes)[0].data,
  );
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.errorCode, "repository-lock-acquisition-failed");
});

Deno.test("post-commit repository lock cleanup failure preserves tracker success", async () => {
  const adapter = new FakeDexCommandAdapter();
  const fixture = fixtureContext();
  const trackerDependencies = dependencies(adapter);
  trackerDependencies.repositoryLock = {
    runExclusive: async (_repoDir, operation) => {
      await operation();
      throw new DexRepositoryLockOwnershipError(
        "/fixture/repository/.dex/lock",
      );
    },
  };

  const result = await executeDexTaskStart(
    { taskId: "task-123" },
    fixture.context,
    trackerDependencies,
  );
  assert.equal(adapter.cliCalls.length, 3);
  assert.equal(receiptWrites(fixture.writes).length, 1);
  assert.equal(
    DexTaskTrackerReceiptSchema.parse(receiptWrites(fixture.writes)[0].data)
      .status,
    "succeeded",
  );
  assert.deepEqual(
    result.dataHandles.map((handle) => handle.name).sort(),
    fixture.writes.map((write) => write.name).sort(),
  );
});

Deno.test("get normalizes expanded Dex relationship objects to stable task ids", async () => {
  const adapter = new FakeDexCommandAdapter(
    rawDexTask({
      blockedBy: [{ id: "blocker-1", name: "Expanded blocker" }],
      blocks: [{ id: "blocked-1", name: "Expanded blocked task" }],
      children: [{ id: "child-1", name: "Expanded child" }],
    }),
  );
  const fixture = fixtureContext();
  await executeDexTaskGet(
    { taskId: "task-123" },
    fixture.context,
    dependencies(adapter),
  );
  const snapshot = DexTaskSnapshotSchema.parse(
    taskWrites(fixture.writes)[0].data,
  );
  assert.deepEqual(snapshot.blockedBy, ["blocker-1"]);
  assert.deepEqual(snapshot.blocks, ["blocked-1"]);
  assert.deepEqual(snapshot.children, ["child-1"]);
});

Deno.test("not-found fails closed with a deterministic receipt name and code", async () => {
  const request = { action: "get" as const, args: { taskId: "missing-1" } };
  const names: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const adapter = new FakeDexCommandAdapter(null);
    const fixture = fixtureContext();
    await assertTrackerFailure(
      executeDexTaskGet(request.args, fixture.context, dependencies(adapter)),
      "task-not-found",
    );
    const write = receiptWrites(fixture.writes)[0];
    names.push(write.name);
    const receipt = DexTaskTrackerReceiptSchema.parse(write.data);
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.errorCode, "task-not-found");
    assert.equal(receipt.task, null);
    assert.equal(JSON.stringify(receipt).includes("not found"), false);
  }
  assert.equal(names.length, 2);
  assert.equal(names[0], names[1]);
  assert.match(names[0], /^receipt-[0-9a-f]{64}$/);
});

Deno.test("start rejects duplicate starts before invoking a mutation", async () => {
  const adapter = new FakeDexCommandAdapter(
    rawDexTask({ started_at: FIXED_NOW }),
  );
  const fixture = fixtureContext();
  await assertTrackerFailure(
    executeDexTaskStart(
      { taskId: "task-123" },
      fixture.context,
      dependencies(adapter),
    ),
    "task-already-started",
  );
  assert.deepEqual(
    adapter.cliCalls.map((call) => call.args),
    [["show", "task-123", "--json"]],
  );
  const receipt = DexTaskTrackerReceiptSchema.parse(
    receiptWrites(fixture.writes)[0].data,
  );
  assert.equal(receipt.errorCode, "task-already-started");
  assert.equal(receipt.task?.startedAt, FIXED_NOW);
});

Deno.test("complete requires authoritative current-cycle human approval when the repository enables the gate", async () => {
  const authorizationKey = "fixture-completion-authorization-key";
  const adapter = new FakeDexCommandAdapter(
    rawDexTask({ started_at: FIXED_NOW }),
  );
  const fixture = fixtureContext();
  fixture.context.globalArgs = {
    ownerToken: "owner-token-exact",
    completionApprovalGateId: "completion-approval",
    completionFactoryName: "fixture-delivery",
    completionAuthorizationKey: authorizationKey,
  };
  const approved = DexTaskCompleteArgsSchema.parse({
    taskId: "task-123",
    result: "Done",
    commit: { kind: "noCommit" },
    factoryModelName: "fixture-delivery",
    factoryState: {
      workItem: "task-123",
      stageId: "terminal-cleanup",
      cycles: { postflight: 2 },
      dispatches: {},
      enteredAt: FIXED_NOW,
      status: "active",
      definitionVersion: 1,
      startedAt: FIXED_NOW,
    },
    reconciliation: {
      name: "reconciliation",
      workItem: "task-123",
      stageId: "reconciliation",
      cycle: 1,
      payload: {
        completionResult: "Done",
        commit: { kind: "noCommit" },
      },
      recordedAt: FIXED_NOW,
    },
    postflightEvidence: {
      name: "postflight-run",
      workItem: "task-123",
      stageId: "postflight",
      cycle: 2,
      payload: { status: "succeeded" },
      recordedAt: FIXED_NOW,
    },
    humanApproval: {
      gateId: "completion-approval",
      workItem: "task-123",
      decision: "approved",
      actor: "human@example.test",
      stageId: "postflight",
      cycle: 2,
      decidedAt: FIXED_NOW,
    },
    completionSourceNames: {
      factoryState: "state-task-123",
      reconciliation: "artifact-task-123-reconciliation",
      postflightEvidence: "evidence-task-123-postflight-run",
      humanApproval: "approval-task-123-completion-approval",
    },
    completionAuthorizationCapability: authorizationKey,
  });

  for (
    const rejected of [
      {
        taskId: "task-123",
        result: "Done",
        commit: { kind: "noCommit" as const },
      },
      {
        ...approved,
        humanApproval: { ...approved.humanApproval!, cycle: 1 },
      },
      { ...approved, result: "Changed after approval" },
      {
        ...approved,
        completionAuthorizationCapability: "caller-minted-authorization-value",
      },
    ]
  ) {
    assert.throws(
      () =>
        executeDexTaskComplete(
          rejected,
          fixture.context,
          dependencies(adapter),
        ),
      (error: unknown) =>
        error instanceof DexTaskTrackerError &&
        error.errorCode === "human-completion-approval-required",
    );
  }
  assert.equal(adapter.cliCalls.length, 0);

  await executeDexTaskComplete(
    approved,
    fixture.context,
    dependencies(adapter),
  );
  assert.equal(adapter.task?.completed, true);
});

Deno.test("complete rejects an already completed task", async () => {
  const adapter = new FakeDexCommandAdapter(
    rawDexTask({
      completed: true,
      started_at: FIXED_NOW,
      completed_at: FIXED_NOW,
    }),
  );
  const fixture = fixtureContext();
  await assertTrackerFailure(
    executeDexTaskComplete(
      { taskId: "task-123", result: "Done", commit: { kind: "noCommit" } },
      fixture.context,
      dependencies(adapter),
    ),
    "task-already-completed",
  );
  assert.equal(adapter.cliCalls.length, 1);
});

Deno.test("complete rejects a task that has not started", async () => {
  const adapter = new FakeDexCommandAdapter();
  const fixture = fixtureContext();
  await assertTrackerFailure(
    executeDexTaskComplete(
      { taskId: "task-123", result: "Done", commit: { kind: "noCommit" } },
      fixture.context,
      dependencies(adapter),
    ),
    "task-not-started",
  );
  assert.equal(adapter.cliCalls.length, 1);
});

Deno.test("complete uses the exact structured result and commit argument vector", async () => {
  const adapter = new FakeDexCommandAdapter(
    rawDexTask({ started_at: FIXED_NOW }),
  );
  const fixture = fixtureContext();
  const result = "Completed without shell interpolation; $(ignored)";
  await executeDexTaskComplete(
    {
      taskId: "task-123",
      result,
      commit: {
        kind: "commit",
        sha: "0123456789abcdef0123456789abcdef01234567",
      },
    },
    fixture.context,
    dependencies(adapter),
  );

  assert.deepEqual(adapter.cliCalls[1].args, [
    "complete",
    "task-123",
    "--result",
    result,
    "--commit",
    "0123456789abcdef0123456789abcdef01234567",
  ]);
  assert.equal(
    DexTaskSnapshotSchema.parse(taskWrites(fixture.writes)[0].data).completed,
    true,
  );
});

Deno.test(
  "reopen uses the official MCP update shape and preserves the existing result",
  async () => {
    const adapter = new FakeDexCommandAdapter(
      rawDexTask({
        completed: true,
        started_at: FIXED_NOW,
        completed_at: FIXED_NOW,
        result: "Existing completion result",
      }),
    );
    const fixture = fixtureContext();
    await executeDexTaskReopen(
      { taskId: "task-123" },
      fixture.context,
      dependencies(adapter),
    );

    assert.deepEqual(adapter.mcpCalls, [
      {
        cwd: "/fixture/repository",
        args: { id: "task-123", completed: false, started_at: null },
      },
    ]);
    const snapshot = DexTaskSnapshotSchema.parse(
      taskWrites(fixture.writes)[0].data,
    );
    assert.equal(snapshot.completed, false);
    assert.equal(snapshot.startedAt, null);
    assert.equal(snapshot.result, "Existing completion result");
  },
);

Deno.test("reopen rejects an incomplete task before calling MCP", async () => {
  const adapter = new FakeDexCommandAdapter();
  const fixture = fixtureContext();
  await assertTrackerFailure(
    executeDexTaskReopen(
      { taskId: "task-123" },
      fixture.context,
      dependencies(adapter),
    ),
    "task-not-completed",
  );
  assert.equal(adapter.mcpCalls.length, 0);
});

Deno.test(
  "add-note appends the stable Markdown block through structured MCP arguments",
  async () => {
    const ownerToken = "factory-owner-token/EXACT";
    const adapter = new FakeDexCommandAdapter();
    const fixture = fixtureContext(ownerToken);
    await executeDexTaskAddNote(
      { taskId: "task-123", note: "Verified fixture output." },
      fixture.context,
      dependencies(adapter),
    );

    assert.equal(adapter.mcpCalls.length, 1);
    const update = adapter.mcpCalls[0].args;
    assert.ok("description" in update);
    assert.equal(
      update.description,
      [
        "Original description",
        "",
        "<!-- dex-task-tracker:note -->",
        "### Dex task note",
        "",
        `- Occurred at: ${FIXED_NOW}`,
        `- Owner: ${ownerToken}`,
        "",
        "Verified fixture output.",
        "<!-- /dex-task-tracker:note -->",
      ].join("\n"),
    );
    const snapshot = DexTaskSnapshotSchema.parse(
      taskWrites(fixture.writes)[0].data,
    );
    assert.equal(snapshot.ownerToken, ownerToken);
    assert.equal(snapshot.description, update.description);
  },
);

Deno.test("malformed Dex JSON persists invalid-json and throws", async () => {
  const adapter = new FakeDexCommandAdapter();
  adapter.malformedShowJson = true;
  const fixture = fixtureContext();
  await assertTrackerFailure(
    executeDexTaskGet(
      { taskId: "task-123" },
      fixture.context,
      dependencies(adapter),
    ),
    "invalid-json",
  );
  const receipt = DexTaskTrackerReceiptSchema.parse(
    receiptWrites(fixture.writes)[0].data,
  );
  assert.equal(receipt.errorCode, "invalid-json");
  assert.equal(JSON.stringify(receipt).includes("{not-json"), false);
});

Deno.test("nonzero Dex mutation persists command-failed without stderr", async () => {
  const adapter = new FakeDexCommandAdapter();
  adapter.failMutation = true;
  const fixture = fixtureContext();
  await assertTrackerFailure(
    executeDexTaskStart(
      { taskId: "task-123" },
      fixture.context,
      dependencies(adapter),
    ),
    "command-failed",
  );
  assert.deepEqual(
    adapter.cliCalls.map((call) => call.args),
    [
      ["show", "task-123", "--json"],
      ["start", "task-123"],
    ],
  );
  const receipt = DexTaskTrackerReceiptSchema.parse(
    receiptWrites(fixture.writes)[0].data,
  );
  assert.equal(receipt.errorCode, "command-failed");
  assert.equal(
    JSON.stringify(receipt).includes("fixture command failure"),
    false,
  );
});

Deno.test("same repository and task invocations are serialized in-process", async () => {
  const adapter = new FakeDexCommandAdapter();
  adapter.showDelayMs = 15;
  const first = fixtureContext("owner-a");
  const second = fixtureContext("owner-b");
  await Promise.all([
    executeDexTaskGet(
      { taskId: "task-123" },
      first.context,
      dependencies(adapter),
    ),
    executeDexTaskGet(
      { taskId: "task-123" },
      second.context,
      dependencies(adapter),
    ),
  ]);
  assert.equal(adapter.maxConcurrentRuns, 1);
  assert.equal(receiptWrites(first.writes).length, 1);
  assert.equal(receiptWrites(second.writes).length, 1);
});
