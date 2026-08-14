import { strict as assert } from "node:assert";

import {
  createDexReadyLeafApprovalFingerprint,
  createDexReadyLeafAuthorizationSignature,
  type DexReadyLeafClaimArgs,
  DexReadyLeafClaimSchema,
  type DexReadyLeafCommandAdapter,
  type DexReadyLeafHandoffDependencies,
  type DexReadyLeafHandoffMethodContext,
  executeDexReadyLeafClaim,
} from "./dex-ready-leaf-handoff.ts";

const NOW = "2026-08-06T21:00:00.000Z";
const AUTHORIZATION_KEY = "fixture-delivery-handoff-key-32-bytes";

type RawTask = {
  id: string;
  parent_id: string | null;
  priority: number;
  completed: boolean;
  started_at: string | null;
  blockedBy: string[];
};

function task(
  id: string,
  values: Partial<Omit<RawTask, "id">> = {},
): RawTask {
  return {
    id,
    parent_id: null,
    priority: 2,
    completed: false,
    started_at: null,
    blockedBy: [],
    ...values,
  };
}

class FakeDexReadyLeafAdapter implements DexReadyLeafCommandAdapter {
  readonly starts: string[] = [];
  listCalls = 0;
  readCalls = 0;

  constructor(readonly tasks: RawTask[]) {}

  listAll(): Promise<unknown> {
    this.listCalls += 1;
    return Promise.resolve(structuredClone(this.tasks));
  }

  read(_cwd: string, taskId: string): Promise<unknown> {
    this.readCalls += 1;
    return Promise.resolve(
      structuredClone(this.tasks.find((candidate) => candidate.id === taskId)),
    );
  }

  start(_cwd: string, taskId: string): Promise<void> {
    const selected = this.tasks.find((candidate) => candidate.id === taskId);
    if (selected === undefined || selected.started_at !== null) {
      throw new Error("Fake task is not startable");
    }
    selected.started_at = NOW;
    this.starts.push(taskId);
    return Promise.resolve();
  }
}

function serialRepositoryLock(): DexReadyLeafHandoffDependencies[
  "repositoryLock"
] {
  let tail = Promise.resolve();
  return {
    runExclusive: async (_repoDir, operation) => {
      const previous = tail;
      let release = (): void => undefined;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
}

function fixtureContext(): {
  context: DexReadyLeafHandoffMethodContext;
  writes: Array<{ name: string; data: Record<string, unknown> }>;
} {
  const writes: Array<{ name: string; data: Record<string, unknown> }> = [];
  const resources = new Map<string, Record<string, unknown>>();
  return {
    writes,
    context: {
      repoDir: "/fixture/repository",
      globalArgs: { deliveryHandoffAuthorizationKey: AUTHORIZATION_KEY },
      logger: { info: () => undefined, warning: () => undefined },
      readResource: (name) => Promise.resolve(resources.get(name) ?? null),
      writeResource: (_specName, name, data) => {
        writes.push({ name, data });
        resources.set(name, data);
        return Promise.resolve({ name });
      },
    },
  };
}

async function approval(
  values: Partial<DexReadyLeafClaimArgs["approval"]> = {},
): Promise<DexReadyLeafClaimArgs["approval"]> {
  const identity = {
    schemaVersion: 1,
    planningWorkItem: "planning-1",
    planId: "plan-1",
    planHash: "a".repeat(64),
    proposalPlanHash: "a".repeat(64),
    applicationIdempotencyKey: "c".repeat(64),
    applicationCheckpointDataName: "apply-plan-checkpoint",
    applicationReceiptDataName: "apply-plan-receipt",
    applicationResultDataName: "apply-plan-result",
    graphProposalFingerprint: "d".repeat(64),
    approvedPlanFingerprint: "e".repeat(64),
    applicationFingerprint: "f".repeat(64),
    planningAuditFingerprint: "1".repeat(64),
    humanApprovalFingerprint: "2".repeat(64),
    planningHandoffFingerprint: "3".repeat(64),
    approvalGateId: "planning-approval",
    proposalCycle: 1,
    approvalCycle: 1,
    approvedAt: "2026-08-06T20:00:00.000Z",
    sourceDataNames: {
      graphProposal: "artifact-planning-1-dex-graph-proposal",
      approvedPlan: "artifact-planning-1-approved-plan",
      humanApproval: "approval-planning-1-planning-approval",
      planApplication: "artifact-planning-1-plan-application",
      planningAudit: "artifact-planning-1-planning-audit",
      planningHandoff: "artifact-planning-1-planning-handoff",
    },
    status: "ready",
    candidateTaskId: "leaf-1",
    approvedEpicTaskId: "epic-1",
    approvedTaskIds: ["epic-1", "leaf-1"],
    auditedTaskIds: ["epic-1", "leaf-1"],
    summary: "Human-approved audited planning handoff.",
    ...values,
  };
  const {
    approvalFingerprint: ignoredFingerprint,
    authorizationSignature: ignoredSignature,
    ...fingerprintedIdentity
  } = identity as DexReadyLeafClaimArgs["approval"];
  void ignoredFingerprint;
  void ignoredSignature;
  const approvalFingerprint = await createDexReadyLeafApprovalFingerprint(
    fingerprintedIdentity,
  );
  const authorizationIdentity = {
    ...fingerprintedIdentity,
    approvalFingerprint,
  };
  return {
    ...authorizationIdentity,
    authorizationSignature: await createDexReadyLeafAuthorizationSignature(
      authorizationIdentity,
      AUTHORIZATION_KEY,
    ),
  };
}

function dependencies(
  commandAdapter: DexReadyLeafCommandAdapter,
  repositoryLock = serialRepositoryLock(),
): DexReadyLeafHandoffDependencies {
  return { commandAdapter, repositoryLock, now: () => NOW };
}

function parsedClaim(
  writes: Array<{ data: Record<string, unknown> }>,
) {
  return DexReadyLeafClaimSchema.parse(writes.at(-1)?.data);
}

Deno.test("claim-next-ready atomically starts the unique global approved leaf", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1", priority: 2 }),
    task("later-1", { priority: 5 }),
  ]);
  const fixture = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval(),
      activeFactoryWorkItems: [],
    },
    fixture.context,
    dependencies(adapter),
  );
  const claim = parsedClaim(fixture.writes);
  assert.equal(claim.status, "claimed");
  assert.equal(claim.reason, "claimed-ready-leaf");
  assert.equal(claim.selectedTaskId, "leaf-1");
  assert.equal(claim.trackerStarted, true);
  assert.deepEqual(adapter.starts, ["leaf-1"]);
  assert.equal(adapter.listCalls, 1);
  assert.equal(adapter.readCalls, 1);
});

Deno.test("an active Factory is resumed before runway selection and tracker state is repaired", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("active-1", { priority: 9 }),
    task("leaf-1", { priority: 1 }),
  ]);
  const fixture = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval(),
      activeFactoryWorkItems: ["active-1"],
    },
    fixture.context,
    dependencies(adapter),
  );
  const claim = parsedClaim(fixture.writes);
  assert.equal(claim.status, "resumed");
  assert.equal(claim.selectedTaskId, "active-1");
  assert.equal(claim.trackerStarted, true);
  assert.deepEqual(adapter.starts, ["active-1"]);

  const conflictingAdapter = new FakeDexReadyLeafAdapter([
    task("active-1"),
    task("other-started", { started_at: NOW }),
  ]);
  const conflicting = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval(),
      activeFactoryWorkItems: ["active-1"],
    },
    conflicting.context,
    dependencies(conflictingAdapter),
  );
  assert.equal(parsedClaim(conflicting.writes).status, "human-gate");
  assert.equal(
    parsedClaim(conflicting.writes).reason,
    "active-factory-task-invalid",
  );
  assert.deepEqual(conflictingAdapter.starts, []);
});

Deno.test("multiple active ownership signals and ambiguous runways require a human gate", async () => {
  const multipleFactoryAdapter = new FakeDexReadyLeafAdapter([task("leaf-1")]);
  const multipleFactory = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval(),
      activeFactoryWorkItems: ["active-1", "active-2"],
    },
    multipleFactory.context,
    dependencies(multipleFactoryAdapter),
  );
  assert.equal(
    parsedClaim(multipleFactory.writes).reason,
    "multiple-active-factory-runs",
  );
  assert.deepEqual(multipleFactoryAdapter.starts, []);

  const tieAdapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1" }),
    task("leaf-2", { parent_id: "epic-1" }),
  ]);
  const tie = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval({
        approvedTaskIds: ["epic-1", "leaf-1", "leaf-2"],
      }),
      activeFactoryWorkItems: [],
    },
    tie.context,
    dependencies(tieAdapter),
  );
  assert.equal(parsedClaim(tie.writes).reason, "global-runway-ambiguous");
  assert.deepEqual(tieAdapter.starts, []);
});

Deno.test("a global winner outside the approved epic is never claimed", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1", priority: 3 }),
    task("outside-1", { priority: 2 }),
  ]);
  const fixture = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval(),
      activeFactoryWorkItems: [],
    },
    fixture.context,
    dependencies(adapter),
  );
  assert.equal(
    parsedClaim(fixture.writes).reason,
    "runway-outside-approved-plan",
  );
  assert.deepEqual(adapter.starts, []);
});

Deno.test("no-ready-work is a clean typed outcome", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { completed: true }),
    task("leaf-1", { parent_id: "epic-1", completed: true }),
  ]);
  const fixture = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval({
        status: "no-ready-work",
        candidateTaskId: null,
      }),
      activeFactoryWorkItems: [],
    },
    fixture.context,
    dependencies(adapter),
  );
  assert.equal(parsedClaim(fixture.writes).status, "no-ready-work");
  assert.deepEqual(adapter.starts, []);
});

Deno.test("competing claims serialize to one Dex start and deterministic outbox identity", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1", priority: 2 }),
  ]);
  const lock = serialRepositoryLock();
  const fixture = fixtureContext();
  await Promise.all([
    executeDexReadyLeafClaim(
      {
        authorizationCapability: AUTHORIZATION_KEY,
        approval: await approval(),
        activeFactoryWorkItems: [],
      },
      fixture.context,
      dependencies(adapter, lock),
    ),
    executeDexReadyLeafClaim(
      {
        authorizationCapability: AUTHORIZATION_KEY,
        approval: await approval(),
        activeFactoryWorkItems: [],
      },
      fixture.context,
      dependencies(adapter, lock),
    ),
  ]);
  assert.deepEqual(adapter.starts, ["leaf-1"]);
  const claims = fixture.writes
    .filter((write) => write.name.includes("ready-leaf-claim-"))
    .map((write) => DexReadyLeafClaimSchema.parse(write.data));
  assert.equal(claims.length, 2);
  assert.equal(claims[0].status, "claimed");
  assert.equal(claims[1].reason, "claimed-ready-leaf");
  assert.deepEqual(claims[1], claims[0]);
  assert.equal(new Set(fixture.writes.map((write) => write.name)).size, 2);
});

Deno.test("a started candidate without a durable intent is never adopted", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", {
      parent_id: "epic-1",
      priority: 2,
      started_at: NOW,
    }),
  ]);
  const fixture = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval(),
      activeFactoryWorkItems: [],
    },
    fixture.context,
    dependencies(adapter),
  );
  const claim = parsedClaim(fixture.writes);
  assert.equal(claim.status, "human-gate");
  assert.equal(claim.reason, "started-task-ownership-ambiguous");
  assert.deepEqual(adapter.starts, []);
});

Deno.test("stale no-ready-work planning evidence cannot hide a current runway", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1", priority: 2 }),
  ]);
  const fixture = fixtureContext();
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: await approval({
        status: "no-ready-work",
        candidateTaskId: null,
      }),
      activeFactoryWorkItems: [],
    },
    fixture.context,
    dependencies(adapter),
  );
  const claim = parsedClaim(fixture.writes);
  assert.equal(claim.status, "human-gate");
  assert.equal(claim.reason, "planning-no-ready-work-stale");
  assert.deepEqual(adapter.starts, []);
});

Deno.test("a crash after Dex start replays the durable intent without a second start", async () => {
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1", priority: 2 }),
  ]);
  const resources = new Map<string, Record<string, unknown>>();
  const writes: Array<{ name: string; data: Record<string, unknown> }> = [];
  let failClaimWrite = true;
  const context: DexReadyLeafHandoffMethodContext = {
    repoDir: "/fixture/repository",
    globalArgs: { deliveryHandoffAuthorizationKey: AUTHORIZATION_KEY },
    logger: { info: () => undefined, warning: () => undefined },
    readResource: (name) => Promise.resolve(resources.get(name) ?? null),
    writeResource: (specName, name, data) => {
      if (specName === "ready-leaf-claim" && failClaimWrite) {
        failClaimWrite = false;
        return Promise.reject(new Error("fixture crash after Dex start"));
      }
      resources.set(name, data);
      writes.push({ name, data });
      return Promise.resolve({ name });
    },
  };
  const lock = serialRepositoryLock();
  const approved = await approval();
  await assert.rejects(() =>
    executeDexReadyLeafClaim(
      {
        authorizationCapability: AUTHORIZATION_KEY,
        approval: approved,
        activeFactoryWorkItems: [],
      },
      context,
      dependencies(adapter, lock),
    )
  );
  assert.deepEqual(adapter.starts, ["leaf-1"]);
  await executeDexReadyLeafClaim(
    {
      authorizationCapability: AUTHORIZATION_KEY,
      approval: approved,
      activeFactoryWorkItems: [],
    },
    context,
    dependencies(adapter, lock),
  );
  assert.deepEqual(adapter.starts, ["leaf-1"]);
  assert.equal(parsedClaim(writes).reason, "recovered-started-task");
});

Deno.test("an unkeyed caller-minted approval cannot reach the Dex boundary", async () => {
  const valid = await approval();
  const {
    approvalFingerprint: _oldFingerprint,
    authorizationSignature,
    ...tamperedIdentity
  } = { ...valid, summary: "Caller-minted replacement." };
  void _oldFingerprint;
  const forged = {
    ...tamperedIdentity,
    approvalFingerprint: await createDexReadyLeafApprovalFingerprint(
      tamperedIdentity,
    ),
    authorizationSignature,
  };
  const adapter = new FakeDexReadyLeafAdapter([
    task("epic-1", { priority: 1 }),
    task("leaf-1", { parent_id: "epic-1", priority: 2 }),
  ]);
  const fixture = fixtureContext();
  await assert.rejects(
    () =>
      executeDexReadyLeafClaim(
        {
          authorizationCapability: AUTHORIZATION_KEY,
          approval: forged,
          activeFactoryWorkItems: [],
        },
        fixture.context,
        dependencies(adapter),
      ),
    /authorization signature is invalid/,
  );
  assert.equal(adapter.listCalls, 0);
  assert.deepEqual(adapter.starts, []);
});
