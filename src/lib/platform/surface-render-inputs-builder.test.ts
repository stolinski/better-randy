import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import type { RenderAnimState } from './anim-state.svelte';
import { createDefaultEngineState } from './engine-schema';
import { getPack } from './packs/registry';
import { buildSurfaceRenderInputs } from './surface-render-inputs-builder';

function animationState(): RenderAnimState {
	return {
		bodyVisibility: 1,
		markProgresses: [0.5, 1, 0.25],
		overlayProgresses: [],
		overlayChannels: [],
		blockProgresses: {},
		blockAlphas: {},
		blockChannels: {},
		paperVisibility: 0.6,
		globalProgress: 0.5
	};
}

describe('buildSurfaceRenderInputs', () => {
	it('preserves authored mark timing and checklist strike window duration semantics', () => {
		const state = createDefaultEngineState();
		state.transport.durationSeconds = 10;
		state.surface.type = 'checklist';
		state.surface.content.items = [
			{ text: 'Static', checked: true },
			{ text: 'Animated', checked: true, strike: { start: 0.2, duration: 0.15 } }
		];
		const inputs = buildSurfaceRenderInputs(
			{
				readState: () => state,
				readAnimState: animationState,
				readPack: () => getPack('syntax'),
				readMarkColor: () => '#ff0000',
				readTextAnimationAlpha: () => null
			},
			2
		);

		assert.deepEqual(inputs.markDurationMsByIndex, [2_400, 1, 1_500]);
		assert.equal(inputs.markAlpha, 0.6);
	});

	it('builds text alpha and diagram channels from current frame state', () => {
		const state = createDefaultEngineState();
		state.textAnimations.push({
			id: 'body-reveal',
			effect: 'fade-through',
			target: { kind: 'surface', slot: 'body' },
			enter: { start: 0, duration: 0.2, ease: 'smooth' }
		});
		state.surface.diagram = [
			{
				type: 'label',
				id: 'label-one',
				position: { x: 0.2, y: 0.3 },
				text: 'Signal',
				role: 'caption',
				scale: 1
			}
		];
		const anim = animationState();
		anim.blockProgresses['label-one'] = 0.4;
		anim.blockAlphas['label-one'] = 0.7;
		const inputs = buildSurfaceRenderInputs(
			{
				readState: () => state,
				readAnimState: () => anim,
				readPack: () => getPack('syntax'),
				readMarkColor: () => '#ff0000',
				readTextAnimationAlpha: () => ({
					unitRangeFor: () => ({ from: 0, to: 1 }),
					unitAlphaAt: (_slot, unit) => (unit === 0 ? 0.8 : 0.35)
				})
			},
			3
		);

		assert.deepEqual(inputs.textAnimAlphaByMarkIndex, [0.35]);
		assert.equal(inputs.diagram?.drawProgressById['label-one'], 0.4);
		assert.equal(inputs.diagram?.alphaById['label-one'], 0.7);
		assert.equal(inputs.diagram?.primitives[0].id, 'label-one');
	});

	it('pairs diagram strokes with an opaque plain Surface field', () => {
		const state = createDefaultEngineState();
		state.surface.type = 'plain';
		state.backgroundFill = 'pack';
		state.surface.diagram = [
			{
				type: 'timeline-segment',
				id: 'field-rule',
				from: { x: 0.1, y: 0.5 },
				to: { x: 0.9, y: 0.5 }
			}
		];
		const inputs = buildSurfaceRenderInputs(
			{
				readState: () => state,
				readAnimState: animationState,
				readPack: () => getPack('syntax'),
				readMarkColor: () => '#ff0000',
				readTextAnimationAlpha: () => null
			},
			2
		);

		assert.equal(inputs.diagram?.stroke.color, '#f7f6f2');
	});
});
