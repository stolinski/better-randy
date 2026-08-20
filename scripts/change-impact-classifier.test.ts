import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyChangeImpact, parseGitWorkingTreeStatus } from './change-impact-classifier.ts';

function laneIds(paths: string[]): string[] {
	return classifyChangeImpact(paths).lanes.map((lane) => lane.id);
}

function surfaceIds(paths: string[]): string[] {
	return classifyChangeImpact(paths).surfaces.map((surface) => surface.id);
}

function humanReviewKinds(paths: string[]): string[] {
	return classifyChangeImpact(paths).requiredHumanReviews.map((review) => review.kind);
}

test('documentation-only changes require only control-plane policy verification', () => {
	const paths = ['docs/project-control-plane.md'];
	assert.deepEqual(laneIds(paths), ['policy-sweep']);
	assert.deepEqual(surfaceIds(paths), ['control-plane']);
	assert.deepEqual(humanReviewKinds(paths), []);
});

test('app TypeScript behavior has no human visual review', () => {
	const paths = ['src/lib/platform/user-composition-store.ts'];
	assert.deepEqual(surfaceIds(paths), ['authoring-app']);
	assert.deepEqual(humanReviewKinds(paths), []);
});

test('Svelte UI changes require app visual review and browser lanes', () => {
	const paths = ['src/lib/platform/RootInspector.svelte'];
	assert.deepEqual(laneIds(paths), ['policy-sweep', 'check', 'unit', 'structural', 'browser']);
	assert.deepEqual(surfaceIds(paths), ['authoring-app']);
	assert.deepEqual(humanReviewKinds(paths), ['authoring-app-visual']);
});

test('app-owned styles remain app visual work even while executable CSS lanes stay conservative', () => {
	const paths = ['src/lib/platform/inspector.css'];
	assert.deepEqual(surfaceIds(paths), ['authoring-app']);
	assert.deepEqual(humanReviewKinds(paths), ['authoring-app-visual']);
	assert.ok(laneIds(paths).includes('render-matrix'));
});

test('Pack pipeline changes add rendered-composition review and render lanes', () => {
	const paths = [
		'src/lib/packs/syntax/manifest.ts',
		'src/lib/pipelines/overlays/lower-third/identity.ts'
	];
	const result = classifyChangeImpact(paths);
	assert.deepEqual(
		result.lanes.map((lane) => lane.id),
		['policy-sweep', 'check', 'unit', 'structural', 'corpus', 'render-matrix', 'pack-matrix']
	);
	assert.deepEqual(surfaceIds(paths), ['rendered-composition']);
	assert.deepEqual(humanReviewKinds(paths), ['rendered-composition-aesthetic']);
});

test('platform Pipeline and Pack infrastructure is rendered-composition work', () => {
	for (const path of [
		'src/lib/platform/pipelines/runtime-loader.ts',
		'src/lib/platform/packs/resolve.ts'
	]) {
		assert.deepEqual(surfaceIds([path]), ['rendered-composition']);
		assert.deepEqual(humanReviewKinds([path]), ['rendered-composition-aesthetic']);
		assert.ok(laneIds([path]).includes('render-matrix'));
	}
});

test('Preset changes are rendered-composition aesthetic work', () => {
	const paths = ['src/lib/presets/lower-third.json'];
	assert.deepEqual(surfaceIds(paths), ['rendered-composition']);
	assert.deepEqual(humanReviewKinds(paths), ['rendered-composition-aesthetic']);
});

test('export controller changes are export-only without automatic aesthetic review', () => {
	const paths = ['src/lib/platform/composition-export-controller.ts'];
	assert.deepEqual(laneIds(paths), [
		'policy-sweep',
		'check',
		'unit',
		'structural',
		'export-decode'
	]);
	assert.deepEqual(surfaceIds(paths), ['export-pipeline']);
	assert.deepEqual(humanReviewKinds(paths), []);
});

test('global styles stay mixed and require both visual review kinds', () => {
	const paths = ['src/app.css'];
	assert.deepEqual(laneIds(paths), [
		'policy-sweep',
		'check',
		'structural',
		'corpus',
		'browser',
		'render-matrix'
	]);
	assert.deepEqual(surfaceIds(paths), ['authoring-app', 'rendered-composition']);
	assert.deepEqual(humanReviewKinds(paths), [
		'authoring-app-visual',
		'rendered-composition-aesthetic'
	]);
});

test('ambiguous static visual assets stay mixed and require both visual reviews', () => {
	const paths = ['static/fonts/channel.woff2', 'static/images/plate image.png'];
	assert.deepEqual(laneIds(paths), [
		'policy-sweep',
		'structural',
		'corpus',
		'browser',
		'render-matrix'
	]);
	assert.deepEqual(surfaceIds(paths), ['authoring-app', 'rendered-composition']);
	assert.deepEqual(humanReviewKinds(paths), [
		'authoring-app-visual',
		'rendered-composition-aesthetic'
	]);
});

test('Pack fonts and assets require only rendered-composition aesthetic review', () => {
	const paths = [
		'src/lib/packs/syntax/fonts/channel.woff2',
		'src/lib/packs/syntax/assets/noise.png'
	];
	assert.deepEqual(laneIds(paths), [
		'policy-sweep',
		'structural',
		'corpus',
		'browser',
		'render-matrix',
		'pack-matrix'
	]);
	assert.deepEqual(surfaceIds(paths), ['rendered-composition']);
	assert.deepEqual(humanReviewKinds(paths), ['rendered-composition-aesthetic']);
});

test('mixed render shells require app and composition visual review', () => {
	for (const path of ['src/lib/platform/Workspace.svelte', 'src/lib/platform/Composition.svelte']) {
		assert.deepEqual(surfaceIds([path]), ['authoring-app', 'rendered-composition']);
		assert.deepEqual(humanReviewKinds([path]), [
			'authoring-app-visual',
			'rendered-composition-aesthetic'
		]);
	}
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

test('empty Git working trees still select policy-only control-plane impact', () => {
	assert.deepEqual(parseGitWorkingTreeStatus(''), []);
	assert.deepEqual(laneIds(parseGitWorkingTreeStatus('')), ['policy-sweep']);
	assert.deepEqual(surfaceIds([]), ['control-plane']);
	assert.deepEqual(humanReviewKinds([]), []);
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
