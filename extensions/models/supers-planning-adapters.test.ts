import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  auditSupersPlanningApplication,
  buildSupersPlanningSourceSnapshot,
  deriveSupersDocumentationEffects,
  deriveSupersPlanningInventory,
  deriveSupersTrackerInventory,
  normalizeSupersDeliveryHandoffOutcome,
  normalizeSupersDexTasks,
  normalizeSupersPlanApplication,
  prepareSupersDeliveryHandoff,
  readSupersPlanningMarkdownSources,
  SupersPlanningInventoryArgumentsSchema,
} from "./supers-planning-adapters.ts";

const DELIVERY_HANDOFF_TEST_KEY = "fixture-delivery-handoff-key-32-bytes";

function prepareFixtureDeliveryHandoff(
  args: Parameters<typeof prepareSupersDeliveryHandoff>[0],
) {
  return prepareSupersDeliveryHandoff(args, DELIVERY_HANDOFF_TEST_KEY);
}

async function writeFixtureFile(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  const segments = path.split("/");
  segments.pop();
  await Deno.mkdir(`${root}/${segments.join("/")}`, { recursive: true });
  await Deno.writeTextFile(`${root}/${path}`, content);
}

async function fixtureRepository(): Promise<string> {
  const root = await Deno.makeTempDir();
  await writeFixtureFile(
    root,
    "docs/roadmap.md",
    "# Roadmap\n\nStrategic delivery runway.\n\n## Now\n\nBuild typed planning adapters.\n",
  );
  await writeFixtureFile(
    root,
    "docs/CONTEXT.md",
    "# Context\n\nCurrent domain vocabulary.\n",
  );
  await writeFixtureFile(
    root,
    "docs/preset-format.md",
    "# Preset format\n\nCurrent authored composition contract.\n",
  );
  await writeFixtureFile(
    root,
    "docs/engine-architecture.md",
    "# Engine architecture\n\nCurrent render architecture.\n",
  );
  await writeFixtureFile(
    root,
    "docs/adr/README.md",
    "# ADR index\n\n| ADR | Status | Decision |\n| --- | --- | --- |\n| [0001](0001-typed-planning.md) | Canon | Typed planning inventory |\n",
  );
  await writeFixtureFile(
    root,
    "docs/adr/0001-typed-planning.md",
    "# Typed planning\n\nStatus: Canon\n\nUse typed planning inventory.\n",
  );
  await writeFixtureFile(
    root,
    "docs/briefs/README.md",
    "# Briefs\n\nActive work.\n",
  );
  await writeFixtureFile(
    root,
    "docs/briefs/active-piece.md",
    "# Active Piece\n\nAn active Preset brief.\n",
  );
  await writeFixtureFile(
    root,
    "docs/ideas/README.md",
    "# Ideas\n\n- [`future-planner.md`](future-planner.md) — speculative planning helper.\n",
  );
  await writeFixtureFile(
    root,
    "docs/ideas/future-planner.md",
    "# Future Planner\n\nSpeculative helper.\n",
  );
  await writeFixtureFile(
    root,
    "docs/history/README.md",
    "# History\n\n- [`old-planner.md`](old-planner.md) — retired planning helper.\n",
  );
  await writeFixtureFile(
    root,
    "docs/history/old-planner.md",
    "# Old Planner\n\nRetired helper.\n",
  );
  return root;
}

const planningState = {
  dataReference: "swamp:data/repo-audit/planning-latest@fixture",
  generatedAt: "2026-08-06T00:00:00.000Z",
  clean: true,
  runway: {
    activeLanes: [],
    readyLanes: [{
      rootEpicId: "planning-epic",
      nextTaskId: "adapter-task",
      nextTaskName: "Build planning adapters",
      topPriority: 2,
      readyLeafCount: 1,
    }],
    activeTaskId: "",
    activeTaskName: "",
    activeEpicId: "",
    nextTaskId: "adapter-task",
    nextTaskName: "Build planning adapters",
    topPriority: 2,
    readyLeafCount: 1,
  },
};

const rawTasks = [
  {
    id: "adapter-task",
    parent_id: "planning-epic",
    name: "Build planning adapters",
    description: "Typed inventory and documentation effects",
    priority: 2,
    completed: false,
    started_at: "2026-08-06T00:00:00.000Z",
    blockedBy: [],
    blocks: ["consumer-task"],
  },
  {
    id: "planning-epic",
    parent_id: null,
    name: "Planning Factory",
    description: "Parent epic",
    priority: 1,
    completed: false,
    started_at: null,
    blockedBy: [],
    blocks: [],
  },
  {
    id: "duplicate-task",
    parent_id: null,
    name: "Build typed planning inventory adapter",
    description: "Documentation effects and duplicate task inventory",
    priority: 2,
    completed: false,
    started_at: null,
    blockedBy: [],
    blocks: [],
  },
];

Deno.test("planning collector inventories all policy tiers once with stable fingerprints", async () => {
  const root = await fixtureRepository();
  try {
    const markdown = await readSupersPlanningMarkdownSources(root);
    assertEquals(markdown.adrs.map((entry) => entry.status), ["Canon"]);
    assertEquals(markdown.briefs.map((entry) => entry.path), [
      "docs/briefs/active-piece.md",
    ]);
    assertEquals(markdown.ideas.length, 1);
    assertEquals(markdown.history.length, 1);

    const args = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "adapter-task",
      planningState,
      unresolvedDecisions: [],
    });
    const dexTasks = normalizeSupersDexTasks(rawTasks);
    const first = await buildSupersPlanningSourceSnapshot(
      args,
      markdown,
      dexTasks,
    );
    const second = await buildSupersPlanningSourceSnapshot(
      args,
      markdown,
      dexTasks,
    );
    assertEquals(first, second);

    const inventory = await deriveSupersPlanningInventory(args, first);
    assertEquals(inventory.clarificationRequired, false);
    assert(inventory.contextRefs.some((entry) => entry.kind === "roadmap"));
    assert(inventory.contextRefs.some((entry) => entry.kind === "adr-index"));
    assert(
      inventory.contextRefs.some((entry) => entry.kind === "active-brief"),
    );
    assert(inventory.contextRefs.some((entry) => entry.kind === "ideas-index"));
    assert(
      inventory.contextRefs.some((entry) => entry.kind === "history-index"),
    );
    assert(
      inventory.contextRefs.some((entry) => entry.kind === "planning-runway"),
    );
    assert(inventory.contextRefs.some((entry) => entry.kind === "dex-graph"));
    const judgmentInventory = await deriveSupersPlanningInventory(
      SupersPlanningInventoryArgumentsSchema.parse({
        workItem: "adapter-task",
        planningState,
        unresolvedDecisions: [{
          id: "documentation-impact",
          question: "Should the roadmap or an ADR change?",
          reason: "Repository facts cannot decide product intent.",
        }],
      }),
      first,
    );
    assertEquals(judgmentInventory.clarificationRequired, true);
    assertEquals(judgmentInventory.unresolvedDecisions.length, 1);
    const crowdedSnapshot = {
      ...first,
      briefs: Array.from({ length: 100 }, (_, index) => ({
        ...first.briefs[0]!,
        path: `docs/briefs/active-${index}.md`,
        title: `Active ${index}`,
      })),
    };
    const crowdedInventory = await deriveSupersPlanningInventory(
      args,
      crowdedSnapshot,
    );
    assertEquals(crowdedInventory.contextRefs.length, 75);
    for (
      const coreKind of [
        "roadmap",
        "adr-index",
        "ideas-index",
        "history-index",
        "planning-runway",
        "dex-graph",
      ]
    ) {
      assert(
        crowdedInventory.contextRefs.some((entry) => entry.kind === coreKind),
      );
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("planning source boundary rejects hostile indexes, symlinks, and oversized files", async () => {
  const traversalRoot = await fixtureRepository();
  try {
    await Deno.writeTextFile(
      `${traversalRoot}/docs/ideas/README.md`,
      "# Ideas\n\n- [`outside.md`](../../../outside.md) — invalid.\n",
    );
    await assertRejects(
      () => readSupersPlanningMarkdownSources(traversalRoot),
      Error,
      "invalid source path",
    );
  } finally {
    await Deno.remove(traversalRoot, { recursive: true });
  }

  const symlinkRoot = await fixtureRepository();
  try {
    await Deno.writeTextFile(
      `${symlinkRoot}/outside.md`,
      "# Secret\n\nprivate\n",
    );
    await Deno.remove(`${symlinkRoot}/docs/ideas/future-planner.md`);
    await Deno.symlink(
      `${symlinkRoot}/outside.md`,
      `${symlinkRoot}/docs/ideas/future-planner.md`,
    );
    await assertRejects(
      () => readSupersPlanningMarkdownSources(symlinkRoot),
      Error,
      "Could not read planning source",
    );
  } finally {
    await Deno.remove(symlinkRoot, { recursive: true });
  }

  const oversizedRoot = await fixtureRepository();
  try {
    await Deno.writeTextFile(
      `${oversizedRoot}/docs/roadmap.md`,
      `# Roadmap\n\n${"x".repeat(256 * 1024)}`,
    );
    await assertRejects(
      () => readSupersPlanningMarkdownSources(oversizedRoot),
      Error,
      "Could not read planning source",
    );
  } finally {
    await Deno.remove(oversizedRoot, { recursive: true });
  }
});

Deno.test("tracker inventory derives duplicate candidates from stored data", async () => {
  assertThrows(
    () => normalizeSupersDexTasks([{ ...rawTasks[0], blockedBy: [42] }]),
    Error,
    "array of task IDs",
  );
  const root = await fixtureRepository();
  try {
    const args = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "adapter-task",
      planningState,
      unresolvedDecisions: [],
    });
    const snapshot = await buildSupersPlanningSourceSnapshot(
      args,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks(rawTasks),
    );
    const inventory = await deriveSupersPlanningInventory(args, snapshot);
    const tracker = await deriveSupersTrackerInventory({
      workItem: "adapter-task",
      inventory,
      sourceSnapshot: snapshot,
    });
    assertEquals(tracker.duplicateRisk, true);
    assertEquals(tracker.relatedTasks[0]?.relationship, "current");
    assert(tracker.relatedTasks.some((task) => task.id === "planning-epic"));
    assert(tracker.relatedTasks.some((task) => task.id === "duplicate-task"));
    await assertRejects(
      () =>
        deriveSupersTrackerInventory({
          workItem: "adapter-task",
          inventory,
          sourceSnapshot: {
            ...snapshot,
            roadmap: { ...snapshot.roadmap, title: "Tampered roadmap" },
          },
        }),
      Error,
      "fingerprint",
    );
    const interleavedSnapshot = await buildSupersPlanningSourceSnapshot(
      args,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks([
        ...rawTasks,
        {
          id: "other-task",
          parent_id: null,
          name: "Unrelated change",
          description: "A later snapshot revision",
          priority: 5,
          completed: false,
          started_at: null,
          blockedBy: [],
          blocks: [],
        },
      ]),
    );
    await assertRejects(
      () =>
        deriveSupersTrackerInventory({
          workItem: "adapter-task",
          inventory,
          sourceSnapshot: interleavedSnapshot,
        }),
      Error,
      "does not match",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("duplicate risk survives more than twenty-five structural relations", async () => {
  const root = await fixtureRepository();
  try {
    const args = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "adapter-task",
      planningState,
      unresolvedDecisions: [],
    });
    const crowdedTasks = [
      rawTasks[0],
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `child-${index}`,
        parent_id: "adapter-task",
        name: `Structural child ${index}`,
        description: "Different implementation detail",
        priority: 5,
        completed: false,
        started_at: null,
        blockedBy: [],
        blocks: [],
      })),
      {
        id: "duplicate-after-children",
        parent_id: null,
        name: "Typed inventory documentation effects",
        description: "Typed inventory documentation effects adapter",
        priority: 2,
        completed: false,
        started_at: null,
        blockedBy: [],
        blocks: [],
      },
    ];
    const snapshot = await buildSupersPlanningSourceSnapshot(
      args,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks(crowdedTasks),
    );
    const inventory = await deriveSupersPlanningInventory(args, snapshot);
    const tracker = await deriveSupersTrackerInventory({
      workItem: "adapter-task",
      inventory,
      sourceSnapshot: snapshot,
    });
    assertEquals(tracker.relatedTasks.length, 25);
    assertEquals(tracker.duplicateRisk, true);
    assert(
      tracker.relatedTasks.some((task) =>
        task.id === "duplicate-after-children"
      ),
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("documentation adapter validates proposals without writing planning files", async () => {
  const root = await fixtureRepository();
  try {
    const args = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "adapter-task",
      planningState,
      unresolvedDecisions: [],
    });
    const snapshot = await buildSupersPlanningSourceSnapshot(
      args,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks(rawTasks),
    );
    const inventory = await deriveSupersPlanningInventory(args, snapshot);
    const trackerInventory = await deriveSupersTrackerInventory({
      workItem: "adapter-task",
      inventory,
      sourceSnapshot: snapshot,
    });
    const roadmapBefore = await Deno.readTextFile(`${root}/docs/roadmap.md`);
    const proposal = await deriveSupersDocumentationEffects({
      workItem: "adapter-task",
      inventory,
      trackerInventory,
      sourceSnapshot: snapshot,
      intent: {
        schemaVersion: 1,
        status: "ready",
        objective: snapshot.objective,
        outcome: "Roadmap records the approved planning outcome.",
        inScope: ["planning documentation"],
        outOfScope: ["implementation"],
        constraints: ["proposal only"],
        acceptanceCriteria: ["Roadmap effect is explicit"],
        tasteDecisions: [],
        documentationDirectives: [
          {
            operation: "update",
            documentKind: "roadmap",
            target: "docs/roadmap.md",
            rationale: "Record the approved planning outcome.",
          },
          {
            operation: "no-change",
            documentKind: "adr",
            target: "docs/adr/README.md",
            rationale: "No architecture decision changed.",
          },
        ],
        revision: 1,
        summary: "Planning documentation policy is explicit.",
      },
    });
    assertEquals(proposal.effects.map((effect) => effect.target), [
      "docs/adr/README.md",
      "docs/roadmap.md",
    ]);
    assertEquals(
      await Deno.readTextFile(`${root}/docs/roadmap.md`),
      roadmapBefore,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("documentation adapter accepts indexed create and retire but rejects unsafe proposals", async () => {
  const root = await fixtureRepository();
  try {
    const args = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "adapter-task",
      planningState,
      unresolvedDecisions: [],
    });
    const snapshot = await buildSupersPlanningSourceSnapshot(
      args,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks(rawTasks),
    );
    const inventory = await deriveSupersPlanningInventory(args, snapshot);
    const trackerInventory = await deriveSupersTrackerInventory({
      workItem: "adapter-task",
      inventory,
      sourceSnapshot: snapshot,
    });
    const intentBase = {
      schemaVersion: 1 as const,
      status: "ready" as const,
      objective: snapshot.objective,
      outcome: "Architecture decision recorded.",
      inScope: ["architecture docs"],
      outOfScope: ["implementation"],
      constraints: ["proposal only"],
      acceptanceCriteria: ["Decision is indexed"],
      tasteDecisions: [] as string[],
      revision: 1,
      summary: "Architecture documentation proposal.",
    };
    const validNoChangeDirective = {
      operation: "no-change" as const,
      documentKind: "roadmap" as const,
      target: "docs/roadmap.md",
      rationale: "Roadmap remains current.",
    };
    await assertRejects(
      () =>
        deriveSupersDocumentationEffects({
          workItem: "adapter-task",
          inventory,
          trackerInventory,
          sourceSnapshot: snapshot,
          intent: {
            ...intentBase,
            documentationDirectives: [{
              operation: "no-change",
              documentKind: "idea",
              target: "docs/ideas/not-present.md",
              rationale: "Invalid absent no-change target.",
            }],
          },
        }),
      Error,
      "does not exist",
    );
    await assertRejects(
      () =>
        deriveSupersDocumentationEffects({
          workItem: "adapter-task",
          inventory,
          trackerInventory,
          sourceSnapshot: snapshot,
          intent: {
            ...intentBase,
            documentationDirectives: [{
              operation: "retire",
              documentKind: "idea",
              target: "docs/ideas/README.md",
              rationale: "Invalid index retirement.",
            }],
          },
        }),
      Error,
      "cannot be retired",
    );
    await assertRejects(
      () =>
        deriveSupersDocumentationEffects({
          workItem: "adapter-task",
          inventory,
          trackerInventory,
          sourceSnapshot: snapshot,
          intent: {
            ...intentBase,
            objective: "Different objective",
            documentationDirectives: [validNoChangeDirective],
          },
        }),
      Error,
      "preserve the planning objective",
    );
    const alternateInventory = await deriveSupersPlanningInventory(
      SupersPlanningInventoryArgumentsSchema.parse({
        workItem: "adapter-task",
        planningState,
        unresolvedDecisions: [{
          id: "other-cycle",
          question: "A different cycle?",
          reason: "Exercise artifact-chain validation.",
        }],
      }),
      snapshot,
    );
    const alternateTracker = await deriveSupersTrackerInventory({
      workItem: "adapter-task",
      inventory: alternateInventory,
      sourceSnapshot: snapshot,
    });
    await assertRejects(
      () =>
        deriveSupersDocumentationEffects({
          workItem: "adapter-task",
          inventory,
          trackerInventory: alternateTracker,
          sourceSnapshot: snapshot,
          intent: {
            ...intentBase,
            documentationDirectives: [validNoChangeDirective],
          },
        }),
      Error,
      "artifact chain",
    );

    const createProposal = await deriveSupersDocumentationEffects({
      workItem: "adapter-task",
      inventory,
      trackerInventory,
      sourceSnapshot: snapshot,
      intent: {
        ...intentBase,
        documentationDirectives: [
          {
            operation: "create",
            documentKind: "adr",
            target: "docs/adr/0002-new-decision.md",
            rationale: "Record the decision.",
          },
          {
            operation: "update",
            documentKind: "adr",
            target: "docs/adr/README.md",
            rationale: "Index the new decision.",
          },
        ],
      },
    });
    assertEquals(createProposal.effects.length, 2);
    const retireProposal = await deriveSupersDocumentationEffects({
      workItem: "adapter-task",
      inventory,
      trackerInventory,
      sourceSnapshot: snapshot,
      intent: {
        ...intentBase,
        documentationDirectives: [
          {
            operation: "retire",
            documentKind: "idea",
            target: "docs/ideas/future-planner.md",
            rationale: "The idea is no longer active speculation.",
          },
          {
            operation: "update",
            documentKind: "idea",
            target: "docs/ideas/README.md",
            rationale: "Remove the retired idea from the index.",
          },
        ],
      },
    });
    assertEquals(retireProposal.effects.length, 2);

    await assertRejects(
      () =>
        deriveSupersDocumentationEffects({
          workItem: "adapter-task",
          inventory,
          trackerInventory,
          sourceSnapshot: snapshot,
          intent: {
            ...intentBase,
            documentationDirectives: [{
              operation: "create",
              documentKind: "adr",
              target: "docs/adr/0002-new-decision.md",
              rationale: "Record the decision.",
            }],
          },
        }),
      Error,
      "index update",
    );
    await assertRejects(
      () =>
        deriveSupersDocumentationEffects({
          workItem: "adapter-task",
          inventory,
          trackerInventory,
          sourceSnapshot: snapshot,
          intent: {
            ...intentBase,
            documentationDirectives: [{
              operation: "create",
              documentKind: "adr",
              target: "docs/adr/../secrets.md",
              rationale: "Invalid target.",
            }],
          },
        }),
      Error,
      "outside",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("plan application normalization and audit preserve typed success and failure evidence", async () => {
  const hash = "a".repeat(64);
  const idempotencyKey = "b".repeat(64);
  const approvedPlan = {
    schemaVersion: 1 as const,
    planId: "approved-wrapper-plan-v1",
    tasks: [
      {
        kind: "create" as const,
        clientRef: "first-task",
        name: "First approved task",
        description: "Create the first approved task.",
        priority: 2,
        parent: { kind: "root" as const },
        blockedBy: [],
      },
      {
        kind: "create" as const,
        clientRef: "second-task",
        name: "Second approved task",
        description: "Create the dependent approved task.",
        priority: 3,
        parent: {
          kind: "reference" as const,
          clientRef: "first-task",
        },
        blockedBy: ["first-task"],
      },
    ],
  };
  const mappings = [
    {
      clientRef: "first-task",
      dexTaskId: "dex-first",
      disposition: "created" as const,
    },
    {
      clientRef: "second-task",
      dexTaskId: "dex-second",
      disposition: "created" as const,
    },
  ];
  const successReceipt = {
    schemaVersion: 1 as const,
    adapterVersion: "2026.08.06.1" as const,
    planId: approvedPlan.planId,
    planHash: hash,
    idempotencyKey,
    ownerToken: "supers-planning",
    attempt: 1,
    occurredAt: "2026-08-06T00:00:00.000Z",
    checkpointName: `apply-plan-checkpoint-${idempotencyKey}`,
    taskIdsByClientRef: {
      "first-task": "dex-first",
      "second-task": "dex-second",
    },
    status: "succeeded" as const,
    retryDisposition: null,
    errorCode: null,
    failedClientRef: null,
    resultName: `apply-plan-result-${idempotencyKey}`,
  };
  const result = {
    schemaVersion: 1 as const,
    adapterVersion: "2026.08.06.1" as const,
    planId: approvedPlan.planId,
    planHash: hash,
    idempotencyKey,
    ownerToken: "supers-planning",
    status: "succeeded" as const,
    appliedAt: "2026-08-06T00:00:00.000Z",
    taskIdsByClientRef: successReceipt.taskIdsByClientRef,
    mappings,
  };
  const successCheckpoint = {
    schemaVersion: 1 as const,
    adapterVersion: "2026.08.06.1" as const,
    planId: approvedPlan.planId,
    planHash: hash,
    idempotencyKey,
    ownerToken: "supers-planning",
    attempt: 1,
    status: "succeeded" as const,
    phase: "persist-result" as const,
    retryDisposition: null,
    errorCode: null,
    failedClientRef: null,
    startedAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:01.000Z",
    baselineTaskIds: [],
    taskIdsByClientRef: successReceipt.taskIdsByClientRef,
    operations: [],
  };
  const application = normalizeSupersPlanApplication({
    workItem: "adapter-task",
    approvedPlan,
    checkpoint: successCheckpoint,
    receipt: successReceipt,
    receiptDataName: `apply-plan-receipt-${idempotencyKey}`,
    result,
    resultDataName: result === null ? "" : successReceipt.resultName,
  });
  assertEquals(application.status, "succeeded");
  assertEquals(application.mappings, mappings);
  assertThrows(
    () =>
      normalizeSupersPlanApplication({
        workItem: "adapter-task",
        approvedPlan,
        checkpoint: { ...successCheckpoint, status: "failed" },
        receipt: successReceipt,
        receiptDataName: `apply-plan-receipt-${idempotencyKey}`,
        result,
        resultDataName: successReceipt.resultName,
      }),
    Error,
    "matching result",
  );
  assertThrows(
    () =>
      normalizeSupersPlanApplication({
        workItem: "adapter-task",
        approvedPlan,
        checkpoint: successCheckpoint,
        receipt: successReceipt,
        receiptDataName: "unrelated-receipt",
        result,
        resultDataName: successReceipt.resultName,
      }),
    Error,
    "does not match the approved plan",
  );

  const root = await fixtureRepository();
  try {
    const inventoryArgs = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "adapter-task",
      planningState,
      unresolvedDecisions: [],
    });
    const sourceSnapshot = await buildSupersPlanningSourceSnapshot(
      inventoryArgs,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks(rawTasks),
    );
    const inventory = await deriveSupersPlanningInventory(
      inventoryArgs,
      sourceSnapshot,
    );
    const trackerInventory = await deriveSupersTrackerInventory({
      workItem: "adapter-task",
      inventory,
      sourceSnapshot,
    });
    const documentationEffects = await deriveSupersDocumentationEffects({
      workItem: "adapter-task",
      inventory,
      trackerInventory,
      sourceSnapshot,
      intent: {
        schemaVersion: 1,
        status: "ready",
        objective: inventory.objective,
        outcome: "Apply the approved wrapper plan.",
        inScope: ["Typed application evidence"],
        outOfScope: [],
        constraints: ["No documentation mutation"],
        acceptanceCriteria: ["Mappings pass a fresh Dex audit"],
        tasteDecisions: [],
        documentationDirectives: [{
          operation: "no-change",
          documentKind: "roadmap",
          target: "docs/roadmap.md",
          rationale: "The approved plan does not change roadmap claims.",
        }],
        revision: 1,
        summary: "Audit the approved application.",
      },
    });
    const dexTasks = normalizeSupersDexTasks([
      {
        id: "dex-first",
        parent_id: null,
        name: "First approved task",
        description: "Create the first approved task.",
        priority: 2,
        completed: false,
        started_at: null,
        blockedBy: [],
        blocks: ["dex-second"],
      },
      {
        id: "dex-second",
        parent_id: "dex-first",
        name: "Second approved task",
        description: "Create the dependent approved task.",
        priority: 3,
        completed: false,
        started_at: null,
        blockedBy: ["dex-first"],
        blocks: [],
      },
    ]);
    const audit = await auditSupersPlanningApplication(
      {
        workItem: "adapter-task",
        approvedPlan,
        application,
        documentationEffects,
      },
      dexTasks,
    );
    assertEquals(audit.status, "passed");
    assertEquals(audit.verifiedTaskIds, ["dex-first", "dex-second"]);

    const driftedAudit = await auditSupersPlanningApplication(
      {
        workItem: "adapter-task",
        approvedPlan,
        application,
        documentationEffects,
      },
      dexTasks.map((task) =>
        task.id === "dex-second" ? { ...task, priority: 99 } : task
      ),
    );
    assertEquals(driftedAudit.status, "failed");
    assert(
      driftedAudit.unresolvedIssues.some((issue) =>
        issue.includes("content drifted")
      ),
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }

  const failed = normalizeSupersPlanApplication({
    workItem: "adapter-task",
    approvedPlan,
    checkpoint: null,
    receipt: {
      ...successReceipt,
      status: "failed",
      retryDisposition: "manual-review",
      errorCode: "verification-failed",
      failedClientRef: "second-task",
      resultName: null,
      taskIdsByClientRef: { "first-task": "dex-first" },
    },
    receiptDataName: `apply-plan-receipt-${idempotencyKey}`,
    result: null,
    resultDataName: "",
  });
  assertEquals(failed.status, "failed");
  assertEquals(failed.retryDisposition, "manual-review");
  assertEquals(failed.resultDataName, "");
  assertEquals(failed.mappings, [mappings[0]]);
});

Deno.test("delivery handoff binds the audited mapping to current human approval and epic boundary", async () => {
  const proposalHash = "c".repeat(64);
  const plan = {
    schemaVersion: 1 as const,
    planId: "delivery-handoff-plan-v1",
    epic: {
      clientRef: "delivery-epic",
      name: "Approved delivery epic",
      description: "Human-approved Delivery boundary.",
      priority: 1,
      blockedBy: [],
    },
    tasks: [{
      kind: "create" as const,
      clientRef: "delivery-leaf",
      name: "Approved delivery leaf",
      description: "The one audited ready leaf.",
      priority: 2,
      parent: { kind: "reference" as const, clientRef: "delivery-epic" },
      blockedBy: [],
    }],
  };
  const application = {
    schemaVersion: 1 as const,
    status: "succeeded" as const,
    planId: plan.planId,
    planHash: proposalHash,
    idempotencyKey: "e".repeat(64),
    attempt: 1,
    checkpointDataName: "checkpoint",
    receiptDataName: "receipt",
    resultDataName: "result",
    mappings: [
      {
        clientRef: "delivery-epic",
        dexTaskId: "epic-1",
        disposition: "created" as const,
      },
      {
        clientRef: "delivery-leaf",
        dexTaskId: "leaf-1",
        disposition: "created" as const,
      },
    ],
    retryDisposition: "none" as const,
    errorCode: "",
    summary: "Applied.",
  };
  const args = {
    planningWorkItem: "planning-1",
    proposalCycle: 1,
    graphProposal: {
      schemaVersion: 1 as const,
      plan,
      planHash: proposalHash,
      documentationEffectsFingerprint: "f".repeat(64),
      summary: "Proposed.",
    },
    approvedPlan: {
      schemaVersion: 1 as const,
      plan,
      planHash: proposalHash,
      proposalPlanHash: proposalHash,
      approvalGateId: "planning-approval",
      summary: "Approved.",
    },
    humanApproval: {
      gateId: "planning-approval",
      workItem: "planning-1",
      decision: "approved" as const,
      actor: "human-reviewer",
      note: "Human approved the exact reviewed plan.",
      stageId: "plan-review" as const,
      cycle: 1,
      decidedAt: "2026-08-06T20:00:00.000Z",
    },
    application,
    planningAudit: {
      schemaVersion: 1 as const,
      status: "passed" as const,
      planId: plan.planId,
      verifiedTaskIds: ["epic-1", "leaf-1"],
      unresolvedIssues: [],
      summary: "Verified.",
    },
    planningHandoff: {
      schemaVersion: 1 as const,
      status: "ready" as const,
      planId: plan.planId,
      candidateTaskId: "leaf-1",
      summary: "Ready.",
    },
  };
  const prepared = await prepareFixtureDeliveryHandoff(args);
  assertEquals(prepared.status, "ready");
  assertEquals(prepared.approvedEpicTaskId, "epic-1");
  assertEquals(prepared.candidateTaskId, "leaf-1");
  assertEquals(prepared.approvedTaskIds, ["epic-1", "leaf-1"]);
  const conflictingMappedBoundary = await prepareFixtureDeliveryHandoff({
    ...args,
    planningHandoff: {
      ...args.planningHandoff,
      approvedEpicTaskId: "leaf-1",
    },
  });
  assertEquals(conflictingMappedBoundary.status, "human-gate");
  assertEquals(conflictingMappedBoundary.approvedEpicTaskId, null);
  const flattenedPlan = {
    schemaVersion: 1 as const,
    planId: plan.planId,
    tasks: [{
      kind: "create" as const,
      clientRef: plan.epic.clientRef,
      name: plan.epic.name,
      description: plan.epic.description,
      priority: plan.epic.priority,
      parent: { kind: "root" as const },
      blockedBy: plan.epic.blockedBy,
    }, ...plan.tasks],
  };
  const flattenedPrepared = await prepareFixtureDeliveryHandoff({
    ...args,
    graphProposal: { ...args.graphProposal, plan: flattenedPlan },
    approvedPlan: { ...args.approvedPlan, plan: flattenedPlan },
  });
  assertEquals(flattenedPrepared.status, "ready");
  assertEquals(flattenedPrepared.approvedEpicTaskId, "epic-1");
  const reviewedPlan = {
    schemaVersion: 1 as const,
    planId: plan.planId,
    createTasks: [{
      clientRef: plan.epic.clientRef,
      name: plan.epic.name,
      description: plan.epic.description,
      priority: plan.epic.priority,
      parentKind: "root" as const,
      parentClientRef: "",
      blockedBy: plan.epic.blockedBy,
    }, {
      clientRef: "delivery-leaf",
      name: "Approved delivery leaf",
      description: "The one audited ready leaf.",
      priority: 2,
      parentKind: "reference" as const,
      parentClientRef: "delivery-epic",
      blockedBy: [],
    }],
    attachExistingTasks: [],
  };
  const reviewedPrepared = await prepareFixtureDeliveryHandoff({
    ...args,
    graphProposal: { ...args.graphProposal, plan: reviewedPlan },
    approvedPlan: { ...args.approvedPlan, plan: reviewedPlan },
    application: { ...args.application, planHash: "d".repeat(64) },
  });
  assertEquals(reviewedPrepared.status, "ready");
  assertEquals(reviewedPrepared.approvedEpicTaskId, "epic-1");
  assertEquals(reviewedPrepared.planHash, "d".repeat(64));

  const attachedExistingRootPlan = {
    schemaVersion: 1 as const,
    planId: plan.planId,
    createTasks: [{
      clientRef: "delivery-leaf",
      name: "Approved delivery leaf",
      description: "The one audited ready leaf.",
      priority: 2,
      parentKind: "reference" as const,
      parentClientRef: "existing-root",
      blockedBy: [],
    }],
    attachExistingTasks: [{
      clientRef: "existing-root",
      selectorKind: "id" as const,
      selectorValue: "epic-existing",
      expectedName: "Existing approved epic",
      expectedDescription: "Existing human-approved Delivery boundary.",
      expectedPriority: 1,
      parentKind: "preserve" as const,
      parentClientRef: "",
      addBlockedBy: [],
    }],
  };
  const attachedApplication = {
    ...args.application,
    mappings: [{
      clientRef: "existing-root",
      dexTaskId: "epic-existing",
      disposition: "attachedExisting" as const,
    }, {
      clientRef: "delivery-leaf",
      dexTaskId: "leaf-1",
      disposition: "created" as const,
    }],
  };
  const attachedArgs = {
    ...args,
    graphProposal: { ...args.graphProposal, plan: attachedExistingRootPlan },
    approvedPlan: { ...args.approvedPlan, plan: attachedExistingRootPlan },
    application: attachedApplication,
    planningAudit: {
      ...args.planningAudit,
      verifiedTaskIds: ["epic-existing", "leaf-1"],
    },
    planningHandoff: {
      ...args.planningHandoff,
      approvedEpicTaskId: "epic-existing",
    },
  };
  const attachedPrepared = await prepareFixtureDeliveryHandoff(attachedArgs);
  assertEquals(attachedPrepared.status, "ready");
  assertEquals(attachedPrepared.approvedEpicTaskId, "epic-existing");
  assertEquals(attachedPrepared.approvedTaskIds, ["epic-existing", "leaf-1"]);
  assertEquals(
    attachedPrepared.planningHandoffFingerprint,
    (await prepareFixtureDeliveryHandoff(attachedArgs))
      .planningHandoffFingerprint,
  );

  const unmappedBoundary = await prepareFixtureDeliveryHandoff({
    ...attachedArgs,
    planningHandoff: {
      ...attachedArgs.planningHandoff,
      approvedEpicTaskId: "outside-approved-plan",
    },
  });
  assertEquals(unmappedBoundary.status, "human-gate");
  assertEquals(unmappedBoundary.approvedEpicTaskId, null);
  assert(
    unmappedBoundary.summary.includes(
      "not an exact approved and audited mapping",
    ),
  );
  assert(
    unmappedBoundary.planningHandoffFingerprint !==
      attachedPrepared.planningHandoffFingerprint,
  );

  const outcome = await normalizeSupersDeliveryHandoffOutcome({
    approval: prepared,
    claim: {
      schemaVersion: 1,
      adapterVersion: "2026.08.15.1",
      planningWorkItem: prepared.planningWorkItem,
      planId: prepared.planId,
      planHash: prepared.planHash,
      approvalFingerprint: prepared.approvalFingerprint,
      status: "claimed",
      reason: "claimed-ready-leaf",
      selectedTaskId: "leaf-1",
      approvedEpicTaskId: "epic-1",
      topPriority: 2,
      readyTaskIds: ["leaf-1"],
      activeFactoryWorkItems: [],
      trackerStarted: true,
      occurredAt: "2026-08-06T20:01:00.000Z",
    },
    factoryStates: [{ workItem: "leaf-1", status: "active" }],
  });
  assertEquals(outcome.status, "started");
  assertEquals(outcome.selectedTaskId, "leaf-1");
  await assertRejects(
    () =>
      normalizeSupersDeliveryHandoffOutcome({
        approval: prepared,
        claim: {
          schemaVersion: 1,
          adapterVersion: "2026.08.15.1",
          planningWorkItem: prepared.planningWorkItem,
          planId: prepared.planId,
          planHash: prepared.planHash,
          approvalFingerprint: prepared.approvalFingerprint,
          status: "claimed",
          reason: "claimed-ready-leaf",
          selectedTaskId: "leaf-1",
          approvedEpicTaskId: "epic-1",
          topPriority: 2,
          readyTaskIds: ["leaf-1"],
          activeFactoryWorkItems: [],
          trackerStarted: true,
          occurredAt: "2026-08-06T20:01:00.000Z",
        },
        factoryStates: [],
      }),
    Error,
    "exactly one Factory state",
  );

  await assertRejects(
    () =>
      prepareFixtureDeliveryHandoff({
        ...args,
        humanApproval: { ...args.humanApproval, gateId: "other-gate" },
      }),
    Error,
    "human-approved",
  );
  await assertRejects(
    () =>
      prepareFixtureDeliveryHandoff({
        ...args,
        proposalCycle: 2,
      }),
    Error,
    "human-approved",
  );
  await assertRejects(
    () =>
      prepareFixtureDeliveryHandoff({
        ...args,
        application: { ...args.application, idempotencyKey: "0".repeat(64) },
        planningAudit: {
          ...args.planningAudit,
          verifiedTaskIds: ["epic-1"],
        },
      }),
    Error,
    "audit-verified",
  );

  const gated = await prepareFixtureDeliveryHandoff({
    ...args,
    planningHandoff: {
      ...args.planningHandoff,
      candidateTaskId: "outside-1",
    },
  });
  assertEquals(gated.status, "human-gate");
  assertEquals(gated.candidateTaskId, null);
});

Deno.test("materialized Supers handoff normalizes claimed and terminal outcomes", async () => {
  const workflowDirectory = new URL("../../workflows/", import.meta.url);
  let handoffWorkflow = "";
  for await (const entry of Deno.readDir(workflowDirectory)) {
    if (!entry.isFile || !entry.name.endsWith(".yaml")) continue;
    const source = await Deno.readTextFile(
      new URL(entry.name, workflowDirectory),
    );
    if (source.includes("name: supers-planning-delivery-handoff")) {
      handoffWorkflow = source;
    }
  }
  assertEquals(
    handoffWorkflow.includes("name: normalize-claimed-delivery-handoff"),
    true,
  );
  assertEquals(
    handoffWorkflow.includes("name: normalize-terminal-delivery-handoff"),
    true,
  );
  assertEquals(handoffWorkflow.includes("factoryStates: []"), true);
});

Deno.test("new-idea planning inventory does not require a pre-approved Dex task", async () => {
  const root = await fixtureRepository();
  try {
    const args = SupersPlanningInventoryArgumentsSchema.parse({
      workItem: "animated-chart-components",
      planningState,
      unresolvedDecisions: [],
    });
    const snapshot = await buildSupersPlanningSourceSnapshot(
      args,
      await readSupersPlanningMarkdownSources(root),
      normalizeSupersDexTasks(rawTasks),
    );
    assertEquals(snapshot.objective, "animated chart components");
    assert(snapshot.objectiveRevision.startsWith(
      "intake:animated-chart-components@sha256:",
    ));
    const inventory = await deriveSupersPlanningInventory(args, snapshot);
    assertEquals(inventory.objective, "animated chart components");
    assertEquals(
      inventory.contextRefs.some((entry) =>
        entry.kind === "dex-task" && entry.name === "animated-chart-components"
      ),
      false,
    );
    const tracker = await deriveSupersTrackerInventory({
      workItem: args.workItem,
      inventory,
      sourceSnapshot: snapshot,
    });
    assertEquals(
      tracker.relatedTasks.some((task) => task.relationship === "current"),
      false,
    );
    const documentation = await deriveSupersDocumentationEffects({
      workItem: args.workItem,
      inventory,
      trackerInventory: tracker,
      sourceSnapshot: snapshot,
      intent: {
        schemaVersion: 1,
        status: "ready",
        objective: snapshot.objective,
        outcome: "A new chart domain is planned without a bootstrap Dex task.",
        inScope: ["chart domain"],
        outOfScope: ["implementation"],
        constraints: ["proposal only"],
        acceptanceCriteria: ["A Brief is proposed"],
        tasteDecisions: [],
        documentationDirectives: [{
          operation: "create",
          documentKind: "brief",
          target: "docs/briefs/animated-chart-domain.md",
          rationale: "Prepare the new chart domain for authoring.",
        }, {
          operation: "update",
          documentKind: "brief",
          target: "docs/briefs/README.md",
          rationale: "Index the new active Brief.",
        }],
        revision: 1,
        summary: "New-idea planning remains read-only before approval.",
      },
    });
    assertEquals(
      documentation.effects[0]?.target,
      "docs/briefs/animated-chart-domain.md",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
