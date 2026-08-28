import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	collectPresetPipelineReferences,
	collectGfxRenderRegistry,
	deriveGfxRenderMatrixManifest
} from './derive-gfx-render-matrix-manifest.ts';
import { selectAffectedStaticPresetPackAxes as selectAffectedPresetPackAxes } from './preset-validation-scope.ts';

const REVISION = 'a'.repeat(40);
const FINGERPRINT = 'b'.repeat(64);

test('collector matches the source-derived deliverable registry without hardcoded counts', async () => {
	const registry = await collectGfxRenderRegistry();
	const filenames = (await readdir('src/lib/presets')).filter((name) => name.endsWith('.json'));
	const sourceDeliverables: string[] = [];
	for (const filename of filenames) {
		const raw = JSON.parse(await readFile(`src/lib/presets/${filename}`, 'utf8')) as {
			kind?: string;
		};
		if (raw.kind !== 'fixture') sourceDeliverables.push(filename.slice(0, -5));
	}
	sourceDeliverables.sort((left, right) => left.localeCompare(right));
	assert.deepEqual(
		registry.presets.map((entry) => entry.slug),
		sourceDeliverables
	);
	assert.ok(registry.packs.length > 0);
	assert.ok(registry.presets.every((entry) => entry.preset.kind !== 'fixture'));
});

test('full manifest derives the complete snapshot cross-product', async () => {
	const { snapshot, manifest } = await deriveGfxRenderMatrixManifest({
		scope: 'full',
		sourceRevision: REVISION,
		engineFingerprint: FINGERPRINT
	});
	assert.ok(manifest);
	const sampleTotal = snapshot.deliverablePresets.reduce(
		(total, preset) => total + preset.samples.length,
		0
	);
	assert.equal(manifest.coordinates.length, sampleTotal * snapshot.packs.length * 2);
	assert.equal(
		new Set(manifest.coordinates.map((entry) => entry.cellId)).size,
		manifest.coordinates.length
	);
	for (const preset of snapshot.deliverablePresets) {
		for (const sample of preset.samples) {
			assert.ok(sample.auxiliaryFrameIndices.length > 0);
			assert.ok(sample.stableGeometryCandidateIds.length > 0);
			const coordinate = manifest.coordinates.find(
				(entry) =>
					entry.presetSlug === preset.slug &&
					(entry.sample as { sampleId: string }).sampleId === sample.sampleId
			);
			assert.deepEqual(coordinate?.sample, sample);
		}
	}
});

test('affected selection unions direct Preset and Pack impacts', async () => {
	const registry = await collectGfxRenderRegistry();
	const preset = registry.presets[0];
	const pack = registry.packs[0];
	const axes = selectAffectedPresetPackAxes(
		registry,
		[`src/lib/packs/${pack.id}/manifest.ts`, `src/lib/presets/${preset.slug}.json`].sort(
			(left, right) => left.localeCompare(right)
		)
	);
	const selected = new Set(axes.map((entry) => `${entry.presetSlug}:${entry.packId}`));
	for (const livePack of registry.packs)
		assert.equal(selected.has(`${preset.slug}:${livePack.id}`), true);
	for (const livePreset of registry.presets)
		assert.equal(selected.has(`${livePreset.slug}:${pack.id}`), true);
	assert.equal(selected.size, registry.packs.length + registry.presets.length - 1);
});

test('affected selection maps annotation styles across body, messages, and checklist content', async () => {
	const live = await collectGfxRenderRegistry();
	const base = live.presets[0].preset;
	const fixtures = [
		{
			slug: 'body-highlight',
			style: 'highlight',
			content: {
				...structuredClone(base.state.surface.content),
				body: [
					{
						type: 'paragraph' as const,
						segments: [{ text: 'Body mark', markStyles: ['highlight' as const] }]
					}
				],
				messages: [],
				items: []
			}
		},
		{
			slug: 'message-underline',
			style: 'underline',
			content: {
				...structuredClone(base.state.surface.content),
				body: [],
				messages: [
					{
						from: 'them' as const,
						text: [
							{
								type: 'paragraph' as const,
								segments: [{ text: 'Message mark', markStyles: ['underline' as const] }]
							}
						]
					}
				],
				items: []
			}
		},
		{
			slug: 'checklist-strike',
			style: 'strike',
			content: {
				...structuredClone(base.state.surface.content),
				body: [],
				messages: [],
				items: [{ text: 'Checklist mark', checked: true }]
			}
		}
	];
	const presets = fixtures.map((fixture) => {
		const preset = structuredClone(base);
		preset.state.surface.content = fixture.content;
		return {
			slug: fixture.slug,
			presetFingerprint: fixture.slug.padEnd(64, 'a'),
			readingPlanDigest: fixture.slug.padEnd(64, 'b'),
			readingPlanIds: [],
			samples: [],
			frameRate: { num: 30, den: 1 },
			pipelineReferences: collectPresetPipelineReferences(preset),
			presetDependencies: [],
			preset
		};
	});
	for (const fixture of fixtures) {
		const axes = selectAffectedPresetPackAxes(
			{
				presets,
				knownPresetSlugs: presets.map((preset) => preset.slug),
				packs: [{ id: 'syntax' }]
			},
			[`src/lib/pipelines/annotations/${fixture.style}/renderer.ts`]
		);
		assert.deepEqual(axes, [{ presetSlug: fixture.slug, packId: 'syntax' }]);
	}
});

test('affected selection maps concrete Block Pipeline impacts through typed references', async () => {
	const registry = await collectGfxRenderRegistry();
	const reference = 'blocks:bar-chart';
	const expectedPresets = registry.presets
		.filter((preset) => preset.pipelineReferences.includes(reference))
		.map((preset) => preset.slug)
		.sort((left, right) => left.localeCompare(right));
	assert.ok(expectedPresets.length > 0);
	const axes = selectAffectedPresetPackAxes(registry, [
		'src/lib/pipelines/blocks/bar-chart/renderer.ts'
	]);
	assert.deepEqual(
		[...new Set(axes.map((axis) => axis.presetSlug))].sort((left, right) =>
			left.localeCompare(right)
		),
		expectedPresets
	);
	assert.equal(axes.length, expectedPresets.length * registry.packs.length);
});

test('affected selection distinguishes known unlisted Presets from unknown paths', async () => {
	const registry = await collectGfxRenderRegistry();
	const knownUnlistedSlug = registry.knownPresetSlugs.find(
		(slug) => !registry.presets.some((preset) => preset.slug === slug)
	);
	assert.ok(knownUnlistedSlug);
	assert.deepEqual(
		selectAffectedPresetPackAxes(registry, [`src/lib/presets/${knownUnlistedSlug}.json`]),
		[]
	);
	assert.equal(
		selectAffectedPresetPackAxes(registry, ['src/lib/presets/deleted.json']).length,
		registry.presets.length * registry.packs.length
	);
	assert.deepEqual(selectAffectedPresetPackAxes(registry, ['docs/project-control-plane.md']), []);
	assert.throws(() =>
		selectAffectedPresetPackAxes(registry, ['src/lib/presets/a.json', 'src/lib/presets/a.json'])
	);
});
