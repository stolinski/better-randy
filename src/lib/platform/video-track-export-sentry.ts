import { resolveFrameRate, secondsToFrames } from '$lib/utils/composition-timing';
import { videoTrackCoversFrames } from '$lib/utils/video-clip-resolution';

import type { EngineState } from './engine-schema';

export interface VideoTrackExportSentryContext {
	[key: string]: string | number | boolean | null;
	mediaAssetCount: number;
	videoClipCount: number;
	fullyCoversTransport: boolean;
	audibleClipCount: number;
	minimumSourceStartSeconds: number | null;
	maximumSourceStartSeconds: number | null;
	minimumGain: number | null;
	maximumGain: number | null;
}

/**
 * Privacy-safe aggregate export context. Never include Media/clip IDs, names,
 * URLs, bytes, codec/probe metadata, or creator content here.
 */
export function videoTrackExportSentryContext(
	state: Pick<EngineState, 'media' | 'transport'>
): VideoTrackExportSentryContext {
	const clips = state.media.videoTrack.clips;
	const frameRate = resolveFrameRate(state.transport.fps);
	const frameCount = Math.max(1, secondsToFrames(state.transport.durationSeconds, frameRate));
	let minimumSourceStartSeconds: number | null = null;
	let maximumSourceStartSeconds: number | null = null;
	let minimumGain: number | null = null;
	let maximumGain: number | null = null;
	let audibleClipCount = 0;
	for (const clip of clips) {
		minimumSourceStartSeconds = Math.min(
			minimumSourceStartSeconds ?? clip.sourceStartSeconds,
			clip.sourceStartSeconds
		);
		maximumSourceStartSeconds = Math.max(
			maximumSourceStartSeconds ?? clip.sourceStartSeconds,
			clip.sourceStartSeconds
		);
		minimumGain = Math.min(minimumGain ?? clip.audio.gain, clip.audio.gain);
		maximumGain = Math.max(maximumGain ?? clip.audio.gain, clip.audio.gain);
		if (clip.audio.enabled && clip.audio.gain > 0) audibleClipCount += 1;
	}

	return {
		mediaAssetCount: state.media.assets.length,
		videoClipCount: clips.length,
		fullyCoversTransport: videoTrackCoversFrames(clips, frameCount),
		audibleClipCount,
		minimumSourceStartSeconds,
		maximumSourceStartSeconds,
		minimumGain,
		maximumGain
	};
}

export function videoTrackExportSentryTags(
	context: VideoTrackExportSentryContext
): Record<string, string | number | boolean> {
	return {
		'export.media_assets': context.mediaAssetCount,
		'export.video_clips': context.videoClipCount,
		'export.video_track_full_coverage': context.fullyCoversTransport,
		'export.video_clip_audio': context.audibleClipCount > 0
	};
}
