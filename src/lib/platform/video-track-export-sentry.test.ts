import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { createDefaultEngineState } from './engine-schema';
import {
	videoTrackExportSentryContext,
	videoTrackExportSentryTags
} from './video-track-export-sentry';

describe('Video-track export Sentry context', () => {
	it('reports bounded aggregates without creator or media identity data', () => {
		const state = createDefaultEngineState();
		state.transport.durationSeconds = 1;
		state.transport.fps = 2;
		state.media = {
			assets: [
				{
					id: 'private-asset-id',
					kind: 'video',
					name: 'Private creator title',
					assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`
				}
			],
			videoTrack: {
				clips: [
					{
						id: 'private-clip-id',
						assetId: 'private-asset-id',
						timelineStartFrame: 0,
						durationFrames: 1,
						sourceStartSeconds: 8,
						audio: { enabled: true, gain: 0.5 }
					},
					{
						id: 'private-clip-id-2',
						assetId: 'private-asset-id',
						timelineStartFrame: 1,
						durationFrames: 1,
						sourceStartSeconds: 2,
						audio: { enabled: false, gain: 1.5 }
					}
				]
			}
		};

		const context = videoTrackExportSentryContext(state);
		const tags = videoTrackExportSentryTags(context);
		const serialized = JSON.stringify({ context, tags });

		assert.deepEqual(context, {
			mediaAssetCount: 1,
			videoClipCount: 2,
			fullyCoversTransport: true,
			audibleClipCount: 1,
			minimumSourceStartSeconds: 2,
			maximumSourceStartSeconds: 8,
			minimumGain: 0.5,
			maximumGain: 1.5
		});
		assert.deepEqual(tags, {
			'export.media_assets': 1,
			'export.video_clips': 2,
			'export.video_track_full_coverage': true,
			'export.video_clip_audio': true
		});
		assert.doesNotMatch(
			serialized,
			/private-asset|private-clip|creator title|user-assets|\.mp4|a{64}|bytes|codec/i
		);
	});

	it('uses empty aggregate values when Media is unused', () => {
		const context = videoTrackExportSentryContext(createDefaultEngineState());
		assert.equal(context.videoClipCount, 0);
		assert.equal(context.fullyCoversTransport, false);
		assert.equal(context.minimumSourceStartSeconds, null);
		assert.equal(context.maximumGain, null);
	});
});
