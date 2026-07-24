import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { engineState } from './engine-state.svelte';
import { PresetSchema } from './engine-schema';
import { applyPreset } from './preset';
import { presetToWireFormat } from './preset-pure';

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
});
