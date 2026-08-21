import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await readFile(
	resolve(repoRoot, 'workflows/workflow-9ffe43b7-f030-4de7-8ebd-af9c08fcbc79.yaml'),
	'utf8'
);
const transportWorkflow = await readFile(
	resolve(repoRoot, 'workflows/workflow-supers-sentry-reproduction-transport-reservation.yaml'),
	'utf8'
);

function stepIndex(name: string): number {
	const index = workflow.indexOf(`- name: ${name}`);
	assert.notEqual(index, -1, `missing workflow step ${name}`);
	return index;
}

test('Sentry reproduction reservation binds exact selected evidence without executable input', () => {
	assert.match(workflow, /modelIdOrName: supers-sentry-reproduction-controller/);
	assert.match(workflow, /queueSelectionName: '\$\{\{ inputs\.queueSelectionName \}\}'/);
	assert.match(
		workflow,
		/expectedQueueSelectionFingerprint: '\$\{\{ inputs\.expectedQueueSelectionFingerprint \}\}'/
	);
	assert.doesNotMatch(workflow, /command\/shell|task:\s*\$\{\{|sentry.*title/i);
});

test('pending and quarantine are terminal reservation states but never reproduced', () => {
	assert.ok(
		stepIndex('prepare-selected-reproduction') < stepIndex('assert-closed-terminal-reservation')
	);
	assert.ok(
		stepIndex('assert-closed-terminal-reservation') < stepIndex('assert-no-untrusted-advance')
	);
	assert.match(workflow, /\["inconclusive", "quarantined"\]/);
	assert.match(workflow, /status != \\"reproduced\\"|status != "reproduced"/);
	assert.ok(
		stepIndex('assert-no-untrusted-advance') < stepIndex('reserve-trusted-reproduction-transport')
	);
});

test('trusted transport reservation is fenced and cannot launch or mutate Dex', () => {
	assert.match(transportWorkflow, /methodName: acquire-lease/);
	assert.match(transportWorkflow, /methodName: reserve/);
	assert.match(transportWorkflow, /expectedRequestFingerprint/);
	assert.doesNotMatch(transportWorkflow, /request:\s*'\$\{\{ data\.latest/);
	assert.match(transportWorkflow, /clean matching checkout/);
	assert.doesNotMatch(
		transportWorkflow,
		/methodName: (map-reproduced|start)|workflowIdOrName: supers-delivery|command\/shell/
	);
});
