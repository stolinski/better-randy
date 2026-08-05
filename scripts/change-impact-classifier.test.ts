import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyChangeImpact, parseGitWorkingTreeStatus } from './change-impact-classifier.ts';

function laneIds(paths: string[]): string[] {
	return classifyChangeImpact(paths).lanes.map((lane) => lane.id);
}

test('documentation-only changes require only the policy sweep', () => {
	assert.deepEqual(laneIds(['docs/project-control-plane.md']), ['policy-sweep']);
});

test('Svelte UI changes require typed, unit, structural, and browser lanes', () => {
	assert.deepEqual(laneIds(['src/lib/platform/RootInspector.svelte']), [
		'policy-sweep',
		'check',
		'unit',
		'structural',
		'browser'
	]);
});

test('Pack pipeline changes add corpus, visual, and Pack-matrix lanes', () => {
	const result = classifyChangeImpact([
		'src/lib/packs/syntax/manifest.ts',
		'src/lib/pipelines/overlays/lower-third/identity.ts'
	]);
	assert.deepEqual(
		result.lanes.map((lane) => lane.id),
		['policy-sweep', 'check', 'unit', 'structural', 'corpus', 'visual', 'pack-matrix']
	);
	assert.equal(result.visualReviewCandidate, true);
});

test('export controller changes require browser and export-decode verification', () => {
	assert.deepEqual(laneIds(['src/lib/platform/composition-export-controller.ts']), [
		'policy-sweep',
		'check',
		'unit',
		'structural',
		'export-decode'
	]);
});

test('stylesheets require check, structural, corpus, browser, and visual lanes', () => {
	assert.deepEqual(laneIds(['src/app.css']), [
		'policy-sweep',
		'check',
		'structural',
		'corpus',
		'browser',
		'visual'
	]);
});

test('static fonts and images require structural rendered-output verification', () => {
	assert.deepEqual(laneIds(['static/fonts/channel.woff2', 'static/images/plate image.png']), [
		'policy-sweep',
		'structural',
		'corpus',
		'browser',
		'visual'
	]);
});

test('Pack fonts and assets also require Pack-matrix verification', () => {
	assert.deepEqual(
		laneIds(['src/lib/packs/syntax/fonts/channel.woff2', 'src/lib/packs/syntax/assets/noise.png']),
		['policy-sweep', 'structural', 'corpus', 'browser', 'visual', 'pack-matrix']
	);
});

test('model, workflow, and extension contract files require check, unit, and structural lanes', () => {
	for (const path of [
		'models/@swamp/software-factory/factory.yaml',
		'workflows/workflow-example.yaml',
		'extensions/manifest.yaml',
		'extensions/models/contracts.json'
	]) {
		assert.deepEqual(laneIds([path]), ['policy-sweep', 'check', 'unit', 'structural']);
	}
});

test('paths are normalized, deduplicated, and sorted', () => {
	assert.deepEqual(classifyChangeImpact(['./scripts/a.ts', 'scripts/a.ts', 'AGENTS.md']).paths, [
		'AGENTS.md',
		'scripts/a.ts'
	]);
});

test('NUL porcelain includes spaces, renames, copies, untracked files, and deletions', () => {
	const paths = parseGitWorkingTreeStatus(
		[
			' M docs/file with spaces.md',
			'R  src/new name.ts',
			'src/old name.ts',
			'C  src/copied name.ts',
			'src/source name.ts',
			'?? untracked file.ts',
			' D deleted file.ts',
			''
		].join('\0')
	);

	assert.deepEqual(paths, [
		'docs/file with spaces.md',
		'src/new name.ts',
		'src/old name.ts',
		'src/copied name.ts',
		'src/source name.ts',
		'untracked file.ts',
		'deleted file.ts'
	]);
});

test('empty Git working trees still select the policy-sweep lane', () => {
	assert.deepEqual(parseGitWorkingTreeStatus(''), []);
	assert.deepEqual(laneIds(parseGitWorkingTreeStatus('')), ['policy-sweep']);
});

test('porcelain paths are normalized, deduplicated, and sorted by the classifier', () => {
	const paths = parseGitWorkingTreeStatus('R  scripts/a.ts\0./scripts/a.ts\0?? AGENTS.md\0');
	assert.deepEqual(classifyChangeImpact(paths).paths, ['AGENTS.md', 'scripts/a.ts']);
});

test('absolute, drive-absolute, parent-traversal, and empty paths are rejected', () => {
	assert.throws(() => classifyChangeImpact(['/tmp/a.ts']), /project-relative/);
	assert.throws(() => classifyChangeImpact(['C:\\tmp\\a.ts']), /project-relative/);
	assert.throws(() => classifyChangeImpact(['../a.ts']), /project-relative/);
	assert.throws(() => classifyChangeImpact(['']), /project-relative/);
	assert.throws(
		() => classifyChangeImpact(parseGitWorkingTreeStatus('?? ../escape.ts\0')),
		/project-relative/
	);
});

test('malformed rename and non-NUL-terminated porcelain records are rejected', () => {
	assert.throws(() => parseGitWorkingTreeStatus('R  src/new.ts\0'), /original path/);
	assert.throws(() => parseGitWorkingTreeStatus('?? src/a.ts'), /NUL-terminated/);
	assert.throws(() => parseGitWorkingTreeStatus('ZZ src/a.ts\0'), /Illegal Git porcelain status/);
	assert.throws(() => parseGitWorkingTreeStatus('M\tsrc/a.ts\0'), /Malformed Git porcelain record/);
});

test('index and worktree rename/copy records consume exactly one original path', () => {
	assert.deepEqual(
		parseGitWorkingTreeStatus(
			'R  src/index-new.ts\0src/index-old.ts\0 C src/tree-copy.ts\0src/tree-source.ts\0'
		),
		['src/index-new.ts', 'src/index-old.ts', 'src/tree-copy.ts', 'src/tree-source.ts']
	);
});
