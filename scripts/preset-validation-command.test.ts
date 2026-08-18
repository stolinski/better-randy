import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
	mergePresetValidationChangedPaths,
	parsePresetValidationCommand
} from './preset-validation-command.ts';
import { selectAffectedStaticPresetPackAxes } from './preset-validation-scope.ts';

const registry = {
	presets: [
		{
			slug: 'lower-third',
			pipelineReferences: ['surfaces:plain', 'overlays:lower-third'],
			presetDependencies: []
		},
		{
			slug: 'chapter-card',
			pipelineReferences: ['surfaces:chapter-card'],
			presetDependencies: []
		}
	],
	packs: [{ id: 'syntax' }, { id: 'clean-light' }]
};

test('focused CLI validates an explicit Preset across every Pack and both orientations', () => {
	const run = spawnSync(
		process.execPath,
		['--experimental-strip-types', 'scripts/verify-presets.ts', '--preset', 'lower-third'],
		{ cwd: process.cwd(), encoding: 'utf8' }
	);
	assert.equal(run.status, 0, run.stderr);
	assert.match(run.stdout, /lower-third × clean-light \(horizontal \+ vertical\)/);
	assert.match(run.stdout, /lower-third × syntax \(horizontal \+ vertical\)/);
	assert.match(run.stdout, /Validated 4 Preset × Pack axes in both orientations/);
	assert.match(run.stdout, /no browser, capture, export, Critic, or render matrix was launched/);
});

test('focused CLI stops with the first exact selection failure', () => {
	const run = spawnSync(
		process.execPath,
		['--experimental-strip-types', 'scripts/verify-presets.ts', '--preset', 'missing-preset'],
		{ cwd: process.cwd(), encoding: 'utf8' }
	);
	assert.equal(run.status, 1);
	assert.match(run.stderr, /^✗ Unknown built-in Preset: missing-preset\n$/);
});

test('command defaults to all and accepts one or several explicit Presets', () => {
	assert.deepEqual(parsePresetValidationCommand([]), {
		mode: 'all',
		presetSlugs: [],
		changedPaths: []
	});
	assert.deepEqual(
		parsePresetValidationCommand(['--preset', 'lower-third.json', '--preset', 'chapter-card']),
		{
			mode: 'explicit',
			presetSlugs: ['lower-third', 'chapter-card'],
			changedPaths: []
		}
	);
});

test('command accepts explicit or JSON change inventories and an optional baseline', () => {
	assert.deepEqual(
		parsePresetValidationCommand([
			'--affected',
			'--changed',
			'src/lib/presets/lower-third.json',
			'--changed-paths-json',
			'["src/lib/packs/syntax/manifest.ts"]',
			'--base',
			'main'
		]),
		{
			mode: 'affected',
			presetSlugs: [],
			changedPaths: ['src/lib/presets/lower-third.json', 'src/lib/packs/syntax/manifest.ts'],
			baseRevision: 'main'
		}
	);
});

test('explicit paths and baseline-discovered paths are unioned in canonical order', () => {
	assert.deepEqual(
		mergePresetValidationChangedPaths(
			['src/lib/presets/lower-third.json'],
			['src/lib/packs/syntax/manifest.ts', 'src/lib/presets/lower-third.json']
		),
		['src/lib/packs/syntax/manifest.ts', 'src/lib/presets/lower-third.json']
	);
});

test('command rejects mixed scopes, duplicate Presets, and malformed change inventories', () => {
	assert.throws(
		() => parsePresetValidationCommand(['--all', '--preset', 'lower-third']),
		/one validation scope/
	);
	assert.throws(
		() => parsePresetValidationCommand(['--preset', 'lower-third', '--preset', 'lower-third']),
		/must be unique/
	);
	assert.throws(
		() => parsePresetValidationCommand(['--affected', '--changed-paths-json', '{}']),
		/array of strings/
	);
});

test('affected scope is narrow for Presets, Pipelines, and Packs and broad for engine changes', () => {
	assert.deepEqual(
		selectAffectedStaticPresetPackAxes(registry, ['src/lib/presets/lower-third.json']),
		[
			{ presetSlug: 'lower-third', packId: 'clean-light' },
			{ presetSlug: 'lower-third', packId: 'syntax' }
		]
	);
	assert.deepEqual(
		selectAffectedStaticPresetPackAxes(registry, [
			'src/lib/pipelines/overlays/lower-third/renderer.ts'
		]),
		[
			{ presetSlug: 'lower-third', packId: 'clean-light' },
			{ presetSlug: 'lower-third', packId: 'syntax' }
		]
	);
	assert.deepEqual(
		selectAffectedStaticPresetPackAxes(registry, ['src/lib/packs/syntax/manifest.ts']),
		[
			{ presetSlug: 'chapter-card', packId: 'syntax' },
			{ presetSlug: 'lower-third', packId: 'syntax' }
		]
	);
	assert.equal(
		selectAffectedStaticPresetPackAxes(registry, ['src/lib/platform/composition-frame-renderer.ts'])
			.length,
		4
	);
});

test('Preset changes include transitive transition dependents', () => {
	const transitionRegistry = {
		presets: [
			{ slug: 'endpoint', pipelineReferences: ['surfaces:plain'], presetDependencies: [] },
			{
				slug: 'wipe',
				pipelineReferences: ['transitions:mask-wipe'],
				presetDependencies: ['endpoint', 'other-endpoint']
			},
			{
				slug: 'nested-wipe',
				pipelineReferences: ['transitions:mask-wipe'],
				presetDependencies: ['wipe', 'other-endpoint']
			}
		],
		packs: [{ id: 'syntax' }]
	};
	assert.deepEqual(
		selectAffectedStaticPresetPackAxes(transitionRegistry, ['src/lib/presets/endpoint.json']),
		[
			{ presetSlug: 'endpoint', packId: 'syntax' },
			{ presetSlug: 'nested-wipe', packId: 'syntax' },
			{ presetSlug: 'wipe', packId: 'syntax' }
		]
	);
});

test('concrete transition, caption, text-animation, and stage changes select their consumers', () => {
	const typedRegistry = {
		presets: [
			{
				slug: 'typed',
				pipelineReferences: [
					'transitions:mask-wipe',
					'captions:karaoke',
					'text-animations:fade-through',
					'stages:depth'
				],
				presetDependencies: []
			}
		],
		packs: [{ id: 'syntax' }]
	};
	for (const path of [
		'src/lib/pipelines/effects/mask-wipe/index.ts',
		'src/lib/pipelines/captions/identity.ts',
		'src/lib/text-animations/raw-catalog/effects/fade-through.json',
		'src/lib/platform/pipelines/depth-stage.ts'
	]) {
		assert.deepEqual(selectAffectedStaticPresetPackAxes(typedRegistry, [path]), [
			{ presetSlug: 'typed', packId: 'syntax' }
		]);
	}
});

test('documentation changes select no static Preset work and unsafe inventories fail closed', () => {
	assert.deepEqual(
		selectAffectedStaticPresetPackAxes(registry, ['docs/project-control-plane.md']),
		[]
	);
	assert.throws(
		() => selectAffectedStaticPresetPackAxes(registry, ['../outside.ts']),
		/safe project-relative/
	);
	assert.throws(
		() =>
			selectAffectedStaticPresetPackAxes(registry, [
				'src/lib/presets/lower-third.json',
				'src/lib/packs/syntax/manifest.ts'
			]),
		/canonical order/
	);
});
