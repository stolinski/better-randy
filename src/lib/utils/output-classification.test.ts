import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import type { EngineState, Preset } from '$lib/platform/engine-schema';
import {
	isEngineStateOpaque,
	isPresetOpaque,
	isTransitionOpaque
} from './output-classification.ts';

describe('output classification', () => {
	it('classifies state, preset, and transition opacity', () => {
		const transparentState = {} as EngineState;
		const filledState = { backgroundFill: '#000000' } as EngineState;
		const stagedState = { stage: { type: 'depth' } } as EngineState;

		const preset = (state: EngineState): Preset => ({ state }) as Preset;

		assert.equal(isEngineStateOpaque(transparentState), false);
		assert.equal(isEngineStateOpaque(filledState), true);
		assert.equal(isEngineStateOpaque(stagedState), true);
		assert.equal(isPresetOpaque(preset(stagedState)), true);
		assert.equal(
			isTransitionOpaque({ from: preset(filledState), to: preset(stagedState) }),
			true,
			'a transition is opaque when both resolved Presets are opaque'
		);
		assert.equal(
			isTransitionOpaque({ from: preset(filledState), to: preset(transparentState) }),
			false,
			'a transition stays transparent when either resolved Preset is transparent'
		);
	});
});
