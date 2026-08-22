import assert from "node:assert/strict";
import { parse } from "jsr:@std/yaml@1.0.10";

const WORKFLOW_PATH = "workflows/workflow-supers-sentry-factory-driver.yaml";

type WorkflowStep = {
  name: string;
  guard?: string;
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

Deno.test("Sentry Factory driver stops after exact isolated integration and classification", async () => {
  const source = await Deno.readTextFile(WORKFLOW_PATH);
  const workflow = parse(source) as WorkflowDefinition;
  const steps = workflow.jobs.flatMap((job) => job.steps);
  const names = steps.map((step) => step.name);

  assert.equal(workflow.version, 2);
  assert.deepEqual(workflow.inputs.required, [
    "workItem",
    "evidenceName",
    "expectedEvidenceFingerprint",
    "mappingName",
    "expectedMappingFingerprint",
    "admissionName",
    "expectedAdmissionFingerprint",
  ]);
  assert.deepEqual(names, [
    "assert-exact-sentry-admission",
    "materialize-initial-factory-status",
    "record-preflight-dispatch",
    "run-policy-preflight",
    "refresh-preflight-status",
    "advance-to-implementation",
    "materialize-implementation-status",
    "assert-implementation-stage",
    "record-implementation-dispatch",
    "assert-trusted-baseline",
    "prepare-isolated-coding-worktree",
    "invoke-sandboxed-coding-agent",
    "verify-committed-worktree",
    "assert-single-commit-receipt",
    "assert-central-git-clean-before-integration",
    "materialize-pre-integration-head",
    "assert-exact-integration-baseline",
    "cherry-pick-verified-commit",
    "materialize-post-integration-git",
    "materialize-post-integration-head",
    "verify-serialized-integration",
    "assert-single-integration-receipt",
    "replay-integrated-sentry-repair",
    "cleanup-committed-worktree",
    "refresh-implementation-status",
    "record-deterministic-change-summary",
    "refresh-classification-gate",
    "advance-to-classification",
  ]);

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
  assert.equal(
    stepByName(workflow, "run-policy-preflight").task.workflowIdOrName,
    "factory-policy-sweep",
  );
  assert.equal(
    stepByName(workflow, "advance-to-implementation").task.inputs?.transition,
    "implement",
  );
  assert.equal(
    stepByName(workflow, "replay-integrated-sentry-repair").task.modelIdOrName,
    "supers-sentry-integrated-replay",
  );
  assert.ok(
    names.indexOf("verify-serialized-integration") <
      names.indexOf("replay-integrated-sentry-repair") &&
      names.indexOf("replay-integrated-sentry-repair") <
        names.indexOf("cleanup-committed-worktree"),
  );

  const prepare = stepByName(workflow, "prepare-isolated-coding-worktree");
  const invocationIdentity = String(prepare.task.inputs?.invocationId);
  assert.match(invocationIdentity, /workItem/);
  assert.match(invocationIdentity, /stage\.cycle/);
  assert.match(invocationIdentity, /repairIdentityFingerprint/);
  assert.doesNotMatch(invocationIdentity, /run\.id/);
  assert.equal(prepare.task.inputs?.purpose, "delivery-coding");

  const invoke = stepByName(workflow, "invoke-sandboxed-coding-agent");
  assert.equal(invoke.task.methodName, "invokeAndParse");
  assert.equal(invoke.task.inputs?.provider, "pi");
  assert.equal(invoke.task.inputs?.model, "openai-codex/gpt-5.6-sol");
  assert.equal(invoke.task.inputs?.toolProfile, "actor");
  assert.equal(invoke.task.inputs?.sandboxRequired, true);
  assert.equal(invoke.task.inputs?.sandboxNetwork, "deny");
  assert.match(String(invoke.task.inputs?.prompt), /untrusted advisory text/);
  assert.match(
    String(invoke.task.inputs?.prompt),
    /self-contained regression test/,
  );
  assert.match(String(invoke.task.inputs?.prompt), /Sentry/);
  assert.match(
    String(invoke.task.inputs?.prompt),
    /prose, commands, and exit-code claims are not proof/,
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

  const methodNames = steps.map((step) => step.task.methodName).filter(Boolean);
  assert.ok(!methodNames.includes("approve"));
  assert.ok(!methodNames.includes("reject"));
  for (
    const forbidden of ["issue resolve", "reproduction-agent", "map-reproduced"]
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
