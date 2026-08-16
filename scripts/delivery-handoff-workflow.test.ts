import assert from 'node:assert/strict';
import { parse } from 'jsr:@std/yaml@1.0.10';

const WORKFLOW_PATH = 'workflows/workflow-5837b051-a547-4624-a26c-3dffc2e6b1f8.yaml';
const DETERMINISTIC_VERIFICATION_WORKFLOW_PATH =
	'workflows/workflow-41b30cb4-5142-4f41-9fd3-b0a2a718c4a7.yaml';
const FLEET_DRIVER_PATH = '.claude/skills/supers-factory-fleet/references/driver-loop.md';
const CLAIM_STATUSES = ['claimed', 'resumed', 'no-ready-work', 'human-gate'] as const;

type WorkflowStep = {
	name: string;
	guard?: string;
};

type WorkflowDefinition = {
	version: number;
	jobs: Array<{ steps: WorkflowStep[] }>;
};

function stepByName(workflow: WorkflowDefinition, name: string): WorkflowStep {
	const step = workflow.jobs.flatMap((job) => job.steps).find((entry) => entry.name === name);
	assert.ok(step, `Missing workflow step ${name}`);
	return step;
}

function guardSkips(step: WorkflowStep, status: (typeof CLAIM_STATUSES)[number]): boolean {
	assert.ok(step.guard, `Missing guard for ${step.name}`);
	const comparisons = [...step.guard.matchAll(/attributes\.status\s*(==|!=)\s*"([^"]+)"/g)];
	assert.ok(comparisons.length > 0, `No status comparisons in ${step.name}`);
	const outcomes = comparisons.map((comparison) =>
		comparison[1] === '==' ? status === comparison[2] : status !== comparison[2]
	);
	const connectors = [
		...step.guard.matchAll(/attributes\.status\s*(?:==|!=)\s*"[^"]+"\s*(\|\||&&)/g)
	].map((match) => match[1]);
	assert.equal(connectors.length, Math.max(0, outcomes.length - 1));
	assert.equal(new Set(connectors).size <= 1, true, `${step.name} mixes guard operators`);
	return connectors[0] === '&&'
		? outcomes.every(Boolean)
		: connectors[0] === '||'
			? outcomes.some(Boolean)
			: outcomes[0];
}

Deno.test('fleet driver workflowScript is valid ordinary JavaScript', async () => {
	const markdown = await Deno.readTextFile(FLEET_DRIVER_PATH);
	const script = /```javascript\n([\s\S]*?)\n```/.exec(markdown)?.[1];
	assert.ok(script, 'Missing JavaScript workflowScript example');
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
		...args: string[]
	) => (...args: unknown[]) => Promise<unknown>;
	assert.doesNotThrow(() => new AsyncFunction('runs', 'allocated', script));
	assert.doesNotMatch(script, /\bas const\b/);
});

Deno.test(
	'deterministic verification scopes Factory artifacts to the active work item',
	async () => {
		const workflowSource = await Deno.readTextFile(DETERMINISTIC_VERIFICATION_WORKFLOW_PATH);
		const workflow = parse(workflowSource) as WorkflowDefinition;
		assert.equal(workflow.version, 2);
		assert.doesNotMatch(
			workflowSource,
			/data\.latest\("supers-delivery", "artifact-(?:change-impact|change-summary)"\)/
		);
		assert.match(
			workflowSource,
			/data\.latest\("supers-delivery", "artifact-" \+ inputs\.workItem \+ "-change-impact"\)/
		);
		assert.match(
			workflowSource,
			/data\.latest\("supers-delivery", "artifact-" \+ inputs\.workItem \+ "-change-summary"\)/
		);
	}
);

Deno.test('delivery handoff status guards choose exactly one normalization path', async () => {
	const workflow = parse(await Deno.readTextFile(WORKFLOW_PATH)) as WorkflowDefinition;
	const start = stepByName(workflow, 'start-delivery-factory');
	const owned = stepByName(workflow, 'normalize-claimed-delivery-handoff');
	const terminal = stepByName(workflow, 'normalize-terminal-delivery-handoff');

	assert.match(start.guard ?? '', /status != "claimed"/);
	assert.match(owned.guard ?? '', /status != "claimed".*status != "resumed"/);
	assert.match(terminal.guard ?? '', /status == "claimed".*status == "resumed"/);

	for (const status of CLAIM_STATUSES) {
		// Swamp guards skip a step when their expression evaluates true.
		const startRuns = !guardSkips(start, status);
		const ownedRuns = !guardSkips(owned, status);
		const terminalRuns = !guardSkips(terminal, status);
		assert.equal(startRuns, status === 'claimed', `${status}: Factory start`);
		assert.equal(
			Number(ownedRuns) + Number(terminalRuns),
			1,
			`${status}: exactly one normalization path`
		);
	}
});
