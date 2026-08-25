import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { createDefaultEngineState, type Preset } from './engine-schema';
import { validatePresetSemantics } from './preset-validation';
import { TRANSITION_EFFECT_DEFINITION_REGISTRY } from './pipelines/transition-definition-registry';

function videoPreset(name: string): Preset {
	const state = createDefaultEngineState();
	state.media = {
		assets: [
			{
				id: 'asset-a',
				kind: 'video',
				name: 'Source video',
				assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`
			}
		],
		videoTrack: {
			clips: [
				{
					id: 'clip-a',
					assetId: 'asset-a',
					timelineStartFrame: 0,
					durationFrames: 180,
					sourceStartSeconds: 0,
					audio: { enabled: true, gain: 1 }
				}
			]
		}
	};
	return { schema: 'supers@1', name, pack: 'syntax', kind: 'fixture', state };
}

describe('Transition Effect semantic validation', () => {
	it('reports an incomplete transition definition instead of throwing', () => {
		const definition = TRANSITION_EFFECT_DEFINITION_REGISTRY.maskWipe;
		const paramsSchema = definition.paramsSchema;
		assert.equal(Reflect.deleteProperty(definition, 'paramsSchema'), true);

		try {
			const preset: Preset = {
				schema: 'supers@1',
				name: 'Transition with incomplete definition',
				pack: 'syntax',
				kind: 'fixture',
				state: createDefaultEngineState(),
				transition: {
					from: 'from',
					to: 'to',
					effect: 'mask-wipe',
					durationMs: 600,
					params: {}
				}
			};

			const issues = validatePresetSemantics(preset);

			assert.ok(
				issues.some(
					(issue) =>
						issue.path.join('.') === 'transition.effect' &&
						issue.message.includes('missing its parameter schema')
				)
			);
		} finally {
			definition.paramsSchema = paramsSchema;
		}
	});
});

describe('Video media semantic validation', () => {
	it('rejects active Video clips on a transition Preset', () => {
		const preset = videoPreset('Transition');
		preset.transition = {
			from: 'from',
			to: 'to',
			effect: 'mask-wipe',
			durationMs: 600,
			params: {}
		};

		const issues = validatePresetSemantics(preset);

		assert.ok(
			issues.some(
				(issue) =>
					issue.path.join('.') === 'state.media.videoTrack.clips' &&
					issue.message.includes('transition Presets')
			)
		);
	});

	it('rejects active Video clip transition endpoints when references resolve', () => {
		const state = createDefaultEngineState();
		const transition: Preset = {
			schema: 'supers@1',
			name: 'Transition',
			pack: 'syntax',
			kind: 'fixture',
			state,
			transition: {
				from: 'video',
				to: 'plain',
				effect: 'mask-wipe',
				durationMs: 600,
				params: {}
			}
		};
		const video = videoPreset('Video');
		const plain: Preset = {
			schema: 'supers@1',
			name: 'Plain',
			pack: 'syntax',
			kind: 'fixture',
			state: createDefaultEngineState()
		};

		const issues = validatePresetSemantics(transition, {
			resolvePreset: (slug) => (slug === 'video' ? video : slug === 'plain' ? plain : null)
		});

		assert.ok(
			issues.some(
				(issue) =>
					issue.path.join('.') === 'transition.from' &&
					issue.message.includes('transition snapshots')
			)
		);
		assert.ok(!issues.some((issue) => issue.path.join('.') === 'transition.to'));
	});

	it('enforces unique IDs, reference integrity, ordering, and composition bounds', () => {
		const preset = videoPreset('Invalid media');
		preset.state.media.assets.push({ ...preset.state.media.assets[0] });
		preset.state.media.videoTrack.clips.push(
			{
				...preset.state.media.videoTrack.clips[0],
				assetId: 'missing-asset',
				timelineStartFrame: 120,
				durationFrames: 90
			},
			{
				...preset.state.media.videoTrack.clips[0],
				id: 'clip-b',
				timelineStartFrame: 170,
				durationFrames: 20
			}
		);

		const issues = validatePresetSemantics(preset);
		const messages = issues.map((issue) => issue.message);

		assert.ok(messages.some((message) => message.includes('Duplicate Video asset ID')));
		assert.ok(messages.some((message) => message.includes('Duplicate Video clip ID')));
		assert.ok(messages.some((message) => message.includes('references missing asset')));
		assert.ok(messages.some((message) => message.includes('ordered and non-overlapping')));
		assert.ok(messages.some((message) => message.includes("beyond the composition's 180 frames")));
	});

	it('allows touching clips and ignores unused assets for active-clip restrictions', () => {
		const preset = videoPreset('Touching clips');
		preset.state.media.videoTrack.clips[0].durationFrames = 90;
		preset.state.media.videoTrack.clips.push({
			...preset.state.media.videoTrack.clips[0],
			id: 'clip-b',
			timelineStartFrame: 90
		});
		assert.deepEqual(validatePresetSemantics(preset), []);

		const assetOnly = videoPreset('Asset library only');
		assetOnly.state.media.videoTrack.clips = [];
		assetOnly.transition = {
			from: 'from',
			to: 'to',
			effect: 'mask-wipe',
			durationMs: 600,
			params: {}
		};
		const issues = validatePresetSemantics(assetOnly);
		assert.ok(!issues.some((issue) => issue.path.join('.') === 'state.media.videoTrack.clips'));
	});
});

function chartPresetForSemanticValidation(): Preset {
	const preset: Preset = {
		schema: 'supers@1',
		name: 'Chart semantic validation',
		pack: 'syntax',
		kind: 'fixture',
		state: createDefaultEngineState()
	};
	preset.state.surface.chart = {
		mode: 'single',
		items: [
			{
				id: 'agent-grid',
				type: 'unit-grid-chart',
				title: 'Agent count',
				data: {
					categories: [
						{ id: 'one', label: '1' },
						{ id: 'multiple', label: '2–5' }
					],
					series: [
						{
							id: 'responses',
							label: 'Responses',
							values: [
								{ categoryId: 'one', value: 360 },
								{ categoryId: 'multiple', value: 744 }
							]
						}
					]
				},
				normalization: { total: 1104, unitCount: 100 },
				labels: { categories: true, values: true, legend: false },
				fill: { role: 'default' },
				motion: {
					entry: { start: 0, duration: 0.1 },
					reveal: { start: 0.1, duration: 0.2 },
					emphasis: { start: 0.3, duration: 0.1 },
					annotation: { start: 0.4, duration: 0.1 },
					exit: { start: 0.9, duration: 0.1 }
				}
			}
		]
	};
	return preset;
}

describe('Chart semantic validation boundary', () => {
	it('accepts a structurally and semantically valid chart', () => {
		assert.deepEqual(validatePresetSemantics(chartPresetForSemanticValidation()), []);
	});

	it('prefixes chart semantic issues through validatePresetSemantics', () => {
		const preset = chartPresetForSemanticValidation();
		const item = preset.state.surface.chart!.items[0];
		if (item.type !== 'unit-grid-chart') throw new Error('fixture type');
		item.normalization.total = 1000;

		const issues = validatePresetSemantics(preset);
		assert.ok(
			issues.some(
				(issue) =>
					issue.path.join('.') === 'state.surface.chart.items.0.normalization.total' &&
					issue.message.includes('parts sum')
			)
		);
	});
});
