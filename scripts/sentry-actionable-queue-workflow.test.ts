import assert from "node:assert/strict";
import { parse } from "jsr:@std/yaml@1.0.10";

const INTAKE_WORKFLOW_PATH =
  "workflows/workflow-20f80b57-6b39-4541-9470-cd414e5286db.yaml";
const PLANNING_WORKFLOW_PATH =
  "workflows/workflow-supers-sentry-repair-to-planning.yaml";

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

Deno.test("scheduled Sentry intake persists typed queue evidence without external mutation", async () => {
  const source = await Deno.readTextFile(INTAKE_WORKFLOW_PATH);
  const workflow = parse(source) as WorkflowDefinition;
  assert.equal(workflow.version, 2);
  assert.deepEqual(
    workflow.jobs.flatMap((job) => job.steps).map((step) => step.name),
    [
      "collect-sentry-issues",
      "triage-against-dex",
      "persist-actionable-sentry-queue",
      "assert-correlated-triage",
      "assert-correlated-queue",
    ],
  );
  const persist = stepByName(workflow, "persist-actionable-sentry-queue");
  assert.equal(
    persist.task.modelIdOrName,
    "supers-sentry-repair-planning-handoff",
  );
  assert.equal(persist.task.methodName, "prepare");
  assert.deepEqual(persist.task.inputs?.issuePlans, []);
  assert.match(
    String(persist.task.inputs?.priorIntents),
    /specName == "repair-intent"/,
  );
  assert.doesNotMatch(
    source,
    /methodName: (?:start|complete|apply|record-backlink|resolve-verified)/,
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
