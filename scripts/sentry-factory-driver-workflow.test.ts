import assert from "node:assert/strict";
import { parse } from "jsr:@std/yaml@1.0.10";

const WORKFLOW_PATH = "workflows/workflow-supers-sentry-factory-driver.yaml";
const FACTORY_PATH =
  "models/@swamp/software-factory/90fac686-c724-4aee-97c4-e31b9af4c5e2.yaml";
const AUTHORIZED_COMPLETION_PATH =
  "workflows/workflow-supers-complete-authorized-task.yaml";

type WorkflowStep = {
  name: string;
  guard?: string;
  dependsOn?: Array<{ condition: unknown }>;
  task: {
    type: string;
    modelIdOrName?: string;
    workflowIdOrName?: string;
    methodName?: string;
    inputs?: Record<string, unknown>;
  };
};

type WorkflowDefinition = {
  version: number;
  inputs: { required: string[] };
  jobs: Array<{ steps: WorkflowStep[] }>;
};

function stepByName(workflow: WorkflowDefinition, name: string): WorkflowStep {
  const step = workflow.jobs.flatMap((job) => job.steps).find((entry) =>
    entry.name === name
  );
  assert.ok(step, `Missing workflow step ${name}`);
  return step;
}

Deno.test("machine completion is additive and preserves the ordinary human gate", async () => {
  const [factory, completion] = await Promise.all([
    Deno.readTextFile(FACTORY_PATH),
    Deno.readTextFile(AUTHORIZED_COMPLETION_PATH),
  ]);
  assert.match(
    factory,
    /name: cleanup[\s\S]*?type: human-approval[\s\S]*?id: completion-approval/,
  );
  assert.match(
    factory,
    /name: machine-cleanup[\s\S]*?sentry-machine-authorization/,
  );
  assert.match(
    factory,
    /size\(artifacts\.verification\.requiredHumanReviewKinds\) == 0/,
  );
  assert.match(
    completion,
    /workflowIdOrName: supers-complete-human-approved-task/,
  );
  assert.match(completion, /methodName: complete-machine-sentry/);
});

Deno.test("Sentry Factory driver converges machine-authorized repairs through terminal Delivery", async () => {
  const source = await Deno.readTextFile(WORKFLOW_PATH);
  const workflow = parse(source) as WorkflowDefinition;
  const steps = workflow.jobs.flatMap((job) => job.steps);
  const names = steps.map((step) => step.name);

  assert.equal(workflow.version, 4);
  assert.deepEqual(workflow.inputs.required, [
    "workItem",
    "evidenceName",
    "expectedEvidenceFingerprint",
    "mappingName",
    "expectedMappingFingerprint",
    "admissionName",
    "expectedAdmissionFingerprint",
  ]);
  const requiredOrder = [
    "assert-exact-sentry-admission",
    "run-policy-preflight",
    "reconcile-prior-coding-worktrees",
    "prepare-isolated-coding-worktree",
    "invoke-sandboxed-coding-agent",
    "verify-serialized-integration",
    "record-deterministic-change-summary",
    "run-exact-change-classification",
    "run-deterministic-verification",
    "record-machine-reconciliation",
    "run-postflight-policy",
    "record-sentry-machine-authorization",
    "run-authorized-task-completion",
    "run-done-terminal-observability",
    "finalize-machine-sentry-delivery",
  ];
  let priorIndex = -1;
  for (const name of requiredOrder) {
    const index = names.indexOf(name);
    assert.ok(
      index > priorIndex,
      `${name} must follow the prior terminal-chain step`,
    );
    priorIndex = index;
  }

  const admission = stepByName(workflow, "assert-exact-sentry-admission");
  const admissionExpression = String(admission.task.inputs ?? source);
  for (
    const identity of [
      "expectedEvidenceFingerprint",
      "expectedMappingFingerprint",
      "expectedAdmissionFingerprint",
      "repairIdentityFingerprint",
      "preservesHumanAestheticGate",
    ]
  ) {
    assert.match(source, new RegExp(identity));
  }
  assert.ok(admissionExpression.length > 0);

  assert.equal(
    stepByName(workflow, "record-preflight-dispatch").task.methodName,
    "record_dispatch",
  );
  for (
    const step of steps.filter((entry) => (entry.dependsOn?.length ?? 0) > 0)
  ) {
    assert.match(
      JSON.stringify(step.dependsOn),
      /"succeeded".*"skipped"/,
      `${step.name} must resume after intentionally skipped prior stages`,
    );
  }
  assert.match(
    stepByName(workflow, "record-implementation-dispatch").guard ?? "",
    /stage\.id != "implementation"/,
  );
  assert.equal(
    stepByName(workflow, "run-policy-preflight").task.workflowIdOrName,
    "factory-policy-sweep",
  );
  assert.equal(
    stepByName(workflow, "advance-to-implementation").task.inputs?.transition,
    "implement",
  );
  assert.doesNotMatch(
    source,
    /replay-integrated-sentry-repair|supers-sentry-integrated-replay/,
  );
  assert.ok(
    names.indexOf("verify-serialized-integration") <
      names.indexOf("cleanup-committed-worktree"),
  );

  const reconciliation = stepByName(
    workflow,
    "reconcile-prior-coding-worktrees",
  );
  assert.equal(reconciliation.task.methodName, "reconcileSupersAgentWorktrees");
  assert.match(
    String(reconciliation.task.inputs?.claimIds),
    /attributes\.workItem == inputs\.workItem/,
  );
  assert.match(
    String(reconciliation.task.inputs?.claimIds),
    /supers-agent-worktree-removal/,
  );

  const prepare = stepByName(workflow, "prepare-isolated-coding-worktree");
  const invocationIdentity = String(prepare.task.inputs?.invocationId);
  assert.match(invocationIdentity, /workItem/);
  assert.match(invocationIdentity, /stage\.cycle/);
  assert.match(invocationIdentity, /repairIdentityFingerprint/);
  assert.match(invocationIdentity, /change-baseline-current-/);
  assert.doesNotMatch(invocationIdentity, /run\.id/);
  assert.equal(prepare.task.inputs?.purpose, "delivery-coding");

  const invoke = stepByName(workflow, "invoke-sandboxed-coding-agent");
  assert.equal(invoke.task.methodName, "invokeAndParse");
  assert.equal(invoke.task.inputs?.provider, "pi");
  assert.equal(invoke.task.inputs?.model, "openai-codex/gpt-5.6-sol");
  assert.equal(invoke.task.inputs?.toolProfile, "actor");
  assert.equal(invoke.task.inputs?.sandboxRequired, false);
  assert.equal(invoke.task.inputs?.sandboxNetwork, "allow");
  assert.match(String(invoke.task.inputs?.prompt), /untrusted advisory text/);
  assert.match(String(invoke.task.inputs?.prompt), /Sentry/);
  assert.match(
    String(invoke.task.inputs?.prompt),
    /reproduction is not required/,
  );
  assert.match(
    String(invoke.task.inputs?.prompt),
    /only bounded checks relevant to the changed paths/,
  );
  assert.doesNotMatch(
    String(invoke.task.inputs?.prompt),
    /Run pnpm check and pnpm test/,
  );
  assert.equal(invoke.task.inputs?.idleTimeoutMs, 300_000);
  assert.equal(invoke.task.inputs?.wallTimeoutMs, 1_800_000);
  assert.doesNotMatch(
    String(invoke.task.inputs?.prompt),
    /objectiveProofNomination|pre-existing byte-unchanged/,
  );

  assert.equal(
    stepByName(workflow, "verify-committed-worktree").task.methodName,
    "verifySupersAgentWorktreeCommit",
  );
  assert.equal(
    stepByName(workflow, "cherry-pick-verified-commit").task.modelIdOrName,
    "supers-integration-git",
  );
  assert.equal(
    stepByName(workflow, "cherry-pick-verified-commit").task.methodName,
    "cherry_pick",
  );
  const beforeIntegration = stepByName(
    workflow,
    "inspect-integration-paths-before",
  );
  const afterIntegration = stepByName(
    workflow,
    "materialize-post-integration-git",
  );
  assert.equal(beforeIntegration.task.modelIdOrName, "supers-integration-git");
  assert.equal(beforeIntegration.task.methodName, "status");
  assert.match(String(beforeIntegration.task.inputs?.paths), /changedPaths/);
  assert.equal(afterIntegration.task.methodName, "status");
  assert.equal(
    afterIntegration.task.inputs?.paths,
    beforeIntegration.task.inputs?.paths,
  );
  assert.equal(
    stepByName(workflow, "assert-integrated-paths-clean").task.type,
    "assert",
  );
  assert.doesNotMatch(
    source,
    /Central Git is not clean|assert-central-git-clean/,
  );
  assert.equal(
    stepByName(workflow, "verify-serialized-integration").task.methodName,
    "verifySupersAgentIntegration",
  );
  assert.equal(
    stepByName(workflow, "cleanup-committed-worktree").task.methodName,
    "removeSupersAgentWorktree",
  );
  assert.equal(
    (stepByName(workflow, "cleanup-committed-worktree").task.inputs
      ?.authorization as Record<string, unknown>).kind,
    "committed",
  );

  const mutationSteps = [
    "record-preflight-dispatch",
    "run-policy-preflight",
    "advance-to-implementation",
    "record-implementation-dispatch",
    "cherry-pick-verified-commit",
    "record-deterministic-change-summary",
    "advance-to-classification",
  ];
  for (const name of mutationSteps) {
    assert.ok(
      stepByName(workflow, name).guard,
      `${name} must have a replay guard`,
    );
  }
  assert.match(
    stepByName(workflow, "cherry-pick-verified-commit").guard ?? "",
    /supers-agent-integration/,
  );

  const summary = stepByName(workflow, "record-deterministic-change-summary");
  assert.equal(summary.task.methodName, "record_artifact");
  assert.equal(summary.task.inputs?.name, "change-summary");
  assert.match(
    JSON.stringify(summary.task.inputs?.payload),
    /integrationReceipt/,
  );
  assert.equal(
    stepByName(workflow, "advance-to-classification").task.inputs?.transition,
    "classify",
  );
  assert.match(
    String(
      stepByName(workflow, "run-postflight-policy").task.inputs?.expectedPaths,
    ),
    /change-impact.*paths/,
  );

  const methodNames = steps.map((step) => step.task.methodName).filter(Boolean);
  assert.ok(!methodNames.includes("approve"));
  assert.ok(!methodNames.includes("reject"));
  for (
    const forbidden of [
      "issue resolve",
      "reproduction-agent",
      "map-reproduced",
      "replay-integrated-sentry-repair",
    ]
  ) {
    assert.doesNotMatch(source, new RegExp(forbidden, "i"));
  }
  assert.ok(
    names.indexOf("verify-serialized-integration") <
      names.indexOf("cleanup-committed-worktree"),
  );
  assert.ok(
    names.indexOf("cleanup-committed-worktree") <
      names.indexOf("record-deterministic-change-summary"),
  );
});
