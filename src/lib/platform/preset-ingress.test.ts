import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import {
	LEGACY_SOURCE_VIDEO_ASSET_ID,
	LEGACY_SOURCE_VIDEO_CLIP_ID,
	PresetIngressSchema
} from './preset-ingress';

const LEGACY_ASSET_URL = `/api/user-assets/${'a'.repeat(64)}.mp4`;

function legacyPreset(): unknown {
	return {
		...blankPresetJson,
		state: {
			...blankPresetJson.state,
			transport: {
				...blankPresetJson.state.transport,
				durationSeconds: 10.01,
				fps: 29.97
			},
			sourceVideo: {
				assetUrl: LEGACY_ASSET_URL,
				sourceOffsetSeconds: 18.25,
				includeAudio: false,
				volume: 0.8
			}
		}
	};
}

describe('Preset ingress migration', () => {
	it('normalizes legacy Source video into one deterministic full-span Video clip', () => {
		const first = PresetIngressSchema.parse(legacyPreset());
		const second = PresetIngressSchema.parse(legacyPreset());

		assert.equal('sourceVideo' in first.state, false);
		assert.deepEqual(first.state.media, {
			assets: [
				{
					id: LEGACY_SOURCE_VIDEO_ASSET_ID,
					kind: 'video',
					name: 'Source video',
					assetUrl: LEGACY_ASSET_URL
				}
			],
			videoTrack: {
				clips: [
					{
						id: LEGACY_SOURCE_VIDEO_CLIP_ID,
						assetId: LEGACY_SOURCE_VIDEO_ASSET_ID,
						timelineStartFrame: 0,
						durationFrames: 300,
						sourceStartSeconds: 18.25,
						audio: { enabled: false, gain: 0.8 }
					}
				]
			}
		});
		assert.deepEqual(second.state.media, first.state.media);
	});

	it('materializes legacy audio defaults without persisting probe metadata', () => {
		const input = legacyPreset() as { state: Record<string, unknown> };
		input.state.sourceVideo = { assetUrl: LEGACY_ASSET_URL };

		const preset = PresetIngressSchema.parse(input);

		assert.deepEqual(preset.state.media.videoTrack.clips[0].audio, {
			enabled: true,
			gain: 1
		});
		assert.deepEqual(Object.keys(preset.state.media.assets[0]).sort(), [
			'assetUrl',
			'id',
			'kind',
			'name'
		]);
	});

	it('rejects input containing both legacy sourceVideo and canonical media', () => {
		const input = legacyPreset() as { state: Record<string, unknown> };
		input.state.media = { assets: [], videoTrack: { clips: [] } };

		const result = PresetIngressSchema.safeParse(input);

		assert.equal(result.success, false);
		if (result.success) return;
		assert.equal(result.error.issues[0]?.path.join('.'), 'state');
		assert.match(result.error.issues[0]?.message ?? '', /both legacy sourceVideo and canonical media/);
	});

	it('rejects invalid legacy input instead of silently stripping it', () => {
		const input = legacyPreset() as { state: Record<string, unknown> };
		input.state.sourceVideo = { assetUrl: '/tmp/source.mp4' };

		const result = PresetIngressSchema.safeParse(input);

		assert.equal(result.success, false);
		if (result.success) return;
		assert.equal(result.error.issues[0]?.path.join('.'), 'state.sourceVideo.assetUrl');
		assert.match(result.error.issues[0]?.message ?? '', /content-addressed/);
	});
});
