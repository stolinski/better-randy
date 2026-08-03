import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { createDefaultEngineState, type Preset } from './engine-schema';
import { validatePresetSemantics } from './preset-validation';

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
