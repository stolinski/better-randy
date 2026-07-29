import type { Media, VideoAsset, VideoClip } from '$lib/platform/engine-schema';

import { framesToSeconds, type FrameRate } from './composition-timing.ts';

export interface ResolvedActiveVideoClip {
	clip: VideoClip;
	asset: VideoAsset;
	localFrame: number;
	sourceTimeSeconds: number;
}

export interface VideoClipInterval {
	timelineStartFrame: number;
	timelineEndFrame: number;
	sourceStartSeconds: number;
	sourceEndSeconds: number;
}

/** The canonical half-open Timeline and Source intervals for one Video clip. */
export function resolveVideoClipInterval(clip: VideoClip, frameRate: FrameRate): VideoClipInterval {
	return {
		timelineStartFrame: clip.timelineStartFrame,
		timelineEndFrame: clip.timelineStartFrame + clip.durationFrames,
		sourceStartSeconds: clip.sourceStartSeconds,
		sourceEndSeconds: clip.sourceStartSeconds + framesToSeconds(clip.durationFrames, frameRate)
	};
}

/** True when the union of ordered clip intervals covers every transport frame. */
export function videoTrackCoversFrames(
	clips: readonly VideoClip[],
	compositionFrameCount: number
): boolean {
	if (!Number.isInteger(compositionFrameCount) || compositionFrameCount < 1) {
		throw new TypeError('Video coverage frame count must be a positive integer.');
	}

	let coveredUntilFrame = 0;
	for (const clip of clips) {
		if (clip.timelineStartFrame > coveredUntilFrame) return false;
		coveredUntilFrame = Math.max(coveredUntilFrame, clip.timelineStartFrame + clip.durationFrames);
		if (coveredUntilFrame >= compositionFrameCount) return true;
	}
	return false;
}

/** Resolve one canonical Video track frame. Clip intervals are half-open, so a
 * touching cut selects the following clip and a true gap resolves to null. */
export function resolveActiveVideoClipAtFrame(
	media: Media,
	frame: number,
	frameRate: FrameRate
): ResolvedActiveVideoClip | null {
	if (!Number.isInteger(frame) || frame < 0) {
		throw new TypeError(`Video transport frame must be a non-negative integer, got ${frame}.`);
	}

	for (const clip of media.videoTrack.clips) {
		const interval = resolveVideoClipInterval(clip, frameRate);
		if (frame < interval.timelineStartFrame) {
			break;
		}
		if (frame >= interval.timelineEndFrame) {
			continue;
		}

		const asset = media.assets.find((candidate) => candidate.id === clip.assetId);
		if (!asset) {
			throw new Error(`Active Video clip "${clip.id}" references missing asset "${clip.assetId}".`);
		}
		const localFrame = frame - interval.timelineStartFrame;
		return {
			clip,
			asset,
			localFrame,
			sourceTimeSeconds: interval.sourceStartSeconds + framesToSeconds(localFrame, frameRate)
		};
	}

	return null;
}
