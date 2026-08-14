import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";

import { PASSTHROUGH_DEX_REPOSITORY_LOCK } from "./dex-repository-lock.ts";
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

class MemoryFileSystem implements SupersPlanningPromotionFileSystem {
  readonly files = new Map<string, string>();
  readonly events: string[] = [];
  failDestinationWrittenJournalOnce = false;

  readTextFile(path: string): Promise<string | null> {
    return Promise.resolve(this.files.get(path) ?? null);
  }

  writeTextFileAtomic(path: string, content: string): Promise<void> {
    this.events.push(`write:${path}`);
    if (
      this.failDestinationWrittenJournalOnce &&
      path.includes("supers-planning-promotions") &&
      content.includes('"state":"destination-written"')
    ) {
      this.failDestinationWrittenJournalOnce = false;
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

class MemoryDexAdapter implements SupersPlanningPromotionDexAdapter {
  applyCalls = 0;
  verifyCalls = 0;

  applyGraph(): Promise<{ taskIdsByClientRef: Record<string, string> }> {
    this.applyCalls += 1;
    return Promise.resolve({ taskIdsByClientRef: { implementation: "dex-1" } });
  }

  verifyGraph(): Promise<void> {
    this.verifyCalls += 1;
    return Promise.resolve();
  }
}

async function writeSpec(
  path: string,
  content: string,
  expectedRevision: string | null,
): Promise<
  {
    path: string;
    content: string;
    expectedRevision: string | null;
    revision: string;
  }
> {
  return {
    path,
    content,
    expectedRevision,
    revision: await createSupersPlanningHash(content),
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

Deno.test("capture-idea needs no approval and reaches every durable journal state", async () => {
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
  const result = await executeSupersPlanningPromotion(
    {
      schemaVersion: 1,
      planningItemId: "stable-item",
      operation: "capture-idea",
      decision: "apply",
      source: null,
      destination,
      indexMutations: [{ action: "write", ...index }],
      graph: null,
      approval: null,
    },
    REPO,
    dependencies(fileSystem),
  );

  assertEquals(result.status, "audited");
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/stable-item.md`),
    "# Stable item\n",
  );
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/README.md`),
    "# Ideas\n\n- Stable item\n",
  );
  const journals = [...fileSystem.files.entries()].filter(([path]) =>
    path.includes("supers-planning-promotions")
  );
  assertEquals(journals.length, 1);
  assert(journals[0]![1].includes('"state":"audited"'));
});

Deno.test("move writes and commits destination before source cleanup", async () => {
  const fileSystem = new MemoryFileSystem();
  const sourceContent = "# Candidate\n";
  const sourceRevision = await createSupersPlanningHash(sourceContent);
  fileSystem.files.set(`${REPO}/docs/ideas/candidate.md`, sourceContent);
  const promotionWithoutApproval = {
    schemaVersion: 1 as const,
    planningItemId: "candidate",
    operation: "idea-to-roadmap" as const,
    decision: "apply" as const,
    source: {
      path: "docs/ideas/candidate.md",
      expectedRevision: sourceRevision,
    },
    destination: await writeSpec(
      "docs/roadmap/candidate.md",
      "# Roadmap candidate\n",
      null,
    ),
    indexMutations: [],
    graph: null,
    approval: { digest: "0".repeat(64) },
  };
  const promotion = {
    ...promotionWithoutApproval,
    approval: {
      digest: await createSupersPlanningApprovalDigest(
        SupersPlanningPromotionApplySchema.parse(promotionWithoutApproval),
      ),
    },
  };

  await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );
  const destinationWrite = fileSystem.events.indexOf(
    `write:${REPO}/docs/roadmap/candidate.md`,
  );
  const sourceRemove = fileSystem.events.indexOf(
    `remove:${REPO}/docs/ideas/candidate.md`,
  );
  assert(destinationWrite >= 0 && sourceRemove > destinationWrite);
  assertEquals(fileSystem.files.has(`${REPO}/docs/ideas/candidate.md`), false);
});

Deno.test("stale source revision fails before destination write", async () => {
  const fileSystem = new MemoryFileSystem();
  fileSystem.files.set(`${REPO}/docs/ideas/candidate.md`, "changed");
  const draft = {
    schemaVersion: 1 as const,
    planningItemId: "candidate",
    operation: "idea-to-roadmap" as const,
    decision: "apply" as const,
    source: {
      path: "docs/ideas/candidate.md",
      expectedRevision: "1".repeat(64),
    },
    destination: await writeSpec("docs/roadmap/candidate.md", "roadmap", null),
    indexMutations: [],
    graph: null,
    approval: { digest: "0".repeat(64) },
  };
  const promotion = {
    ...draft,
    approval: {
      digest: await createSupersPlanningApprovalDigest(
        SupersPlanningPromotionApplySchema.parse(draft),
      ),
    },
  };
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(promotion, REPO, dependencies(fileSystem)),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-source");
  assertEquals(
    fileSystem.files.has(`${REPO}/docs/roadmap/candidate.md`),
    false,
  );
});

Deno.test("approval becomes stale when an index edit changes", async () => {
  const fileSystem = new MemoryFileSystem();
  const sourceContent = "source";
  const sourceRevision = await createSupersPlanningHash(sourceContent);
  fileSystem.files.set(`${REPO}/docs/ideas/candidate.md`, sourceContent);
  const originalIndex = await writeSpec(
    "docs/ideas/README.md",
    "original index",
    null,
  );
  const draft = {
    schemaVersion: 1 as const,
    planningItemId: "candidate",
    operation: "idea-to-roadmap" as const,
    decision: "apply" as const,
    source: {
      path: "docs/ideas/candidate.md",
      expectedRevision: sourceRevision,
    },
    destination: await writeSpec("docs/roadmap/candidate.md", "roadmap", null),
    indexMutations: [{ action: "write" as const, ...originalIndex }],
    graph: null,
    approval: { digest: "0".repeat(64) },
  };
  const digest = await createSupersPlanningApprovalDigest(
    SupersPlanningPromotionApplySchema.parse(draft),
  );
  const changedIndex = await writeSpec(
    "docs/ideas/README.md",
    "changed index",
    null,
  );
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(
        {
          ...draft,
          indexMutations: [{ action: "write", ...changedIndex }],
          approval: { digest },
        },
        REPO,
        dependencies(fileSystem),
      ),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-approval");
});

Deno.test("retry after destination write rolls forward without rewriting destination", async () => {
  const fileSystem = new MemoryFileSystem();
  fileSystem.failDestinationWrittenJournalOnce = true;
  const destination = await writeSpec(
    "docs/ideas/retry.md",
    "retry destination",
    null,
  );
  const promotion = {
    schemaVersion: 1 as const,
    planningItemId: "retry",
    operation: "capture-idea" as const,
    decision: "apply" as const,
    source: null,
    destination,
    indexMutations: [],
    graph: null,
    approval: null,
  };
  await assertRejects(
    () =>
      executeSupersPlanningPromotion(promotion, REPO, dependencies(fileSystem)),
    Error,
    "interruption",
  );
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/retry.md`),
    "retry destination",
  );
  await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem),
  );
  assertEquals(
    fileSystem.events.filter((event) =>
      event === `write:${REPO}/docs/ideas/retry.md`
    ).length,
    1,
  );
});

Deno.test("early transitions reject Dex graphs while planning-to-dex applies and verifies one", async () => {
  const destination = await writeSpec("docs/ideas/no-dex.md", "idea", null);
  const graph = {
    schemaVersion: 1 as const,
    tasks: [{
      clientRef: "implementation",
      name: "Implement",
      description: "Implement the approved planning item.",
      priority: 10,
      parentClientRef: null,
      blockedBy: [],
    }],
  };
  assertThrows(
    () =>
      SupersPlanningPromotionArgumentsSchema.parse({
        schemaVersion: 1,
        planningItemId: "no-dex",
        operation: "capture-idea",
        decision: "apply",
        source: null,
        destination,
        indexMutations: [],
        graph,
        approval: null,
      }),
  );

  const fileSystem = new MemoryFileSystem();
  const sourceContent = "planning";
  const sourceRevision = await createSupersPlanningHash(sourceContent);
  fileSystem.files.set(`${REPO}/docs/planning/item.md`, sourceContent);
  const draft = {
    schemaVersion: 1 as const,
    planningItemId: "to-dex",
    operation: "planning-to-dex" as const,
    decision: "apply" as const,
    source: { path: "docs/planning/item.md", expectedRevision: sourceRevision },
    destination: null,
    indexMutations: [],
    graph,
    approval: { digest: "0".repeat(64) },
  };
  const promotion = {
    ...draft,
    approval: {
      digest: await createSupersPlanningApprovalDigest(
        SupersPlanningPromotionApplySchema.parse(draft),
      ),
    },
  };
  const dex = new MemoryDexAdapter();
  const result = await executeSupersPlanningPromotion(
    promotion,
    REPO,
    dependencies(fileSystem, dex),
  );
  assertEquals(dex.applyCalls, 1);
  assertEquals(dex.verifyCalls, 1);
  assertEquals(result.dexResult?.taskIdsByClientRef, {
    implementation: "dex-1",
  });
});

Deno.test("reject and park are explicit no-ops", async () => {
  const fileSystem = new MemoryFileSystem();
  for (const decision of ["reject", "park"] as const) {
    const result = await executeSupersPlanningPromotion(
      {
        schemaVersion: 1,
        planningItemId: "no-op",
        operation: "planning-to-dex",
        decision,
        reason: "Not ready",
      },
      REPO,
      dependencies(fileSystem),
    );
    assertEquals(result.status, decision === "reject" ? "rejected" : "parked");
  }
  assertEquals(fileSystem.events, []);
});

Deno.test("Deno filesystem rejects traversal outside the canonical repository root", async () => {
  const repoDir = await Deno.makeTempDir();
  try {
    const content = "escape";
    const revision = await createSupersPlanningHash(content);
    const error = await assertRejects(
      () =>
        executeSupersPlanningPromotion(
          {
            schemaVersion: 1,
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
    assertEquals(error.errorCode, "invalid-path");
  } finally {
    await Deno.remove(repoDir, { recursive: true });
  }
});

Deno.test("Deno filesystem rejects a symlinked destination parent", async () => {
  const repoDir = await Deno.makeTempDir();
  const outsideDir = await Deno.makeTempDir();
  try {
    await Deno.symlink(outsideDir, `${repoDir}/linked`);
    const content = "must remain contained";
    const revision = await createSupersPlanningHash(content);
    const error = await assertRejects(
      () =>
        executeSupersPlanningPromotion(
          {
            schemaVersion: 1,
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
    assertEquals(error.errorCode, "invalid-path");
    await assertRejects(
      () => Deno.stat(`${outsideDir}/escaped.md`),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(repoDir, { recursive: true });
    await Deno.remove(outsideDir, { recursive: true });
  }
});

Deno.test("recovery rejects destination drift after prepared journal", async () => {
  const fileSystem = new MemoryFileSystem();
  const content = "approved destination";
  const promotion = SupersPlanningPromotionApplySchema.parse({
    schemaVersion: 1,
    planningItemId: "destination-drift",
    operation: "capture-idea",
    decision: "apply",
    source: null,
    destination: {
      path: "docs/ideas/destination-drift.md",
      expectedRevision: null,
      content,
      revision: await createSupersPlanningHash(content),
    },
    indexMutations: [],
    graph: null,
    approval: null,
  });
  fileSystem.failDestinationWrittenJournalOnce = true;
  await assertRejects(() =>
    executeSupersPlanningPromotion(promotion, REPO, dependencies(fileSystem))
  );
  fileSystem.files.set(`${REPO}/docs/ideas/destination-drift.md`, "newer work");
  const error = await assertRejects(
    () =>
      executeSupersPlanningPromotion(promotion, REPO, dependencies(fileSystem)),
    SupersPlanningPromotionError,
  );
  assertEquals(error.errorCode, "stale-destination");
  assertEquals(
    fileSystem.files.get(`${REPO}/docs/ideas/destination-drift.md`),
    "newer work",
  );
});

Deno.test("promotion rejects overlapping source destination and index paths", async () => {
  const content = "replacement";
  const sourceRevision = await createSupersPlanningHash("source");
  const base = {
    schemaVersion: 1 as const,
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
  const unsignedPromotion = SupersPlanningPromotionApplySchema.parse(base);
  const promotion = SupersPlanningPromotionApplySchema.parse({
    ...unsignedPromotion,
    approval: {
      digest: await createSupersPlanningApprovalDigest(unsignedPromotion),
    },
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
