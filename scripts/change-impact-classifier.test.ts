import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	classifyChangeImpact,
	classifySupersTaskIntent,
	parseGitWorkingTreeStatus,
	type SupersWorkDomainIntent
} from './change-impact-classifier.ts';

function laneIds(paths: string[], intent?: SupersWorkDomainIntent): string[] {
	return classifyChangeImpact(paths, intent).lanes.map((lane) => lane.id);
}

function domainIds(paths: string[], intent?: SupersWorkDomainIntent): string[] {
	return classifyChangeImpact(paths, intent).domains.map((domain) => domain.id);
}

function humanReviewKinds(paths: string[], intent?: SupersWorkDomainIntent): string[] {
	return classifyChangeImpact(paths, intent).requiredHumanReviews.map((review) => review.kind);
}

function assertOnlyLanes(
	paths: string[],
	expected: string[],
	intent?: SupersWorkDomainIntent
): void {
	assert.deepEqual(laneIds(paths, intent), ['policy-sweep', ...expected]);
}

const DOMAIN_AUDIT_LANES = [
	'timing-coverage',
	'authoring-dependency-tracking',
	'inspector-editor-parity',
	'planning-discoverability'
];

test('Swamp-only changes select control-plane verification and explicitly exclude app audits', () => {
	for (const path of [
		'extensions/models/repo-audit.ts',
		'models/@supers/repo-audit/model.yaml',
		'workflows/workflow-example.yaml'
	]) {
		assertOnlyLanes([path], ['swamp-control-plane']);
		assert.deepEqual(domainIds([path]), ['swamp-control-plane']);
		assert.deepEqual(humanReviewKinds([path]), []);
		assert.ok(!laneIds([path]).some((lane) => DOMAIN_AUDIT_LANES.includes(lane)));
	}
});

test('canonical text ordering is an exact Swamp helper, not product source', () => {
	const canonicalHelper = 'src/lib/utils/canonical-text-order.ts';
	assertOnlyLanes([canonicalHelper], ['swamp-control-plane']);
	assert.deepEqual(domainIds([canonicalHelper]), ['swamp-control-plane']);
	assert.deepEqual(humanReviewKinds([canonicalHelper]), []);
	assert.ok(
		!laneIds([canonicalHelper]).some((lane) =>
			[
				'check',
				'unit',
				'browser',
				'preset-static',
				'render-matrix',
				'pack-matrix',
				'export-decode',
				'performance'
			].includes(lane)
		)
	);

	const controlPlaneChange = [
		'extensions/models/repo-audit.ts',
		'src/lib/utils/canonical-text-order.ts'
	];
	assertOnlyLanes(controlPlaneChange, ['swamp-control-plane']);
	assert.deepEqual(domainIds(controlPlaneChange), ['swamp-control-plane']);
});

test('unrelated app changes explicitly exclude timing, tracking, parity, and planning audits', () => {
	const path = 'src/lib/platform/user-composition-store.ts';
	assertOnlyLanes([path], ['check', 'unit']);
	assert.deepEqual(domainIds([path]), ['authoring-app']);
	assert.ok(!laneIds([path]).some((lane) => DOMAIN_AUDIT_LANES.includes(lane)));
});

test('Inspector editor changes select bounded app and parity obligations', () => {
	const path = 'src/lib/platform/RootInspector.svelte';
	assertOnlyLanes([path], ['check', 'unit', 'browser', 'inspector-editor-parity']);
	assert.deepEqual(domainIds([path]), ['authoring-app']);
	assert.deepEqual(humanReviewKinds([path]), ['authoring-app-visual']);
	assert.ok(!laneIds([path]).some((lane) => ['preset-static', 'render-matrix'].includes(lane)));
});

test('direct Preset changes select render scope without Pack obligations', () => {
	const path = 'src/lib/presets/lower-third.json';
	assertOnlyLanes([path], ['preset-static', 'render-matrix']);
	assert.deepEqual(domainIds([path]), ['preset']);
	assert.deepEqual(humanReviewKinds([path]), ['rendered-composition-aesthetic']);
	assert.ok(!laneIds([path]).includes('pack-matrix'));
});

test('Pack changes add Pack obligations', () => {
	const path = 'src/lib/packs/syntax/manifest.ts';
	assertOnlyLanes([path], ['check', 'unit', 'preset-static', 'render-matrix', 'pack-matrix']);
	assert.deepEqual(domainIds([path]), ['pack']);
	assert.deepEqual(humanReviewKinds([path]), ['rendered-composition-aesthetic']);
});

test('rendering-only changes do not add export decode', () => {
	for (const path of [
		'src/lib/platform/pipelines/runtime-loader.ts',
		'src/lib/platform/composition-frame-renderer.ts'
	]) {
		assertOnlyLanes([path], ['check', 'unit', 'preset-static', 'render-matrix']);
		assert.deepEqual(domainIds([path]), ['rendering']);
		assert.ok(!laneIds([path]).includes('export-decode'));
	}
});

test('export changes require export decode without Preset, Pack, or render matrices', () => {
	const path = 'src/lib/platform/composition-export-controller.ts';
	assertOnlyLanes([path], ['check', 'unit', 'export-decode']);
	assert.deepEqual(domainIds([path]), ['export']);
	assert.ok(
		!laneIds([path]).some((lane) =>
			['preset-static', 'browser', 'render-matrix', 'pack-matrix'].includes(lane)
		)
	);
});

test('trusted schema and contract paths select exact coverage audits', () => {
	assertOnlyLanes(['src/lib/utils/composition-timing.ts'], ['check', 'unit', 'timing-coverage']);
	assertOnlyLanes(
		['src/lib/platform/composition-authoring-dependencies.ts'],
		['check', 'unit', 'authoring-dependency-tracking']
	);
	assertOnlyLanes(
		['src/lib/pipelines/effects/water/Editor.svelte'],
		['check', 'unit', 'browser', 'inspector-editor-parity']
	);
	assertOnlyLanes(
		['src/lib/platform/engine-schema.ts'],
		[
			'check',
			'unit',
			'preset-static',
			'render-matrix',
			'timing-coverage',
			'authoring-dependency-tracking',
			'inspector-editor-parity'
		]
	);
});

test('documentation and planning changes select planning and discoverability only', () => {
	for (const path of ['docs/project-control-plane.md', 'docs/roadmap.md', '.dex/config.json']) {
		assertOnlyLanes([path], ['planning-discoverability']);
		assert.deepEqual(humanReviewKinds([path]), []);
	}
});

test('repository infrastructure has its own bounded lane', () => {
	for (const path of [
		'package.json',
		'.github/workflows/quality.yml',
		'scripts/test-structural.mjs'
	]) {
		assertOnlyLanes([path], ['repository-infrastructure']);
	}
});

test('ordinary human task wording selects deterministic pre-implementation domains', () => {
	const fixtures = [
		{
			name: 'author lower-third Preset',
			description: '',
			domains: ['preset'],
			skills: ['author', 'implementation'],
			constraints: ['docs/preset-format.md']
		},
		{
			name: 'fix canvas inspector selection',
			description: '',
			domains: ['authoring-app'],
			skills: ['implementation', 'svelte-code-writer', 'svelte-core-bestpractices'],
			constraints: []
		},
		{
			name: 'benchmark export performance',
			description: '',
			domains: ['export', 'performance'],
			skills: ['implementation'],
			constraints: ['docs/engine-architecture.md', 'docs/sentry-dev-flow.md']
		},
		{
			name: 'update Factory verification routing',
			description: '',
			domains: ['swamp-control-plane'],
			skills: ['implementation', 'software-factory', 'swamp'],
			constraints: ['docs/project-control-plane.md']
		},
		{
			name: 'reconcile roadmap docs',
			description: '',
			domains: ['documentation-planning'],
			skills: ['domain-modeling', 'implementation'],
			constraints: ['docs/CONTEXT.md']
		}
	] as const;

	for (const fixture of fixtures) {
		const intent = classifySupersTaskIntent({
			name: fixture.name,
			description: fixture.description,
			metadata: null
		});
		assert.deepEqual(intent.declaredDomains, fixture.domains, fixture.name);
		assert.deepEqual(intent.selectedSkills, fixture.skills, fixture.name);
		for (const constraint of fixture.constraints) {
			assert.ok(intent.constraintPaths.includes(constraint), `${fixture.name}: ${constraint}`);
		}
	}
});

test('free-text description examples cannot add work domains', () => {
	const taskName = 'Route Supers Factory verification by change domain';
	const exclusionDescription =
		'Swamp-only: no lower-third Preset, Pack, browser, canvas inspector selection, render, export, or benchmark performance checks.';
	const intent = classifySupersTaskIntent({
		name: taskName,
		description: exclusionDescription,
		metadata: null
	});
	assert.equal(intent.status, 'known');
	assert.deepEqual(intent.declaredDomains, ['swamp-control-plane']);

	const pathHintIntent = classifySupersTaskIntent({
		name: taskName,
		description: `${exclusionDescription} Update \`docs/project-control-plane.md\`.`,
		metadata: null
	});
	assert.deepEqual(pathHintIntent.declaredDomains, [
		'swamp-control-plane',
		'documentation-planning'
	]);
	assert.ok(
		!pathHintIntent.declaredDomains.some((domain) =>
			['preset', 'pack', 'authoring-app', 'rendering', 'export', 'performance'].includes(domain)
		)
	);
});

test('natural Preset, Pack, rendering, and export intent keeps smallest-complete obligations', () => {
	const presetIntent = classifySupersTaskIntent({
		name: 'author lower-third Preset',
		description: '',
		metadata: null
	});
	assertOnlyLanes(
		['src/lib/presets/lower-third.json'],
		['preset-static', 'render-matrix'],
		presetIntent
	);
	assert.ok(!laneIds(['src/lib/presets/lower-third.json'], presetIntent).includes('pack-matrix'));

	const packIntent = classifySupersTaskIntent({
		name: 'adjust the Syntax Pack',
		description: '',
		metadata: null
	});
	assert.ok(laneIds(['src/lib/packs/syntax/manifest.ts'], packIntent).includes('pack-matrix'));

	const renderingIntent = classifySupersTaskIntent({
		name: 'fix WebGPU rendering',
		description: '',
		metadata: null
	});
	assert.ok(
		!laneIds(['src/lib/platform/pipelines/runtime-loader.ts'], renderingIntent).includes(
			'export-decode'
		)
	);

	const exportIntent = classifySupersTaskIntent({
		name: 'fix WebM export',
		description: '',
		metadata: null
	});
	assert.ok(
		laneIds(['src/lib/platform/composition-export-controller.ts'], exportIntent).includes(
			'export-decode'
		)
	);
});

test('explicit project-relative file hints route without magic directives', () => {
	const intent = classifySupersTaskIntent({
		name: 'Update the requested source',
		description: 'The contract is in `src/lib/packs/syntax/manifest.ts`.',
		metadata: null
	});
	assert.equal(intent.status, 'known');
	assert.deepEqual(intent.declaredDomains, ['pack']);
	assert.ok(intent.constraintPaths.includes('docs/packs/authoring-playbook.md'));
});

test('performance intent adds declared benchmark evidence to touched rendering checks', () => {
	const intent = classifySupersTaskIntent({
		name: 'Improve frame renderer performance',
		description:
			'Supers-Delivery-Domains: performance, rendering\nSupers-Delivery-Benchmarks: benchmark:render-frame',
		metadata: null
	});
	assert.equal(intent.status, 'mixed');
	assert.deepEqual(intent.declaredDomains, ['rendering', 'performance']);
	assert.deepEqual(intent.benchmarkScripts, ['benchmark:render-frame']);
	assertOnlyLanes(
		['src/lib/platform/composition-frame-renderer.ts'],
		['check', 'unit', 'preset-static', 'render-matrix', 'performance'],
		intent
	);
	assert.ok(
		!laneIds(['src/lib/platform/composition-frame-renderer.ts'], intent).includes('export-decode')
	);
});

test('explicit directives remain additive and precise', () => {
	const intent = classifySupersTaskIntent({
		name: 'Update control plane',
		description: 'Supers-Delivery-Domains: swamp-control-plane, documentation-planning',
		metadata: {
			supersDelivery: {
				workDomains: ['performance'],
				benchmarkScripts: ['benchmark:factory-route']
			}
		}
	});
	assert.deepEqual(intent.declaredDomains, [
		'performance',
		'swamp-control-plane',
		'documentation-planning'
	]);
	assert.deepEqual(intent.benchmarkScripts, ['benchmark:factory-route']);
	assertOnlyLanes(
		['docs/project-control-plane.md'],
		['performance', 'swamp-control-plane', 'planning-discoverability'],
		intent
	);
});

test('ambiguous task text stays unknown and malformed directives fail closed', () => {
	const ambiguous = classifySupersTaskIntent({
		name: 'Improve the current behavior',
		description: 'Make the result better without changing unrelated things.',
		metadata: null
	});
	assert.equal(ambiguous.status, 'unknown');
	assert.deepEqual(ambiguous.declaredDomains, []);
	assert.throws(
		() =>
			classifySupersTaskIntent({
				name: 'Bad route',
				description: 'Supers-Delivery-Domains: everything',
				metadata: null
			}),
		/Unsupported Supers Delivery work domain/
	);
	assert.throws(
		() =>
			classifySupersTaskIntent({
				name: 'Bad benchmark',
				description: 'Supers-Delivery-Benchmarks: test',
				metadata: null
			}),
		/unsupported package script/
	);
});

test('path obligations remain authoritative over narrower human intent', () => {
	const docsIntent = classifySupersTaskIntent({
		name: 'Documentation',
		description: 'Supers-Delivery-Domains: documentation-planning',
		metadata: null
	});
	assertOnlyLanes(
		['src/lib/presets/lower-third.json'],
		['preset-static', 'render-matrix'],
		docsIntent
	);
});

test('mixed changes take the exact union without unrelated suites', () => {
	assertOnlyLanes(
		['src/lib/platform/user-composition-store.ts', 'workflows/workflow-example.yaml'],
		['check', 'unit', 'swamp-control-plane']
	);
	assert.equal(
		classifyChangeImpact([
			'src/lib/platform/user-composition-store.ts',
			'workflows/workflow-example.yaml'
		]).classification,
		'mixed'
	);
});

test('unknown paths pause without guessing or spraying domain suites', () => {
	const result = classifyChangeImpact(['fixtures/unmapped.payload']);
	assert.equal(result.classification, 'unknown');
	assert.deepEqual(result.unknownPaths, ['fixtures/unmapped.payload']);
	assert.deepEqual(
		result.lanes.map((lane) => lane.id),
		['policy-sweep', 'unknown']
	);
	assert.deepEqual(domainIds(['fixtures/unmapped.payload']), ['unknown']);
});

test('global styles and mixed render shells retain both visual review obligations', () => {
	for (const path of ['src/app.css', 'src/lib/platform/Workspace.svelte']) {
		assert.deepEqual(humanReviewKinds([path]), [
			'authoring-app-visual',
			'rendered-composition-aesthetic'
		]);
	}
});

test('paths use locale-independent canonical ordering', () => {
	assert.deepEqual(
		classifyChangeImpact(['./scripts/ä.ts', 'scripts/z.ts', 'scripts/a.ts', 'scripts/a.ts']).paths,
		['scripts/a.ts', 'scripts/z.ts', 'scripts/ä.ts']
	);
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

test('empty or unsafe changed paths are unavailable or rejected', () => {
	assert.deepEqual(laneIds([]), ['policy-sweep', 'unknown']);
	assert.throws(() => classifyChangeImpact(['/tmp/a.ts']), /project-relative/);
	assert.throws(() => classifyChangeImpact(['C:\\tmp\\a.ts']), /project-relative/);
	assert.throws(() => classifyChangeImpact(['../a.ts']), /project-relative/);
	assert.throws(() => classifyChangeImpact(['']), /project-relative/);
});

test('malformed rename and non-NUL-terminated porcelain records are rejected', () => {
	assert.throws(() => parseGitWorkingTreeStatus('R  src/new.ts\0'), /original path/);
	assert.throws(() => parseGitWorkingTreeStatus('?? src/a.ts'), /NUL-terminated/);
	assert.throws(() => parseGitWorkingTreeStatus('ZZ src/a.ts\0'), /Illegal Git porcelain status/);
	assert.throws(() => parseGitWorkingTreeStatus('M\tsrc/a.ts\0'), /Malformed Git porcelain record/);
});
