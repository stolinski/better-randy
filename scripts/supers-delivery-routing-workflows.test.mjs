import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('universal policy sweep binds lifecycle identity and excludes domain audits', async () => {
	const policy = await read('workflows/workflow-5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a.yaml');
	assert.match(policy, /methodName: record-policy-sweep-execution/);
	assert.match(policy, /schemaVersion: 2/);
	assert.match(policy, /policyWorkflowVersion: 4/);
	assert.doesNotMatch(
		policy,
		/audit-timing|audit-tracking|audit-parity|audit-planning|repo-audit|verify-presets/
	);
});

test('typed verification lanes own the four domain audits after trusted-path routing', async () => {
	const classifier = await read('scripts/change-impact-classifier.ts');
	const fanout = await read('extensions/models/repo-verification-fanout.ts');
	for (const [lane, command] of [
		['timing-coverage', 'audit:timing'],
		['authoring-dependency-tracking', 'audit:tracking'],
		['inspector-editor-parity', 'audit:parity'],
		['planning-discoverability', 'audit:planning']
	]) {
		assert.match(classifier, new RegExp(`'${lane}'`));
		assert.match(fanout, new RegExp(`case '${lane}'[\\s\\S]*?'${command}'`));
	}
});

test('preflight derives typed implementation guidance from the canonical task snapshot', async () => {
	const preflight = await read('workflows/workflow-6a08b058-cb9e-4580-a5ac-9b697ce32160.yaml');
	assert.match(preflight, /modelIdOrName: supers-dex-task-tracker[\s\S]*methodName: get/);
	assert.match(preflight, /methodName: classify-work-domain-intent/);
	assert.match(preflight, /sourceWorkflowRunId: '\$\{\{ run\.id \}\}'/);
	assert.match(preflight, /attributes\.id == inputs\.workItem/);
	assert.ok(
		preflight.indexOf('name: classify-work-domain-intent') <
			preflight.indexOf('name: capture-change-baseline')
	);
});

test('post-integration routing takes paths only from the verified integration receipt', async () => {
	const classify = await read('workflows/workflow-05aa64da-60fe-42fc-b9fd-edb33de11d92.yaml');
	const verification = await read('workflows/workflow-41b30cb4-5142-4f41-9fd3-b0a2a718c4a7.yaml');
	assert.match(classify, /version: 5/);
	assert.match(verification, /version: 7/);
	assert.match(
		classify,
		/expectedChangedPaths: '[^\n]*artifact-[^\n]*inputs\.workItem[^\n]*change-summary[^\n]*integrationReceipt\.changedPaths/
	);
	assert.match(
		classify,
		/classification:[\s\S]*domains:[\s\S]*unknownPaths:[\s\S]*intentRouteDigest:/
	);
	assert.match(verification, /methodName: run-verification-fanout/);
	const fanoutBlock = verification.match(
		/methodName: run-verification-fanout[\s\S]*?(?=\n      - name: verify-affected-render-matrix)/
	)?.[0];
	assert.ok(fanoutBlock);
	assert.doesNotMatch(fanoutBlock, /\n\s+lanes:|changedPaths:/);
	assert.match(
		verification,
		/attributes\.lanes\.filter\(lane, lane\.id in \["render-matrix", "pack-matrix"\]\)/
	);
	assert.doesNotMatch(verification, /\["render-matrix", "pack-matrix", "export-decode"\]/);
});

test('human decision workflow is versioned with the lifecycle-integrity artifact schema', async () => {
	const workflow = await read(
		'workflows/workflow-cde1605a-a7a1-4c5e-b5f9-e03e0cddf553.yaml'
	);
	assert.match(workflow, /version: 3/);
	assert.match(workflow, /methodName: bind-human-aesthetic-decision/);
});

test('compiled implementation uses the typed domain router skill and constraints', async () => {
	const profile = await read(
		'models/@club_aqua_back_deck/dex-software-factory/a480da64-8208-4252-8eec-2ee454cd3a6d.yaml'
	);
	assert.match(profile, /skills:\n\s+- supers-domain-aware-implementation/);
	assert.match(
		profile,
		/constraints: \.claude\/skills\/supers-domain-aware-implementation\/SKILL\.md/
	);
	assert.match(profile, /never infer routing from agent prose/);
});
