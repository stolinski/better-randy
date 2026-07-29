import { framesToSeconds, type FrameRate } from '$lib/utils/composition-timing';
import {
	resolveVideoClipDrag,
	resolveVideoClipDrop,
	type VideoClipDragMode,
	type VideoClipDragOrigin,
	type VideoClipSnapOptions
} from '$lib/utils/video-clip-edit';

import type { CompositionMediaInspectionState } from './composition-media-inspection.svelte.ts';
import type { VideoAsset, VideoClip } from './engine-schema.ts';
import {
	parseMediaLibraryAssetDragTransfer,
	type MediaLibraryDragDataTransfer
} from './media-library-drag-transfer.ts';

const DEFAULT_SNAP_THRESHOLD_PIXELS = 6;

export interface VideoTimelineLaneGeometry {
	left: number;
	width: number;
}

export interface CreateVideoTimelineSnapOptions {
	clips: readonly VideoClip[];
	compositionFrameCount: number;
	playheadFrame: number;
	laneWidth: number;
	excludedClipId?: string;
	thresholdPixels?: number;
}

export interface ResolveVideoTimelineDropOptions {
	dataTransfer: Pick<MediaLibraryDragDataTransfer, 'getData'>;
	assets: readonly VideoAsset[];
	clips: readonly VideoClip[];
	readInspection: (assetUrl: string) => CompositionMediaInspectionState;
	pointerClientX: number;
	lane: VideoTimelineLaneGeometry;
	compositionFrameCount: number;
	playheadFrame: number;
	frameRate: FrameRate;
}

export type ResolveVideoTimelineDropResult =
	| { status: 'invalid-payload' }
	| { status: 'asset-not-found' }
	| { status: 'metadata-not-ready'; asset: VideoAsset }
	| { status: 'no-legal-gap'; asset: VideoAsset }
	| {
			status: 'created';
			asset: VideoAsset;
			clip: VideoClip;
			clips: VideoClip[];
			selectedClipId: string;
	  };

export interface ResolveVideoTimelinePointerEditOptions {
	clips: readonly VideoClip[];
	origin: VideoClipDragOrigin;
	mode: VideoClipDragMode;
	pointerStartX: number;
	pointerClientX: number;
	laneWidth: number;
	playheadFrame: number;
}

export interface VideoTimelinePointerEditResult {
	clip: VideoClip;
	clips: VideoClip[];
	frameDelta: number;
}

function requirePositiveWidth(width: number): number {
	if (!Number.isFinite(width) || width <= 0) {
		throw new TypeError(`Video timeline lane width must be positive and finite, got ${width}.`);
	}
	return width;
}

function clampIntegerFrame(frame: number, compositionFrameCount: number): number {
	if (!Number.isSafeInteger(compositionFrameCount) || compositionFrameCount < 1) {
		throw new TypeError('Video timeline composition frame count must be a positive safe integer.');
	}
	return Math.min(compositionFrameCount, Math.max(0, Math.round(frame)));
}

function videoTimelineSourceFrameCapacity(seconds: number, frameRate: FrameRate): number {
	if (!Number.isFinite(seconds) || seconds < 0) {
		throw new TypeError('Video timeline source duration must be non-negative and finite.');
	}
	const rawFrames = (seconds * frameRate.num) / frameRate.den;
	const floatingPointTolerance = Math.max(
		1e-9,
		Number.EPSILON * Math.max(1, Math.abs(rawFrames)) * 8
	);
	return Math.max(0, Math.floor(rawFrames + floatingPointTolerance));
}

/** Allocate a deterministic, persistence-safe clip identity without reusing an existing ID. */
export function allocateVideoTimelineClipId(assetId: string, clips: readonly VideoClip[]): string {
	if (assetId.trim().length === 0)
		throw new TypeError('Video timeline asset ID must not be empty.');
	const usedIds = new Set(clips.map((clip) => clip.id));
	const baseId = `${assetId}:clip`;
	if (!usedIds.has(baseId)) return baseId;
	let suffix = 2;
	while (usedIds.has(`${baseId}:${suffix}`)) suffix += 1;
	return `${baseId}:${suffix}`;
}

/** Capture canonical clips for an immutable gesture origin or cancellation rollback. */
export function snapshotVideoTimelineClips(clips: readonly VideoClip[]): VideoClip[] {
	return clips.map((clip) => ({ ...clip, audio: { ...clip.audio } }));
}

/** Convert one lane pointer coordinate to the nearest legal transport frame. */
export function videoTimelinePointerFrame(
	pointerClientX: number,
	lane: VideoTimelineLaneGeometry,
	compositionFrameCount: number
): number {
	if (!Number.isFinite(pointerClientX) || !Number.isFinite(lane.left)) {
		throw new TypeError('Video timeline pointer coordinates must be finite.');
	}
	const width = requirePositiveWidth(lane.width);
	return clampIntegerFrame(
		((pointerClientX - lane.left) / width) * compositionFrameCount,
		compositionFrameCount
	);
}

/** Build exact-frame timeline snap targets, excluding both edges of the actively edited clip. */
export function createVideoTimelineSnapOptions(
	options: CreateVideoTimelineSnapOptions
): VideoClipSnapOptions {
	const width = requirePositiveWidth(options.laneWidth);
	const thresholdPixels = options.thresholdPixels ?? DEFAULT_SNAP_THRESHOLD_PIXELS;
	if (!Number.isFinite(thresholdPixels) || thresholdPixels < 0) {
		throw new TypeError('Video timeline snap threshold pixels must be non-negative and finite.');
	}
	const targets = new Set<number>([
		0,
		options.compositionFrameCount,
		clampIntegerFrame(options.playheadFrame, options.compositionFrameCount)
	]);
	for (const clip of options.clips) {
		if (clip.id === options.excludedClipId) continue;
		targets.add(clampIntegerFrame(clip.timelineStartFrame, options.compositionFrameCount));
		targets.add(
			clampIntegerFrame(
				clip.timelineStartFrame + clip.durationFrames,
				options.compositionFrameCount
			)
		);
	}
	return {
		targetFrames: [...targets].sort((left, right) => left - right),
		thresholdFrames: Math.max(
			0,
			Math.round((thresholdPixels / width) * options.compositionFrameCount)
		)
	};
}

/** Resolve a native Media payload into one canonical, ordered Video-track insertion. */
export function resolveVideoTimelineDrop(
	options: ResolveVideoTimelineDropOptions
): ResolveVideoTimelineDropResult {
	const payload = parseMediaLibraryAssetDragTransfer(options.dataTransfer);
	if (!payload) return { status: 'invalid-payload' };
	const asset = options.assets.find((candidate) => candidate.id === payload.assetId);
	if (!asset) return { status: 'asset-not-found' };
	const inspection = options.readInspection(asset.assetUrl);
	if (inspection.status !== 'ready') return { status: 'metadata-not-ready', asset };

	const timelineStartFrame = videoTimelinePointerFrame(
		options.pointerClientX,
		options.lane,
		options.compositionFrameCount
	);
	const isOccupied = options.clips.some(
		(clip) =>
			timelineStartFrame >= clip.timelineStartFrame &&
			timelineStartFrame < clip.timelineStartFrame + clip.durationFrames
	);
	if (timelineStartFrame === options.compositionFrameCount || isOccupied) {
		return { status: 'no-legal-gap', asset };
	}
	let nextClipStartFrame = options.compositionFrameCount;
	for (const clip of options.clips) {
		if (
			clip.timelineStartFrame > timelineStartFrame &&
			clip.timelineStartFrame < nextClipStartFrame
		) {
			nextClipStartFrame = clip.timelineStartFrame;
		}
	}
	const durationFrames = Math.min(
		videoTimelineSourceFrameCapacity(inspection.metadata.durationSeconds, options.frameRate),
		options.compositionFrameCount - timelineStartFrame,
		nextClipStartFrame - timelineStartFrame
	);
	if (durationFrames < 1) return { status: 'no-legal-gap', asset };
	const id = allocateVideoTimelineClipId(asset.id, options.clips);
	const clips = resolveVideoClipDrop({
		clips: options.clips,
		clip: {
			id,
			assetId: asset.id,
			timelineStartFrame,
			durationFrames,
			sourceStartSeconds: 0,
			audio: { enabled: true, gain: 1 }
		},
		compositionFrameCount: options.compositionFrameCount,
		sourceDurationSeconds: inspection.metadata.durationSeconds,
		frameRate: options.frameRate,
		snap: createVideoTimelineSnapOptions({
			clips: options.clips,
			compositionFrameCount: options.compositionFrameCount,
			playheadFrame: options.playheadFrame,
			laneWidth: options.lane.width
		})
	});
	if (!clips) return { status: 'no-legal-gap', asset };
	const clip = clips.find((candidate) => candidate.id === id);
	if (!clip) throw new Error(`Created Video timeline clip "${id}" was not inserted.`);
	return { status: 'created', asset, clip, clips, selectedClipId: id };
}

/** Route one pointer displacement through immutable-origin frame math and array replacement. */
export function resolveVideoTimelinePointerEdit(
	options: ResolveVideoTimelinePointerEditOptions
): VideoTimelinePointerEditResult {
	const width = requirePositiveWidth(options.laneWidth);
	if (!Number.isFinite(options.pointerStartX) || !Number.isFinite(options.pointerClientX)) {
		throw new TypeError('Video timeline pointer coordinates must be finite.');
	}
	const frameDelta = Math.round(
		((options.pointerClientX - options.pointerStartX) / width) *
			options.origin.compositionFrameCount
	);
	const snap = createVideoTimelineSnapOptions({
		clips: options.clips,
		compositionFrameCount: options.origin.compositionFrameCount,
		playheadFrame: options.playheadFrame,
		laneWidth: width,
		excludedClipId: options.origin.clip.id
	});
	const clip = resolveVideoClipDrag(options.origin, options.mode, frameDelta, snap);
	const clips = options.clips.map((candidate) =>
		candidate.id === clip.id ? { ...clip, audio: { ...clip.audio } } : candidate
	);
	if (!clips.some((candidate) => candidate.id === clip.id)) {
		throw new Error(`Edited Video timeline clip "${clip.id}" does not exist.`);
	}
	return { clip, clips, frameDelta };
}

/** Format live slip feedback in the timeline's mono data voice. */
export function formatVideoTimelineSourceRange(clip: VideoClip, frameRate: FrameRate): string {
	const sourceEndSeconds =
		clip.sourceStartSeconds + framesToSeconds(clip.durationFrames, frameRate);
	return `Source ${clip.sourceStartSeconds.toFixed(2)}–${sourceEndSeconds.toFixed(2)}s`;
}
