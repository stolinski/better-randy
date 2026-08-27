import assert from "node:assert/strict";

import {
  compileDexPlanningFactoryProfile,
  type DexPlanningFactoryMethodContext,
  type DexPlanningFactoryProfile,
  DexPlanningFactoryProfileSchema,
  executeDexPlanningFactoryCompile,
  normalizeDexReviewedPlanForApplication,
} from "./dex-planning-factory-compiler.ts";
import { DexApprovedPlanSchema } from "./dex-plan-applier-adapter.ts";
import { model } from "./dex-planning-factory.ts";

const fixtureRoot = new URL(
  "../../fixtures/dex-planning-factory-consumer/",
  import.meta.url,
);

async function fixtureProfile(): Promise<DexPlanningFactoryProfile> {
  const raw = JSON.parse(
    await Deno.readTextFile(new URL("profile.json", fixtureRoot)),
  );
  return DexPlanningFactoryProfileSchema.parse(raw);
}

function stage(
  compiled: ReturnType<typeof compileDexPlanningFactoryProfile>,
  id: string,
): Record<string, unknown> {
  const found = compiled.factoryArguments.stages.find((candidate) =>
    candidate.id === id
  );
  assert.ok(found, `Expected stage ${id}`);
  return found;
}

function transitions(
  compiled: ReturnType<typeof compileDexPlanningFactoryProfile>,
  stageId: string,
): Array<Record<string, unknown>> {
  const value = stage(compiled, stageId).transitions;
  assert.ok(Array.isArray(value), `Expected transitions on ${stageId}`);
  return value as Array<Record<string, unknown>>;
}

function transition(
  compiled: ReturnType<typeof compileDexPlanningFactoryProfile>,
  stageId: string,
  name: string,
): Record<string, unknown> {
  const found = transitions(compiled, stageId).find((candidate) =>
    candidate.name === name
  );
  assert.ok(found, `Expected ${stageId}.${name}`);
  return found;
}

Deno.test("model exposes the locked Planning Factory compiler", () => {
  assert.equal(model.type, "@club_aqua_back_deck/dex-planning-factory");
  assert.equal(model.version, "2026.08.27.1");
  assert.deepEqual(Object.keys(model.resources), ["profile"]);
  assert.deepEqual(Object.keys(model.methods), ["compile"]);
});

Deno.test("profile compiles the bounded human-gated lifecycle", async () => {
  const profile = await fixtureProfile();
  const compiled = compileDexPlanningFactoryProfile(profile);
  assert.equal(compiled.target.type, "@swamp/software-factory");
  assert.equal(compiled.target.version, "2026.06.24.1");
  assert.deepEqual(
    compiled.factoryArguments.stages.map((candidate) => candidate.id),
    [
      "inventory",
      "tracker-inventory",
      "clarification",
      "clarified-intent",
      "documentation-effects",
      "graph-proposal",
      "plan-review",
      "approval",
      "plan-application",
      "planning-audit",
      "handoff",
      "done",
      "rejected",
      "parked",
      "failed-apply",
      "failed-audit",
      "aborted",
    ],
  );
  assert.equal(stage(compiled, "inventory").initial, true);
  for (
    const terminal of [
      "done",
      "rejected",
      "parked",
      "failed-apply",
      "failed-audit",
      "aborted",
    ]
  ) {
    assert.equal(stage(compiled, terminal).terminal, true);
  }
  assert.doesNotMatch(JSON.stringify(compiled), /supers|graffiti/i);
});

Deno.test("generic application-bundle hook previews, validates, and applies immediately after route-correct approval", async () => {
  const base = await fixtureProfile();
  const profile = DexPlanningFactoryProfileSchema.parse({
    ...base,
    adapters: {
      ...base.adapters,
      applicationBundle: {
        validator: {
          mode: "method",
          modelIdOrName: "consumer-policy",
          methodName: "validate-application-bundle",
          readOnly: true,
        },
      },
    },
  });
  const compiled = compileDexPlanningFactoryProfile(profile);

  assert.ok(
    compiled.factoryArguments.stages.some((candidate) =>
      candidate.id === "application-bundle-validation"
    ),
  );
  assert.equal(
    compiled.factoryArguments.stages.some((candidate) =>
      candidate.id === "approval"
    ),
    false,
  );
  assert.deepEqual(
    (stage(compiled, "graph-proposal").artifacts as Array<{ name: string }>)
      .map((artifact) => artifact.name),
    ["dex-graph-proposal", "application-bundle"],
  );
  assert.equal(
    transition(compiled, "graph-proposal", "validate-application-bundle").to,
    "application-bundle-validation",
  );
  const bundleValidation = JSON.stringify(
    stage(compiled, "application-bundle-validation"),
  );
  assert.match(
    bundleValidation,
    /consumer-policy.*validate-application-bundle.*application-bundle-validation/,
  );
  assert.match(bundleValidation, /dex_graph_proposal\.planHash/);
  assert.match(bundleValidation, /documentation_effects\.fingerprint/);

  const approvalFree = transition(
    compiled,
    "plan-review",
    "apply-without-graduation-approval",
  );
  assert.equal(approvalFree.to, "plan-application");
  assert.doesNotMatch(JSON.stringify(approvalFree), /human-approval/);
  const approved = transition(compiled, "plan-review", "approve-and-apply");
  assert.equal(approved.to, "plan-application");
  assert.match(JSON.stringify(approved), /human-approval/);

  const application = JSON.stringify(stage(compiled, "plan-application"));
  assert.match(application, /artifact-application-bundle/);
  assert.match(application, /artifact-application-bundle-validation/);
  assert.match(application, /approved-plan/);
  assert.match(application, /expectsDexMappings/);
  const audit = JSON.stringify(stage(compiled, "planning-audit"));
  assert.match(audit, /artifact-application-bundle/);
  assert.match(audit, /artifact-application-bundle-validation/);
});

Deno.test("profile reserves the only configured write slot for post-approval application", async () => {
  const profile = await fixtureProfile();
  assert.equal(profile.adapters.inventory.readOnly, true);
  assert.equal(profile.adapters.tracker.readOnly, true);
  assert.equal(profile.adapters.documentationPolicy.readOnly, true);
  assert.equal(profile.adapters.audit.readOnly, true);

  const compiled = compileDexPlanningFactoryProfile(profile);
  for (
    const stageId of [
      "inventory",
      "tracker-inventory",
      "clarification",
      "clarified-intent",
      "documentation-effects",
      "graph-proposal",
      "plan-review",
      "approval",
    ]
  ) {
    assert.doesNotMatch(
      JSON.stringify(stage(compiled, stageId).work),
      /consumer-apply-approved-plan|apply-plan/,
    );
  }
  assert.match(
    JSON.stringify(stage(compiled, "plan-application")),
    /consumer-apply-approved-plan/,
  );
  assert.doesNotMatch(JSON.stringify(compiled), /command|shell/);
});

Deno.test("repository adapters receive prior artifacts through compiler-owned CEL", async () => {
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  const tracker = JSON.stringify(stage(compiled, "tracker-inventory").work);
  const documentation = JSON.stringify(
    stage(compiled, "documentation-effects").work,
  );
  const audit = JSON.stringify(stage(compiled, "planning-audit").work);
  assert.match(tracker, /artifact-planning-inventory/);
  assert.match(documentation, /artifact-planning-inventory/);
  assert.match(documentation, /artifact-tracker-inventory/);
  assert.match(documentation, /artifact-clarified-intent/);
  assert.match(audit, /artifact-approved-plan/);
  assert.match(audit, /artifact-plan-application/);
  assert.match(audit, /artifact-documentation-effects/);
});

Deno.test("conditional grilling follows deterministic inventory", async () => {
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  const clarification = JSON.stringify(stage(compiled, "clarification"));
  assert.match(clarification, /clarificationRequired/);
  assert.match(clarification, /not-needed/);
  assert.match(clarification, /clarified/);
  assert.match(clarification, /parked/);
  assert.match(clarification, /Do not re-fetch repository facts/);
});

Deno.test("approved plan is exact, normalized, and assembled into the applier input by CEL", async () => {
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  const proposal = JSON.stringify(stage(compiled, "graph-proposal"));
  const approval = JSON.stringify(stage(compiled, "approval"));
  const application = JSON.stringify(stage(compiled, "plan-application"));

  assert.match(proposal, /createTasks/);
  assert.match(proposal, /attachExistingTasks/);
  assert.doesNotMatch(proposal, /oneOf|anyOf|additionalProperties":true/);
  assert.match(
    approval,
    /approved_plan\.plan == artifacts\.dex_graph_proposal\.plan/,
  );
  assert.match(application, /artifact-approved-plan/);
  assert.match(application, /createTasks\.map/);
  assert.match(application, /attachExistingTasks\.map/);
  assert.match(application, /"plan"/);
  assert.doesNotMatch(application, /artifact-dex-graph-proposal/);
});

Deno.test("normalized approved plan assembles into the real strict Plan Applier contract", async () => {
  const normalized = {
    schemaVersion: 1 as const,
    planId: "portable-plan-v1",
    createTasks: [
      {
        clientRef: "new-task",
        name: "Create the new task",
        description: "Typed create task",
        priority: 2,
        parentKind: "root" as const,
        parentClientRef: "",
        blockedBy: [] as string[],
      },
    ],
    attachExistingTasks: [
      {
        clientRef: "existing-task",
        selectorKind: "id" as const,
        selectorValue: "abc_123",
        expectedName: "Existing task",
        expectedDescription: "Existing typed task",
        expectedPriority: 3,
        parentKind: "preserve" as const,
        parentClientRef: "",
        addBlockedBy: ["new-task"],
      },
    ],
  };
  const plan = normalizeDexReviewedPlanForApplication(normalized);
  assert.deepEqual(DexApprovedPlanSchema.parse(plan), plan);
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  const application = stage(compiled, "plan-application");
  assert.equal((application.work as Record<string, unknown>).mode, "workflow");
  assert.match(
    JSON.stringify(application.work),
    /consumer-apply-approved-plan/,
  );
  assert.match(JSON.stringify(application.artifacts), /checkpointDataName/);
  assert.match(JSON.stringify(application.artifacts), /receiptDataName/);
  assert.match(JSON.stringify(application.artifacts), /retryDisposition/);
});

Deno.test("review acceptance requires clear findings and current-cycle human approval", async () => {
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  const review = JSON.stringify(stage(compiled, "plan-review"));
  assert.match(review, /findings-clear/);
  assert.match(review, /planning-approval/);
  assert.match(review, /stageId == state\.stageId/);
  assert.match(review, /cycle == state\.cycles\[state\.stageId\]/);
  assert.match(review, /decision == \\"rejected\\"/);
  assert.equal(transition(compiled, "plan-review", "approve").to, "approval");
  assert.equal(
    transition(compiled, "plan-review", "human-reject").to,
    "rejected",
  );
});

Deno.test("clean, revised, rejected, parked, and failed-apply fixtures follow emitted edges", async () => {
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  const fixture = JSON.parse(
    await Deno.readTextFile(new URL("lifecycle-paths.json", fixtureRoot)),
  ) as {
    paths: Array<{
      name: string;
      route: Array<{ from: string; transition: string; to: string }>;
      terminal: string;
      mutationStages: string[];
    }>;
  };
  assert.deepEqual(
    fixture.paths.map((candidate) => candidate.name),
    ["clean", "revised", "rejected", "parked", "failed-apply"],
  );

  for (const path of fixture.paths) {
    for (const edge of path.route) {
      assert.equal(
        transition(compiled, edge.from, edge.transition).to,
        edge.to,
        `${path.name}: ${edge.from}.${edge.transition}`,
      );
    }
    assert.equal(path.route.at(-1)?.to, path.terminal);
    assert.equal(stage(compiled, path.terminal).terminal, true);
    const enteredMutationStage = path.route.some((edge) =>
      edge.to === "plan-application"
    );
    assert.equal(
      path.mutationStages.includes("plan-application"),
      enteredMutationStage,
    );
  }
});

Deno.test("failed application cannot reach audit or handoff", async () => {
  const compiled = compileDexPlanningFactoryProfile(await fixtureProfile());
  assert.equal(
    transition(compiled, "plan-application", "failed-apply").to,
    "failed-apply",
  );
  assert.equal(
    transition(compiled, "plan-application", "audit").to,
    "planning-audit",
  );
  assert.match(
    JSON.stringify(transition(compiled, "plan-application", "audit")),
    /status == \\"succeeded\\"/,
  );
  const failedRoute = JSON.stringify(
    transition(compiled, "plan-application", "failed-apply"),
  );
  assert.match(failedRoute, /workflow-succeeded/);
  assert.match(failedRoute, /retryDisposition/);
  assert.match(failedRoute, /errorCode/);
  assert.equal(
    transitions(compiled, "plan-application").some((candidate) =>
      candidate.name === "retry"
    ),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(stage(compiled, "failed-apply")),
    /planning-audit|handoff/,
  );
});

Deno.test("profile schema rejects writable pre-approval and reserved adapter inputs", async () => {
  const writableInventory = structuredClone(await fixtureProfile()) as Record<
    string,
    unknown
  >;
  const writableAdapters = writableInventory.adapters as Record<
    string,
    Record<string, unknown>
  >;
  writableAdapters.inventory.readOnly = false;
  assert.equal(
    DexPlanningFactoryProfileSchema.safeParse(writableInventory).success,
    false,
  );

  const overriddenPlan = structuredClone(await fixtureProfile());
  overriddenPlan.adapters.planApplier.inputs = {
    values: { plan: {} },
    properties: { plan: { type: "object" } },
  };
  assert.equal(
    DexPlanningFactoryProfileSchema.safeParse(overriddenPlan).success,
    false,
  );
});

Deno.test("Supers adapter bindings preserve prior facts through CEL model data", async () => {
  const profile = await fixtureProfile();
  const bindings = JSON.parse(
    await Deno.readTextFile(
      new URL(
        "../../fixtures/dex-planning-factory-consumer/supers-adapter-bindings.json",
        import.meta.url,
      ),
    ),
  ) as {
    adapters: {
      inventory: DexPlanningFactoryProfile["adapters"]["inventory"];
      tracker: DexPlanningFactoryProfile["adapters"]["tracker"];
      documentationPolicy:
        DexPlanningFactoryProfile["adapters"]["documentationPolicy"];
      planApplier: DexPlanningFactoryProfile["adapters"]["planApplier"];
      audit: DexPlanningFactoryProfile["adapters"]["audit"];
    };
    methodContracts: Record<string, unknown>;
  };
  profile.adapters.inventory = bindings.adapters.inventory;
  profile.adapters.tracker = bindings.adapters.tracker;
  profile.adapters.documentationPolicy = bindings.adapters.documentationPolicy;
  profile.adapters.planApplier = bindings.adapters.planApplier;
  profile.adapters.audit = bindings.adapters.audit;
  const compiled = compileDexPlanningFactoryProfile(profile);

  assert.match(
    JSON.stringify(stage(compiled, "inventory").work),
    /supers-planning-inventory/,
  );
  assert.match(
    JSON.stringify(stage(compiled, "tracker-inventory").work),
    /supers-planning-tracker-inventory/,
  );
  assert.match(
    JSON.stringify(stage(compiled, "documentation-effects").work),
    /supers-planning-documentation-effects/,
  );
  assert.match(
    JSON.stringify(stage(compiled, "plan-application").work),
    /supers-planning-apply-approved-plan/,
  );
  assert.match(
    JSON.stringify(stage(compiled, "planning-audit").work),
    /supers-planning-audit/,
  );
  const methodContracts = JSON.stringify(bindings.methodContracts);
  assert.match(methodContracts, /data\.latest.*repo-audit.*planning-latest/);
  assert.match(methodContracts, /sourceSnapshotName/);
  assert.match(methodContracts, /artifact-planning-inventory/);
  assert.match(methodContracts, /artifact-tracker-inventory/);
  assert.match(methodContracts, /artifact-clarified-intent/);
  assert.match(methodContracts, /validate-promotion-bundle/);
  assert.match(methodContracts, /normalize-promotion-application/);
  assert.match(methodContracts, /audit-planning-promotion/);
});

Deno.test("Supers profile compiles the complete materialized workflow set", async () => {
  const profile = DexPlanningFactoryProfileSchema.parse(
    JSON.parse(
      await Deno.readTextFile(new URL("supers-profile.json", fixtureRoot)),
    ),
  );
  const compiled = compileDexPlanningFactoryProfile(profile);
  const workflowNames = [
    "supers-planning-inventory",
    "supers-planning-tracker-inventory",
    "supers-planning-documentation-effects",
    "supers-planning-validate-promotion-bundle",
    "supers-planning-apply-approved-plan",
    "supers-planning-audit",
    "supers-planning-terminal-observability",
  ];
  const serialized = JSON.stringify(compiled.factoryArguments);
  for (const workflowName of workflowNames) {
    assert.match(serialized, new RegExp(workflowName));
  }
  for (
    const terminalStage of [
      "done",
      "rejected",
      "parked",
      "failed-apply",
      "failed-audit",
      "aborted",
    ]
  ) {
    assert.match(
      JSON.stringify(stage(compiled, `${terminalStage}-observability`)),
      new RegExp(
        `supers-planning-terminal-observability.*finalize.*${terminalStage}`,
      ),
    );
  }
  assert.match(
    JSON.stringify(transition(compiled, "handoff", "finish")),
    /done-observability/,
  );
  assert.match(
    JSON.stringify(compiled.factoryArguments.globalTransitions),
    /abort.*aborted-observability/,
  );
  const application = stage(compiled, "plan-application").work as {
    workflow: { inputs: Record<string, unknown> };
  };
  assert.deepEqual(Object.keys(application.workflow.inputs).sort(), [
    "applicationBundle",
    "applicationBundleValidation",
    "approvalGateId",
    "documentationEffects",
    "planningInventory",
    "reviewedPlan",
    "trackerInventory",
    "workItem",
  ]);
  assert.doesNotMatch(JSON.stringify(application), /ownerToken|approvedPlan/);
  assert.doesNotMatch(
    JSON.stringify(
      transition(
        compiled,
        "plan-review",
        "apply-without-graduation-approval",
      ),
    ),
    /human-approval/,
  );
  assert.match(
    JSON.stringify(transition(compiled, "plan-review", "approve-and-apply")),
    /human-approval.*planning-approval/,
  );
});

Deno.test("compilation is deterministic and persists one versioned profile", async () => {
  const profile = await fixtureProfile();
  assert.equal(
    JSON.stringify(compileDexPlanningFactoryProfile(profile)),
    JSON.stringify(compileDexPlanningFactoryProfile(profile)),
  );

  const writes: Array<{
    specName: string;
    name: string;
    data: Record<string, unknown>;
  }> = [];
  const logs: string[] = [];
  const serializedGlobalArgs = Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  );
  const context: DexPlanningFactoryMethodContext = {
    globalArgs: serializedGlobalArgs,
    logger: { info: (message) => logs.push(message) },
    writeResource: (specName, name, data) => {
      writes.push({ specName, name, data });
      return Promise.resolve({ name });
    },
  };
  const result = await executeDexPlanningFactoryCompile({}, context);
  assert.deepEqual(result.dataHandles, [{ name: "compiled-profile" }]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.specName, "profile");
  assert.equal(writes[0]?.name, "compiled-profile");
  assert.equal(writes[0]?.data.compilerVersion, "2026.08.27.1");
  assert.equal(logs.length, 2);
});

Deno.test("exact Graffiti attach-existing proposal crosses the compiler-owned application boundary", () => {
  const reviewedPlan = {
    schemaVersion: 1 as const,
    planId: "graffiti-adr-lifecycle-existing-v1",
    createTasks: [],
    attachExistingTasks: [{
      clientRef: "adr-lifecycle",
      selectorKind: "id" as const,
      selectorValue: "l2ctf1cf",
      expectedName: "Add ADR lifecycle status and current-state index (F-07)",
      expectedDescription:
        "## What\nAdd status, decision date, implementation/release version, supersession links, and matching-test metadata to every ADR; publish an index separating proposed, accepted, implemented, deferred, and superseded decisions.\n\n## Why\nPresent-tense ADRs currently describe behavior that source and tests do not implement, making plans indistinguishable from contracts.\n\n## How\nDefine a minimal metadata schema, classify all ADRs from evidence, link implementation tasks/tests, and update contributing guidance. Do not silently mark aspirational work implemented.\n\n## Done when\nA contributor can determine current behavior without comparing every ADR to source; ADR-0009/0010/0013 and docs IA contradictions are explicitly classified.\n\n## Verify\nAdd a docs check that validates required metadata, status vocabulary, and supersession references.",
      expectedPriority: 2,
      parentKind: "preserve" as const,
      parentClientRef: "",
      addBlockedBy: [],
    }],
  };
  const emittedPlan = normalizeDexReviewedPlanForApplication(reviewedPlan);
  assert.deepEqual(DexApprovedPlanSchema.parse(emittedPlan), {
    schemaVersion: 1,
    planId: "graffiti-adr-lifecycle-existing-v1",
    tasks: [{
      kind: "attachExisting",
      clientRef: "adr-lifecycle",
      selector: { kind: "id", taskId: "l2ctf1cf" },
      expected: {
        name: "Add ADR lifecycle status and current-state index (F-07)",
        description:
          "## What\nAdd status, decision date, implementation/release version, supersession links, and matching-test metadata to every ADR; publish an index separating proposed, accepted, implemented, deferred, and superseded decisions.\n\n## Why\nPresent-tense ADRs currently describe behavior that source and tests do not implement, making plans indistinguishable from contracts.\n\n## How\nDefine a minimal metadata schema, classify all ADRs from evidence, link implementation tasks/tests, and update contributing guidance. Do not silently mark aspirational work implemented.\n\n## Done when\nA contributor can determine current behavior without comparing every ADR to source; ADR-0009/0010/0013 and docs IA contradictions are explicitly classified.\n\n## Verify\nAdd a docs check that validates required metadata, status vocabulary, and supersession references.",
        priority: 2,
      },
      parent: { kind: "preserve" },
      addBlockedBy: [],
    }],
  });
  const compiled = compileDexPlanningFactoryProfile(
    DexPlanningFactoryProfileSchema.parse({
      ...(JSON.parse(
        Deno.readTextFileSync(new URL("profile.json", fixtureRoot)),
      )),
    }),
  );
  const application = stage(compiled, "plan-application").work as {
    workflow: { inputs: Record<string, unknown> };
  };
  assert.equal(application.workflow.inputs.reviewedPlan !== undefined, true);
  assert.equal(application.workflow.inputs.plan !== undefined, true);
});

Deno.test("documentation policy can route a rejected intent back for revision", () => {
  const compiled = compileDexPlanningFactoryProfile(
    DexPlanningFactoryProfileSchema.parse(
      JSON.parse(Deno.readTextFileSync(new URL("profile.json", fixtureRoot))),
    ),
  );
  const revision = transition(
    compiled,
    "documentation-effects",
    "revise-intent",
  );
  assert.equal(revision.to, "clarified-intent");
  assert.deepEqual(revision.gates, [{
    type: "artifact-exists",
    config: { artifact: "clarified-intent" },
  }]);
});

Deno.test("review revision can request a fresh immutable inventory", () => {
  const compiled = compileDexPlanningFactoryProfile(
    DexPlanningFactoryProfileSchema.parse(
      JSON.parse(Deno.readTextFileSync(new URL("profile.json", fixtureRoot))),
    ),
  );
  const reinventory = transition(compiled, "plan-review", "reinventory");
  assert.equal(reinventory.to, "inventory");
  assert.equal(
    (reinventory.gates as Array<Record<string, unknown>>).length,
    3,
  );
});
