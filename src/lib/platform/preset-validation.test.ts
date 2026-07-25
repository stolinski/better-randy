import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { createDefaultEngineState, type Preset } from './engine-schema';
import { validatePresetSemantics } from './preset-validation';

function sourceVideoPreset(name: string): Preset {
	const state = createDefaultEngineState();
	state.sourceVideo = {
		assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`,
		sourceOffsetSeconds: 0,
		includeAudio: true,
		volume: 1
	};
	return { schema: 'supers@1', name, pack: 'syntax', kind: 'fixture', state };
}

describe('Source video semantic validation', () => {
	it('rejects Source video on a transition Preset', () => {
		const preset = sourceVideoPreset('Transition');
		preset.transition = { from: 'from', to: 'to', effect: 'mask-wipe', durationMs: 600 };

		const issues = validatePresetSemantics(preset);

		assert.ok(
			issues.some(
				(issue) =>
					issue.path.join('.') === 'state.sourceVideo' &&
					issue.message.includes('transition Presets')
			)
		);
	});

	it('rejects Source video transition endpoints when references resolve', () => {
		const state = createDefaultEngineState();
		const transition: Preset = {
			schema: 'supers@1',
			name: 'Transition',
			pack: 'syntax',
			kind: 'fixture',
			state,
			transition: { from: 'video', to: 'plain', effect: 'mask-wipe', durationMs: 600 }
		};
		const video = sourceVideoPreset('Video');
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
});
