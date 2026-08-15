import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { engineState } from './engine-state.svelte';
import { PresetSchema } from './engine-schema';
import { parsePreset } from './preset-parser';
import { applyPreset } from './preset';
import { presetToWireFormat, serializeCompositionState } from './preset-pure';

describe('applyPreset', () => {
	it('deep-clones complete orientation placement overrides into engine state', () => {
		const preset = PresetSchema.parse({
			...blankPresetJson,
			state: {
				...blankPresetJson.state,
				overlays: [
					{
						type: 'lower-third',
						id: 'responsive',
						content: { kicker: 'Kicker', title: 'Title' },
						position: {
							anchor: 'bottom-left',
							offset: { x: 0.06, y: 0.08 },
							orientationOverrides: {
								vertical: {
									anchor: 'bottom-center',
									offset: { x: 0, y: 0.2 },
									scale: 0.9,
									rotation: 2
								}
							}
						}
					}
				]
			}
		});

		applyPreset(preset);

		assert.deepEqual(engineState.overlays[0].position.orientationOverrides?.vertical, {
			anchor: 'bottom-center',
			offset: { x: 0, y: 0.2 },
			rect: undefined,
			scale: 0.9,
			rotation: 2
		});
		engineState.overlays[0].position.orientationOverrides!.vertical!.offset!.y = 0.25;
		assert.equal(preset.state.overlays[0].position.orientationOverrides?.vertical?.offset?.y, 0.2);
	});

	it('round-trips and deep-clones Diagram orientation geometry', () => {
		const input = {
			...blankPresetJson,
			state: {
				...blankPresetJson.state,
				surface: {
					...blankPresetJson.state.surface,
					diagram: [
						{
							type: 'edge-arrow',
							id: 'responsive-edge',
							from: { x: 0.2, y: 0.5 },
							to: { x: 0.8, y: 0.5 },
							route: 'straight',
							orientationOverrides: {
								vertical: {
									from: { x: 0.5, y: 0.2 },
									to: { x: 0.5, y: 0.8 },
									route: 'arc',
									control: { x: 0.7, y: 0.5 }
								}
							}
						}
					]
				}
			}
		};
		const preset = PresetSchema.parse(input);
		const wire = presetToWireFormat(preset) as {
			state: { surface: { diagram?: unknown } };
		};

		assert.deepEqual(wire.state.surface.diagram, input.state.surface.diagram);
		applyPreset(preset);

		const edge = engineState.surface.diagram?.[0];
		assert.equal(edge?.type, 'edge-arrow');
		if (edge?.type !== 'edge-arrow') return;
		edge.orientationOverrides!.vertical!.control!.x = 0.6;
		const sourceEdge = preset.state.surface.diagram?.[0];
		assert.equal(
			sourceEdge?.type === 'edge-arrow'
				? sourceEdge.orientationOverrides?.vertical?.control?.x
				: undefined,
			0.7
		);
	});

	it('round-trips and deep-clones the chart Block declaration', () => {
		const chart = {
			mode: 'single',
			items: [
				{
					id: 'agent-columns',
					type: 'column-chart',
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
					layout: { mode: 'single' },
					domain: { min: 0, max: 800 },
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
		const input = {
			...blankPresetJson,
			state: {
				...blankPresetJson.state,
				surface: { ...blankPresetJson.state.surface, chart }
			}
		};
		const preset = parsePreset(input);
		applyPreset(preset);
		assert.deepEqual(engineState.surface.chart, chart);

		const liveItem = engineState.surface.chart!.items[0];
		liveItem.data.series[0].values[0].value = 361;
		assert.equal(preset.state.surface.chart!.items[0].data.series[0].values[0].value, 360);

		const wire = presetToWireFormat(preset) as { state: { surface: { chart?: unknown } } };
		assert.deepEqual(wire.state.surface.chart, chart);
		assert.deepEqual(parsePreset(wire).state.surface.chart, chart);
	});

	it('migrates, serializes, and deep-clones Source video as canonical media', () => {
		const input = {
			...blankPresetJson,
			state: {
				...blankPresetJson.state,
				sourceVideo: {
					assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`,
					sourceOffsetSeconds: 18.25,
					includeAudio: true,
					volume: 0.8
				}
			}
		};
		const preset = parsePreset(input);
		const wire = presetToWireFormat(preset) as {
			state: { media: unknown; sourceVideo?: unknown };
		};

		assert.equal('sourceVideo' in wire.state, false);
		assert.deepEqual(wire.state.media, preset.state.media);
		applyPreset(preset);
		assert.deepEqual(engineState.media, preset.state.media);
		const guiExport = serializeCompositionState(
			{ name: preset.name, description: preset.description, kind: preset.kind },
			engineState,
			preset.pack
		);
		assert.equal('sourceVideo' in guiExport.state, false);
		assert.deepEqual(guiExport.state.media, preset.state.media);
		engineState.media.videoTrack.clips[0].sourceStartSeconds = 22;
		assert.equal(preset.state.media.videoTrack.clips[0].sourceStartSeconds, 18.25);
	});
});
