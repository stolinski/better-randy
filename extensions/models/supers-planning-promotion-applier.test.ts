import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  type DexApprovedPlan,
  DexPlanApplierError,
  type DexPlanApplyResult,
} from "./dex-plan-applier-adapter.ts";
import {
  type DexRepositoryLock,
  type DexRepositoryLockLease,
  PASSTHROUGH_DEX_REPOSITORY_LOCK,
} from "./dex-repository-lock.ts";
import {
  createSupersPlanningApprovalDigest,
  createSupersPlanningHash,
  executeSupersPlanningPromotion,
  SupersPlanningPromotionApplySchema,
  SupersPlanningPromotionArgumentsSchema,
  type SupersPlanningPromotionDexAdapter,
  SupersPlanningPromotionError,
  type SupersPlanningPromotionFileSystem,
} from "./supers-planning-promotion-applier.ts";

const REPO = "/fixture/repository";
const FIXED_TIME = "2026-08-27T12:00:00.000Z";

class MemoryFileSystem implements SupersPlanningPromotionFileSystem {
  readonly files = new Map<string, string>();
  readonly events: string[] = [];
  failJournalStateOnce: string | null = null;
  failPathOnce: string | null = null;

  readTextFile(path: string): Promise<string | null> {
    return Promise.resolve(this.files.get(path) ?? null);
  }

  writeTextFileAtomic(path: string, content: string): Promise<void> {
    this.events.push(`write:${path}`);
    if (this.failPathOnce === path) {
      this.failPathOnce = null;
      return Promise.reject(new Error("fixture path interruption"));
    }
    if (
      this.failJournalStateOnce !== null &&
      path.includes("supers-planning-promotions") &&
      content.includes(`"state":"${this.failJournalStateOnce}"`)
    ) {
      this.failJournalStateOnce = null;
      return Promise.reject(new Error("fixture journal interruption"));
    }
    this.files.set(path, content);
    return Promise.resolve();
  }

  removeFile(path: string): Promise<void> {
    this.events.push(`remove:${path}`);
    this.files.delete(path);
    return Promise.resolve();
  }
}

function dexResult(plan: DexApprovedPlan): DexPlanApplyResult {
  return {
    schemaVersion: 1,
    adapterVersion: "2026.08.06.1",
    planId: plan.planId,
    planHash: "a".repeat(64),
    idempotencyKey: "b".repeat(64),
    ownerToken: "supers-planning-promotion",
    status: "succeeded",
    appliedAt: FIXED_TIME,
    taskIdsByClientRef: { implementation: "dex-1" },
    mappings: [{
      clientRef: "implementation",
      dexTaskId: "dex-1",
      disposition: "created",
    }],
  };
}

class MemoryDexAdapter implements SupersPlanningPromotionDexAdapter {
  applyCalls = 0;
  verifyCalls = 0;
  failAfterPartialApplyOnce = false;
  failWithManualReviewOnce = false;
  returnDriftedVerification = false;
  appliedResult: DexPlanApplyResult | null = null;

  applyApprovedPlan(
    _repoDir: string,
    plan: DexApprovedPlan,
  ): Promise<DexPlanApplyResult> {
    this.applyCalls += 1;
    this.appliedResult ??= dexResult(plan);
    if (this.failWithManualReviewOnce) {
      this.failWithManualReviewOnce = false;
      return Promise.reject(
        new DexPlanApplierError(
          "recovery-ambiguous",
          "Fixture Dex recovery is ambiguous",
          "manual-review",
        ),
      );
    }
    if (this.failAfterPartialApplyOnce) {
      this.failAfterPartialApplyOnce = false;
      return Promise.reject(new Error("fixture partial Dex graph"));
    }
    return Promise.resolve(structuredClone(this.appliedResult));
  }

  verifyApprovedPlan(
    _repoDir: string,
    plan: DexApprovedPlan,
    expectedResult: DexPlanApplyResult,
  ): Promise<DexPlanApplyResult> {
    this.verifyCalls += 1;
    if (this.returnDriftedVerification) {
      return Promise.resolve({
        ...dexResult(plan),
        taskIdsByClientRef: { implementation: "dex-drift" },
        mappings: [{
          clientRef: "implementation",
          dexTaskId: "dex-drift",
          disposition: "created",
        }],
      });
    }
    return Promise.resolve(structuredClone(expectedResult));
  }
}

async function writeSpec(
  path: string,
  content: string,
  expectedRevision: string | null,
): Promise<{
  path: string;
  content: string;
  expectedRevision: string | null;
  revision: string;
}> {
  return {
    path,
    content,
    expectedRevision,
    revision: await createSupersPlanningHash(content),
  };
}

function approvedPlan(planningItemId: string): DexApprovedPlan {
  return {
    schemaVersion: 1,
    planId: planningItemId,
    tasks: [{
      kind: "create",
      clientRef: "implementation",
      name: "Implement approved work",
      description: "Apply exactly the approved planning scope.",
      priority: 10,
      parent: { kind: "root" },
      blockedBy: [],
    }],
  };
}

function dependencies(
  fileSystem: MemoryFileSystem,
  dexAdapter?: MemoryDexAdapter,
) {
  return {
    fileSystem,
    dexAdapter,
    repositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
  };
}

async function ideaMove(
  fileSystem: MemoryFileSystem,
  planningItemId = "candidate",
) {
  const sourceContent = "# Candidate\n";
  const sourceRevision = await createSupersPlanningHash(sourceContent);
  const sourcePath = `docs/ideas/${planningItemId}.md`;
  fileSystem.files.set(`${REPO}/${sourcePath}`, sourceContent);
  const draft = {
    schemaVersion: 2 as const,
    planningItemId,
    operation: "idea-to-roadmap" as const,
    decision: "apply" as const,
    source: { path: sourcePath, expectedRevision: sourceRevision },
    destination: await writeSpec(
      "docs/roadmap.md",
      `# Roadmap\n\n- ${planningItemId}\n`,
      null,
    ),
    indexMutations: [],
    graph: null,
    approval: { digest: "0".repeat(64) },
  };
  const unsigned = SupersPlanningPromotionApplySchema.parse(draft);
  return SupersPlanningPromotionApplySchema.parse({
    ...unsigned,
    approval: {
      digest: await createSupersPlanningApprovalDigest(unsigned),
    },
  });
}

async function planningToDex(
  fileSystem: MemoryFileSystem,
  planningItemId = "to-dex",
) {
  const sourceContent = "# Approved planning document\n";
  const sourcePath = `docs/briefs/${planningItemId}.md`;
  const sourceRevision = await createSupersPlanningHash(sourceContent);
  fileSystem.files.set(`${REPO}/${sourcePath}`, sourceContent);
  const draft = {
    schemaVersion: 2 as const,
    planningItemId,
    operation: "planning-to-dex" as const,
    decision: "apply" as const,
    source: { path: sourcePath, expectedRevision: sourceRevision },
    destination: null,
    indexMutations: [],
    graph: approvedPlan(planningItemId),
    approval: { digest: "0".repeat(64) },
  };
  const unsigned = SupersPlanningPromotionApplySchema.parse(draft);
  return SupersPlanningPromotionApplySchema.parse({
    ...unsigned,
    approval: {
      digest: await createSupersPlanningApprovalDigest(unsigned),
    },
  });
}

Deno.test("capture emits hashes, authority, cleanup, and a deterministic audit receipt", async () => {
  const fileSystem = new MemoryFileSystem();
  const destination = await writeSpec(
    "docs/ideas/stable-item.md",
    "# Stable item\n",
    null,
  );
  const index = await writeSpec(
    "docs/ideas/README.md",
    "# Ideas\n\n- Stable item\n",
    null,
  );
  const promotion = {
    schemaVersion: 2 as const,
    planningItemId: "stable-item",
    operation: "capture-idea" as const,
    decision: "apply" as const,
    source: null,
    destination,
    indexMutations: [{ action: "write" as const, ...index }],
    graph: null,
    approval: null,
  };
  const result = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );

  assertEquals(result.status, "audited");
  assertEquals(result.authorityState, "destination-authoritative");
  assertEquals(result.cleanupDisposition, "not-required");
  assertEquals(result.repairGuidance, "none");
  assertEquals(result.approvalDigest, null);
  assertEquals(result.auditReceipt.approvalDigest, null);
  assertEquals(result.hashes?.destinationRevision, destination.revision);
  assertEquals(result.auditReceipt.receiptId.length, 64);
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/stable-item.md`),
    "# Stable item\n",
  );
  const firstReceipt = result.auditReceipt.receiptId;
  const replay = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );
  assertEquals(replay.auditReceipt.receiptId, firstReceipt);
  assertEquals(
    fileSystem.events.filter((event) =>
      event === `write:${REPO}/docs/ideas/stable-item.md`
    ).length,
    1,
  );
});

Deno.test("version-one documentation journals migrate without repeating mutations", async () => {
  const fileSystem = new MemoryFileSystem();
  const content = "# Legacy capture\n";
  const destination = await writeSpec(
    "docs/ideas/legacy-capture.md",
    content,
    null,
  );
  const promotion = {
    schemaVersion: 2 as const,
    planningItemId: "legacy-capture",
    operation: "capture-idea" as const,
    decision: "apply" as const,
    source: null,
    destination,
    indexMutations: [],
    graph: null,
    approval: null,
  };
  const legacyApprovalDigest = await createSupersPlanningHash({
    schemaVersion: 1,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    source: promotion.source,
    destination: promotion.destination,
    indexMutations: promotion.indexMutations,
    graph: promotion.graph,
  });
  const legacyTransactionId = await createSupersPlanningHash({
    planningItemId: promotion.planningItemId,
    approvalDigest: legacyApprovalDigest,
  });
  fileSystem.files.set(`${REPO}/${destination.path}`, content);
  fileSystem.files.set(
    `${REPO}/.swamp/supers-planning-promotions/${legacyTransactionId}.json`,
    `${
      JSON.stringify({
        schemaVersion: 1,
        transactionId: legacyTransactionId,
        approvalDigest: legacyApprovalDigest,
        planningItemId: promotion.planningItemId,
        operation: promotion.operation,
        state: "audited",
        dexResult: null,
      })
    }\n`,
  );

  const result = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );

  assertEquals(result.status, "audited");
  assertEquals(
    fileSystem.events.filter((event) =>
      event === `write:${REPO}/${destination.path}`
    ).length,
    0,
  );
  assertEquals(
    [...fileSystem.files.keys()].filter((path) =>
      path.includes("supers-planning-promotions")
    ).length,
    2,
  );
});

Deno.test("move commits the verified destination before source cleanup", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await ideaMove(fileSystem);
  await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );

  const destinationWrite = fileSystem.events.indexOf(
    `write:${REPO}/docs/roadmap.md`,
  );
  const sourceRemove = fileSystem.events.indexOf(
    `remove:${REPO}/docs/ideas/candidate.md`,
  );
  assert(destinationWrite >= 0 && sourceRemove > destinationWrite);
  const journalWrites = fileSystem.events.filter((event) =>
    event.includes("supers-planning-promotions")
  );
  assert(journalWrites.length >= 6);
});

Deno.test("roadmap-to-planning rewrites the shared Roadmap only after the Planning destination commits", async () => {
  const fileSystem = new MemoryFileSystem();
  const roadmapBefore = "# Roadmap\n\n- Candidate\n";
  const roadmapAfter = "# Roadmap\n";
  const roadmapRevision = await createSupersPlanningHash(roadmapBefore);
  fileSystem.files.set(`${REPO}/docs/roadmap.md`, roadmapBefore);
  const draft = SupersPlanningPromotionApplySchema.parse({
    schemaVersion: 2,
    planningItemId: "candidate",
    operation: "roadmap-to-planning",
    decision: "apply",
    source: await writeSpec(
      "docs/roadmap.md",
      roadmapAfter,
      roadmapRevision,
    ),
    destination: await writeSpec(
      "docs/briefs/candidate.md",
      "# Candidate brief\n",
      null,
    ),
    indexMutations: [],
    graph: null,
    approval: { digest: "0".repeat(64) },
  });
  const promotion = SupersPlanningPromotionApplySchema.parse({
    ...draft,
    approval: {
      digest: await createSupersPlanningApprovalDigest(draft),
    },
  });

  const result = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );

  assertEquals(result.status, "audited");
  assertEquals(fileSystem.files.get(`${REPO}/docs/roadmap.md`), roadmapAfter);
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/briefs/candidate.md`),
    "# Candidate brief\n",
  );
  assert(
    fileSystem.events.indexOf(`write:${REPO}/docs/roadmap.md`) >
      fileSystem.events.indexOf(`write:${REPO}/docs/briefs/candidate.md`),
  );

  const replay = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );
  assertEquals(replay.auditReceipt.receiptId, result.auditReceipt.receiptId);
  assertEquals(
    fileSystem.events.filter((event) =>
      event === `write:${REPO}/docs/roadmap.md`
    ).length,
    1,
  );
});

Deno.test("every journal crash boundary rolls forward without duplicate destination writes", async () => {
  for (
    const state of [
      "prepared",
      "destination-written",
      "destination-verified",
      "committed",
      "source-cleaned",
      "audited",
    ]
  ) {
    const fileSystem = new MemoryFileSystem();
    const promotion = await ideaMove(fileSystem, `crash-${state}`);
    fileSystem.failJournalStateOnce = state;
    await assertRejects(() =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem),
      )
    );
    const result = await executeSupersPlanningPromotion(
      promotion,
      REPO,
      dependencies(fileSystem),
    );
    assertEquals(result.status, "audited", state);
    assertEquals(
      fileSystem.files.has(`${REPO}/docs/ideas/crash-${state}.md`),
      false,
      state,
    );
    assertEquals(
      fileSystem.events.filter((event) =>
        event === `write:${REPO}/docs/roadmap.md`
      ).length,
      1,
      state,
    );
  }
});

Deno.test("stale source fails before the destination write", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await ideaMove(fileSystem);
  fileSystem.files.set(`${REPO}/docs/ideas/candidate.md`, "changed");
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-source");
  assertEquals(error.repairGuidance, "inspect-source-drift");
  assertEquals(fileSystem.files.has(`${REPO}/docs/roadmap.md`), false);
});

Deno.test("approval becomes stale when an index edit changes", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await ideaMove(fileSystem);
  const changedIndex = await writeSpec(
    "docs/ideas/README.md",
    "changed index",
    null,
  );
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        {
          ...promotion,
          indexMutations: [{ action: "write", ...changedIndex }],
        },
        REPO,
        dependencies(fileSystem),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-approval");
  assertEquals(error.repairGuidance, "request-fresh-approval");
  assertEquals(fileSystem.events, []);
});

Deno.test("recovery rejects destination drift after destination verification", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await ideaMove(fileSystem);
  fileSystem.failJournalStateOnce = "committed";
  await assertRejects(() =>
    executeSupersPlanningPromotion(
      promotion,
      REPO,
      dependencies(fileSystem),
    )
  );
  fileSystem.files.set(`${REPO}/docs/roadmap.md`, "newer work");
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-destination");
  assertEquals(
    fileSystem.files.has(`${REPO}/docs/ideas/candidate.md`),
    true,
  );
});

Deno.test("audited recovery rejects a recreated source preimage as dual authority", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await ideaMove(fileSystem, "recreated-source");
  await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );
  assert(promotion.source !== null);
  fileSystem.files.set(
    `${REPO}/${promotion.source.path}`,
    "# Candidate\n",
  );

  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem),
      ),
    SupersPlanningPromotionError,
  );

  assertEquals(error.errorCode, "stale-source");
  assertEquals(error.authorityState, "destination-authoritative");
  assertEquals(error.cleanupDisposition, "completed");
});

Deno.test("partial index mutation resumes while source remains authoritative", async () => {
  const fileSystem = new MemoryFileSystem();
  const sourceContent = "# Indexed candidate\n";
  const sourceRevision = await createSupersPlanningHash(sourceContent);
  fileSystem.files.set(`${REPO}/docs/ideas/indexed.md`, sourceContent);
  const firstIndex = await writeSpec(
    "docs/ideas/README.md",
    "ideas post",
    null,
  );
  const secondIndex = await writeSpec(
    "docs/history/README.md",
    "history post",
    null,
  );
  const draft = {
    schemaVersion: 2 as const,
    planningItemId: "indexed",
    operation: "idea-to-roadmap" as const,
    decision: "apply" as const,
    source: {
      path: "docs/ideas/indexed.md",
      expectedRevision: sourceRevision,
    },
    destination: await writeSpec("docs/roadmap.md", "roadmap post", null),
    indexMutations: [
      { action: "write" as const, ...firstIndex },
      { action: "write" as const, ...secondIndex },
    ],
    graph: null,
    approval: { digest: "0".repeat(64) },
  };
  const unsigned = SupersPlanningPromotionApplySchema.parse(draft);
  const promotion = SupersPlanningPromotionApplySchema.parse({
    ...unsigned,
    approval: { digest: await createSupersPlanningApprovalDigest(unsigned) },
  });
  fileSystem.failPathOnce = `${REPO}/docs/history/README.md`;
  await assertRejects(() =>
    executeSupersPlanningPromotion(
      promotion,
      REPO,
      dependencies(fileSystem),
    )
  );
  assertEquals(fileSystem.files.has(`${REPO}/docs/ideas/indexed.md`), true);
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/README.md`),
    "ideas post",
  );

  const result = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );
  assertEquals(result.status, "audited");
  assertEquals(fileSystem.files.has(`${REPO}/docs/ideas/indexed.md`), false);
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/history/README.md`),
    "history post",
  );
});

Deno.test("planning-to-Dex recovers partial graph application before source cleanup", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await planningToDex(fileSystem);
  const dex = new MemoryDexAdapter();
  dex.failAfterPartialApplyOnce = true;
  const firstError = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem, dex),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(firstError.errorCode, "dex-application-failed");
  assertEquals(firstError.repairGuidance, "retry-same-payload");
  assertEquals(fileSystem.files.has(`${REPO}/docs/briefs/to-dex.md`), true);

  const result = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem, dex),
  );
  assertEquals(result.authorityState, "dex-authoritative");
  assertEquals(result.cleanupDisposition, "completed");
  assertEquals(result.dexResult?.taskIdsByClientRef, {
    implementation: "dex-1",
  });
  assertEquals(dex.applyCalls, 2);
  assertEquals(dex.verifyCalls, 1);
  assertEquals(fileSystem.files.has(`${REPO}/docs/briefs/to-dex.md`), false);
});

Deno.test("ambiguous Dex recovery emits inspect guidance instead of blind retry", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await planningToDex(fileSystem, "dex-ambiguous");
  const dex = new MemoryDexAdapter();
  dex.failWithManualReviewOnce = true;

  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem, dex),
      ),
    SupersPlanningPromotionError,
  );

  assertEquals(error.errorCode, "dex-application-failed");
  assertEquals(error.repairGuidance, "inspect-dex-drift");
  assertEquals(
    fileSystem.files.has(`${REPO}/docs/briefs/dex-ambiguous.md`),
    true,
  );
});

Deno.test("Dex verification drift blocks cutover and preserves source authority", async () => {
  const fileSystem = new MemoryFileSystem();
  const promotion = await planningToDex(fileSystem, "dex-drift");
  const dex = new MemoryDexAdapter();
  dex.returnDriftedVerification = true;
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(fileSystem, dex),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-dex");
  assertEquals(error.repairGuidance, "inspect-dex-drift");
  assertEquals(fileSystem.files.has(`${REPO}/docs/briefs/dex-drift.md`), true);
});

Deno.test("post-audit repository lock cleanup failure preserves committed success", async () => {
  const fileSystem = new MemoryFileSystem();
  const destination = await writeSpec(
    "docs/ideas/lock-cleanup.md",
    "# Lock cleanup\n",
    null,
  );
  const repositoryLock: DexRepositoryLock = {
    runExclusive: <T>(
      repoDir: string,
      operation: (lease?: DexRepositoryLockLease) => Promise<T>,
    ): Promise<T> =>
      PASSTHROUGH_DEX_REPOSITORY_LOCK.runExclusive(
        repoDir,
        async (lease) => {
          await operation(lease);
          throw new Error("fixture cleanup failure after commit");
        },
      ),
  };

  const result = await executeSupersPlanningPromotion(
    {
      schemaVersion: 2,
      planningItemId: "lock-cleanup",
      operation: "capture-idea",
      decision: "apply",
      source: null,
      destination,
      indexMutations: [],
      graph: null,
      approval: null,
    },
    REPO,
    { fileSystem, repositoryLock },
  );

  assertEquals(result.status, "audited");
  assertEquals(result.authorityState, "destination-authoritative");
});

Deno.test("reject and park do not acquire the lock or mutate repository state", async () => {
  const fileSystem = new MemoryFileSystem();
  let lockCalls = 0;
  const repositoryLock = {
    runExclusive: <T>(
      _repoDir: string,
      operation: () => Promise<T>,
    ): Promise<T> => {
      lockCalls += 1;
      return operation();
    },
  };
  for (const decision of ["reject", "park"] as const) {
    const result = await executeSupersPlanningPromotion(
      {
        schemaVersion: 2,
        planningItemId: "no-op",
        operation: "planning-to-dex",
        decision,
        reason: "Not ready",
      },
      REPO,
      { fileSystem, repositoryLock },
    );
    assertEquals(result.status, decision === "reject" ? "rejected" : "parked");
    assertEquals(result.authorityState, "unchanged");
    assertEquals(result.auditReceipt.decisionDigest?.length, 64);
  }
  assertEquals(lockCalls, 0);
  assertEquals(fileSystem.events, []);
});

Deno.test("planning-to-Dex requires planId to equal stable planningItemId", () => {
  assertThrows(() =>
    SupersPlanningPromotionArgumentsSchema.parse({
      schemaVersion: 2,
      planningItemId: "stable-item",
      operation: "planning-to-dex",
      decision: "apply",
      source: {
        path: "docs/briefs/stable-item.md",
        expectedRevision: "1".repeat(64),
      },
      destination: null,
      indexMutations: [],
      graph: approvedPlan("different-plan"),
      approval: { digest: "2".repeat(64) },
    })
  );
});

Deno.test("changed payload under the same stable operation identity conflicts", async () => {
  const fileSystem = new MemoryFileSystem();
  const originalContent = "first capture";
  const originalRevision = await createSupersPlanningHash(originalContent);
  const original = {
    schemaVersion: 2 as const,
    planningItemId: "stable-conflict",
    operation: "capture-idea" as const,
    decision: "apply" as const,
    source: null,
    destination: {
      path: "docs/ideas/stable-conflict.md",
      expectedRevision: null,
      content: originalContent,
      revision: originalRevision,
    },
    indexMutations: [],
    graph: null,
    approval: null,
  };
  await executeSupersPlanningPromotion(
    original,
    REPO,
    dependencies(fileSystem),
  );
  const replacementContent = "replacement capture";
  const replacementRevision = await createSupersPlanningHash(
    replacementContent,
  );
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        {
          ...original,
          destination: {
            ...original.destination,
            expectedRevision: originalRevision,
            content: replacementContent,
            revision: replacementRevision,
          },
        },
        REPO,
        dependencies(fileSystem),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "journal-conflict");
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/stable-conflict.md`),
    originalContent,
  );
});

Deno.test("promotion rejects overlapping source, destination, and index paths", async () => {
  const content = "replacement";
  const sourceRevision = await createSupersPlanningHash("source");
  const base = {
    schemaVersion: 2 as const,
    planningItemId: "overlapping-paths",
    operation: "idea-to-roadmap" as const,
    decision: "apply" as const,
    source: { path: "docs/shared.md", expectedRevision: sourceRevision },
    destination: {
      path: "docs/shared.md",
      expectedRevision: sourceRevision,
      content,
      revision: await createSupersPlanningHash(content),
    },
    indexMutations: [],
    graph: null,
    approval: { digest: "0".repeat(64) },
  };
  const unsigned = SupersPlanningPromotionApplySchema.parse(base);
  const promotion = SupersPlanningPromotionApplySchema.parse({
    ...unsigned,
    approval: { digest: await createSupersPlanningApprovalDigest(unsigned) },
  });
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        promotion,
        REPO,
        dependencies(new MemoryFileSystem()),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "conflicting-paths");
});

Deno.test("Deno filesystem rejects traversal and symlinked destination parents", async () => {
  const repoDir = await Deno.makeTempDir();
  const outsideDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${repoDir}/.dex`);
    const content = "must remain contained";
    const revision = await createSupersPlanningHash(content);
    const traversalError = await assertRejects(
      () =>
        executeSupersPlanningPromotion(
          {
            schemaVersion: 2,
            planningItemId: "traversal",
            operation: "capture-idea",
            decision: "apply",
            source: null,
            destination: {
              path: "../escape.md",
              expectedRevision: null,
              content,
              revision,
            },
            indexMutations: [],
            graph: null,
            approval: null,
          },
          repoDir,
          { repositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK },
        ),
      SupersPlanningPromotionError,
    );
    assertEquals(traversalError.errorCode, "invalid-path");

    await Deno.symlink(outsideDir, `${repoDir}/linked`);
    const symlinkError = await assertRejects(
      () =>
        executeSupersPlanningPromotion(
          {
            schemaVersion: 2,
            planningItemId: "symlink-escape",
            operation: "capture-idea",
            decision: "apply",
            source: null,
            destination: {
              path: "linked/escaped.md",
              expectedRevision: null,
              content,
              revision,
            },
            indexMutations: [],
            graph: null,
            approval: null,
          },
          repoDir,
          { repositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK },
        ),
      SupersPlanningPromotionError,
    );
    assertEquals(symlinkError.errorCode, "invalid-path");
    await assertRejects(
      () => Deno.stat(`${outsideDir}/escaped.md`),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(repoDir, { recursive: true });
    await Deno.remove(outsideDir, { recursive: true });
  }
});
