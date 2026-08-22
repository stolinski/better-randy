import assert from "node:assert/strict";
import { parse } from "jsr:@std/yaml@1.0.10";

const INTAKE_WORKFLOW_PATH =
  "workflows/workflow-20f80b57-6b39-4541-9470-cd414e5286db.yaml";
const PLANNING_WORKFLOW_PATH =
  "workflows/workflow-supers-sentry-repair-to-planning.yaml";
const EVIDENCE_DELIVERY_WORKFLOW_PATH =
  "workflows/workflow-supers-sentry-evidence-to-delivery.yaml";
const PLANNING_PROFILE_PATH =
  "fixtures/dex-planning-factory-consumer/supers-profile.json";
const MATERIALIZED_PLANNING_PATH =
  "models/@swamp/software-factory/d5f581ad-2c79-41c4-829f-ced1ae9331cc.yaml";

type WorkflowStep = {
  name: string;
  guard?: string;
  task: {
    type: string;
    modelIdOrName?: string;
    methodName?: string;
    inputs?: Record<string, unknown>;
  };
};

type WorkflowDefinition = {
  version: number;
  jobs: Array<{ steps: WorkflowStep[] }>;
};

function stepByName(workflow: WorkflowDefinition, name: string): WorkflowStep {
  const step = workflow.jobs.flatMap((job) => job.steps).find((entry) =>
    entry.name === name
  );
  assert.ok(step, `Missing workflow step ${name}`);
  return step;
}

Deno.test(
  "scheduled Sentry intake admits at most one evidence-bound repair when Delivery has capacity",
  async () => {
    const source = await Deno.readTextFile(INTAKE_WORKFLOW_PATH);
    const workflow = parse(source) as WorkflowDefinition;
    assert.equal(workflow.version, 3);
    assert.deepEqual(
      workflow.jobs.flatMap((job) => job.steps).map((step) => step.name),
      [
        "collect-sentry-issues",
        "triage-against-dex",
        "persist-actionable-sentry-queue",
        "assert-correlated-triage",
        "assert-correlated-queue",
        "refresh-delivery-capacity",
        "select-one-sentry-repair",
        "admit-selected-sentry-repair",
      ],
    );
    const persist = stepByName(workflow, "persist-actionable-sentry-queue");
    assert.equal(persist.task.methodName, "prepare");
    assert.deepEqual(persist.task.inputs?.issuePlans, []);
    const admit = stepByName(workflow, "admit-selected-sentry-repair");
    assert.equal(admit.task.type, "workflow");
    assert.match(admit.guard ?? "", /status != "selected"/);
    assert.match(admit.guard ?? "", /factoryRun\.status == "active"/);
    assert.doesNotMatch(
      source,
      /supers-sentry-reproduction-transport-reservation/,
    );
  },
);

Deno.test("Sentry evidence precedes Dex mutation and Delivery start", async () => {
  const source = await Deno.readTextFile(EVIDENCE_DELIVERY_WORKFLOW_PATH);
  const workflow = parse(source) as WorkflowDefinition;
  const names = workflow.jobs.flatMap((job) => job.steps).map((step) =>
    step.name
  );
  assert.deepEqual(names, [
    "collect-exact-sentry-evidence",
    "map-and-start-dex-repair",
    "assert-machine-delivery-admission",
    "start-delivery-factory",
    "materialize-delivery-status",
  ]);
  assert.ok(
    names.indexOf("collect-exact-sentry-evidence") <
      names.indexOf("map-and-start-dex-repair"),
  );
  assert.match(source, /preservesHumanAestheticGate/);
  assert.match(source, /specName == "delivery-claim"/);
  assert.match(source, /workflowRunId ==/);
  assert.doesNotMatch(source, /invokeAndParse|reproduction-agent|Pi transport/);
});

Deno.test("Planning inventory binds only the selected supersession head", async () => {
  const [profileSource, materializedSource] = await Promise.all([
    Deno.readTextFile(PLANNING_PROFILE_PATH),
    Deno.readTextFile(MATERIALIZED_PLANNING_PATH),
  ]);
  const profile = JSON.parse(profileSource) as {
    adapters: { inventory: { inputs: { values: { repairIntents: string } } } };
  };
  const binding = profile.adapters.inventory.inputs.values.repairIntents;
  for (const source of [binding, materializedSource]) {
    assert.match(source, /selectedIntentFingerprint/);
    assert.match(source, /attributes\.fingerprint/);
    assert.match(source, /sentry-repair-planning-queue-selection/);
  }

  const ancestor = { fingerprint: "a".repeat(64) };
  const successor = {
    fingerprint: "b".repeat(64),
    supersedesIntentFingerprint: ancestor.fingerprint,
  };
  const selectedFingerprint = successor.fingerprint;
  assert.deepEqual(
    [ancestor, successor].filter((intent) =>
      intent.fingerprint === selectedFingerprint
    ),
    [successor],
  );
});

Deno.test("Planning bridge starts only a selected confirmed repair", async () => {
  const source = await Deno.readTextFile(PLANNING_WORKFLOW_PATH);
  const workflow = parse(source) as WorkflowDefinition;
  const prepare = stepByName(workflow, "prepare-repair-intents");
  const start = stepByName(workflow, "start-selected-planning-work");
  assert.match(
    String(prepare.task.inputs?.priorIntents),
    /specName == "repair-intent"/,
  );
  assert.match(start.guard ?? "", /attributes\.action != "start"/);
  assert.match(source, /reproduction-required intents remain queued/);
});
