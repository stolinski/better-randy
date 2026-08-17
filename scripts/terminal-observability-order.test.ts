import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const workflowPath = new URL('../workflows/workflow-1d982225-a620-4f8a-9c9d-49e2236ad07d.yaml', import.meta.url);
const recoveryWorkflowPath = new URL(
	'../workflows/workflow-5dfa5e46-8098-4cf3-8dae-75162e8a967a.yaml',
	import.meta.url
);
const factoryPackageReadmePath = new URL(
	'../extensions/packages/dex-software-factory/README.md',
	import.meta.url
);
const factoryPackageChangelogPath = new URL(
	'../extensions/packages/dex-software-factory/CHANGELOG.md',
	import.meta.url
);
const metricsPackageReadmePath = new URL(
	'../extensions/packages/software-factory-sentry-metrics/README.md',
	import.meta.url
);

describe('terminal observability ordering', () => {
	it('keeps Factory terminal advancement outside and after the observer workflow', async () => {
		const source = await readFile(workflowPath, 'utf8');
		const summary = source.indexOf('- name: persist-terminal-summary');
		const emit = source.indexOf('- name: emit-terminal-flow-metrics');
		const verify = source.indexOf('- name: verify-observability-coverage');
		assert.ok(summary >= 0 && summary < emit && emit < verify);
		assert.doesNotMatch(source, /methodName:\s*advance/);
		assert.match(source.slice(emit, verify), /step: persist-terminal-summary/);
		assert.match(source.slice(verify), /step: emit-terminal-flow-metrics/);
		assert.match(source, /projectedTerminal:[\s\S]*preterminalStage:[\s\S]*targetStage:[\s\S]*outcome:/);
		assert.match(source, /enum: \[done, aborted, parked\]/);
		assert.match(source, /complete local receipt before finalization without gating on Sentry availability or emission success/);
		assert.match(source.slice(summary, emit), /methodName:\s*persist_projected_summary/);
		assert.doesNotMatch(source, /methodName:\s*summary/);
		assert.match(source.slice(summary, emit), /allowFailure:\s*false/);
		assert.match(source.slice(emit, verify), /allowFailure:\s*true/);
	});

	it('documents observer projection and generated-stage finalization ownership', async () => {
		const [factoryReadme, factoryChangelog, metricsReadme] = await Promise.all([
			readFile(factoryPackageReadmePath, 'utf8'),
			readFile(factoryPackageChangelogPath, 'utf8'),
			readFile(metricsPackageReadmePath, 'utf8')
		]);
		for (const source of [factoryReadme, metricsReadme]) {
			assert.match(source, /done, aborted, and operational-escalation outcomes/);
			assert.match(source, /exact projected (?:outcome|summary)/);
			assert.match(source, /never advance(?:s)? the Factory/);
			assert.match(
				source,
				/generated preterminal stage owns the `workflow-succeeded`-gated `finalize` transition/
			);
			assert.doesNotMatch(source, /workflow (?:owns|should first advance).*terminal state/i);
		}
		assert.match(factoryChangelog, /projected done, aborted, and operational-escalation outcomes/);
		assert.match(factoryChangelog, /without advancing the Factory/);
	});

	it('keeps legacy projected receipt recovery exact and non-gating', async () => {
		const source = await readFile(recoveryWorkflowPath, 'utf8');
		assert.match(source, /required: \[workItem, preterminalStage, targetStage, outcome\]/);
		assert.match(source, /oneOf:/);
		for (const route of [
			'done-observability \\}\n        targetStage: \\{ const: done \\}\n        outcome: \\{ const: done',
			'aborted-observability \\}\n        targetStage: \\{ const: aborted \\}\n        outcome: \\{ const: aborted',
			'escalated-observability \\}\n        targetStage: \\{ const: operational-escalation \\}\n        outcome: \\{ const: parked'
		]) {
			assert.match(source, new RegExp(route));
		}
		assert.match(source, /projectedTerminal:[\s\S]*inputs\.preterminalStage[\s\S]*inputs\.targetStage[\s\S]*inputs\.outcome/);
		assert.equal(source.match(/allowFailure: true/g)?.length, 2);
		assert.match(source, /methodName:\s*persist_projected_summary/);
		assert.doesNotMatch(source, /methodName:\s*summary/);
		assert.match(source, /step: summarize-factory-run\n\s+condition:\n\s+type: completed/);
		assert.doesNotMatch(source, /type: succeeded|methodName:\s*advance|verify_flow_receipt|guard:/);
	});
});
