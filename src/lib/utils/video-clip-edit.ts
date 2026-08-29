import type { VideoClip } from '$lib/platform/engine-schema';

import { framesToSeconds, type FrameRate } from './composition-timing.ts';

type ImmutableVideoClip = Readonly<Omit<VideoClip, 'audio'>> & {
	readonly audio: Readonly<VideoClip['audio']>;
};

export interface VideoClipSnapOptions {
	targetFrames: readonly number[];
	thresholdFrames: number;
}

export interface VideoClipDragOrigin {
	readonly clip: ImmutableVideoClip;
	readonly compositionFrameCount: number;
	readonly sourceDurationSeconds: number;
	readonly previousClipEndFrame: number;
	readonly nextClipStartFrame: number;
	readonly frameRate: FrameRate;
}

export type VideoClipDragMode = 'move' | 'trim-left' | 'trim-right' | 'slip';

export interface CreateVideoClipDragOriginOptions {
	clips: readonly VideoClip[];
	clipId: string;
	compositionFrameCount: number;
	sourceDurationSeconds: number;
	frameRate: FrameRate;
}

export interface ResolveVideoClipDropOptions {
	clips: readonly VideoClip[];
	clip: VideoClip;
	compositionFrameCount: number;
	sourceDurationSeconds: number;
	frameRate: FrameRate;
	snap?: VideoClipSnapOptions;
}

function requireFrame(value: number, name: string, minimum = 0): number {
	if (!Number.isSafeInteger(value) || value < minimum) {
		throw new TypeError(`Video clip edit: ${name} must be a safe integer of at least ${minimum}, got ${value}.`);
	}
	return value;
}

function requireFiniteSeconds(value: number, name: string): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new TypeError(`Video clip edit: ${name} must be a non-negative finite number, got ${value}.`);
	}
	return value;
}

function normalizeFrameDelta(value: number): number {
	if (!Number.isFinite(value)) {
		throw new TypeError(`Video clip frame delta must be finite, got ${value}.`);
	}
	return Math.round(value);
}

function clampFrame(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function cloneVideoClip(clip: ImmutableVideoClip): VideoClip {
	return { ...clip, audio: { ...clip.audio } };
}

/**
 * Whole frames of source `seconds` can supply at `rate` — the ceiling every
 * clip edit and every clip insertion is bounded by, so a cut, a trim, and an
 * agent's prospective duration all agree on where a source ends.
 */
export function videoClipSourceFrameCapacity(seconds: number, rate: FrameRate): number {
	if (seconds <= 0) return 0;
	const rawFrames = (seconds * rate.num) / rate.den;
	// Probe durations are floating seconds. Admit an integer frame boundary that
	// round-trip arithmetic undershoots microscopically, never a fractional frame.
	const floatingPointTolerance = Math.max(
		1e-9,
		Number.EPSILON * Math.max(1, Math.abs(rawFrames)) * 8
	);
	return Math.max(0, Math.floor(rawFrames + floatingPointTolerance));
}

function validateSnapOptions(options: VideoClipSnapOptions | undefined): void {
	if (!options) return;
	requireFrame(options.thresholdFrames, 'Video clip snap threshold');
	for (const target of options.targetFrames) {
		requireFrame(target, 'Video clip snap target');
	}
}

function chooseNearestFrame(proposed: number, candidates: readonly number[]): number | null {
	let best: number | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const candidate of candidates) {
		const distance = Math.abs(candidate - proposed);
		if (
			distance < bestDistance ||
			(distance === bestDistance && (best === null || candidate < best))
		) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

/** Snap one integer transport frame, resolving equal-distance targets to the earlier frame. */
export function snapVideoClipFrame(
	proposedFrame: number,
	minimumFrame: number,
	maximumFrame: number,
	options?: VideoClipSnapOptions
): number {
	const proposed = normalizeFrameDelta(proposedFrame);
	requireFrame(minimumFrame, 'Video clip snap minimum');
	requireFrame(maximumFrame, 'Video clip snap maximum');
	if (maximumFrame < minimumFrame) {
		throw new RangeError('Video clip snap maximum must not precede its minimum.');
	}
	validateSnapOptions(options);
	if (options) {
		const candidates = options.targetFrames.filter(
			(target) =>
				target >= minimumFrame &&
				target <= maximumFrame &&
				Math.abs(target - proposed) <= options.thresholdFrames
		);
		const snapped = chooseNearestFrame(proposed, candidates);
		if (snapped !== null) return snapped;
	}
	return clampFrame(proposed, minimumFrame, maximumFrame);
}

function snapIntervalStart(
	proposedStartFrame: number,
	durationFrames: number,
	minimumStartFrame: number,
	maximumStartFrame: number,
	options?: VideoClipSnapOptions
): number {
	validateSnapOptions(options);
	if (!options) return clampFrame(proposedStartFrame, minimumStartFrame, maximumStartFrame);
	const candidates = new Set<number>();
	for (const target of options.targetFrames) {
		for (const candidate of [target, target - durationFrames]) {
			if (
				candidate >= minimumStartFrame &&
				candidate <= maximumStartFrame &&
				Math.abs(candidate - proposedStartFrame) <= options.thresholdFrames
			) {
				candidates.add(candidate);
			}
		}
	}
	const snapped = chooseNearestFrame(proposedStartFrame, [...candidates]);
	return snapped ?? clampFrame(proposedStartFrame, minimumStartFrame, maximumStartFrame);
}

function validateClipLayout(clips: readonly VideoClip[], compositionFrameCount: number): void {
	const ids = new Set<string>();
	let previousEnd = 0;
	for (const clip of clips) {
		if (clip.id.length === 0 || ids.has(clip.id)) {
			throw new TypeError(`Video clip IDs must be non-empty and unique; received "${clip.id}".`);
		}
		ids.add(clip.id);
		requireFrame(clip.timelineStartFrame, `Video clip "${clip.id}" start`);
		requireFrame(clip.durationFrames, `Video clip "${clip.id}" duration`, 1);
		const end = clip.timelineStartFrame + clip.durationFrames;
		if (!Number.isSafeInteger(end) || end > compositionFrameCount) {
			throw new RangeError(`Video clip "${clip.id}" must remain inside the composition.`);
		}
		if (clip.timelineStartFrame < previousEnd) {
			throw new RangeError('Video clips must be ordered and non-overlapping.');
		}
		previousEnd = end;
	}
}

export function createVideoClipDragOrigin(
	options: CreateVideoClipDragOriginOptions
): VideoClipDragOrigin {
	requireFrame(options.compositionFrameCount, 'Composition frame count', 1);
	requireFiniteSeconds(options.sourceDurationSeconds, 'Video source duration');
	validateClipLayout(options.clips, options.compositionFrameCount);
	const index = options.clips.findIndex((clip) => clip.id === options.clipId);
	if (index < 0) throw new Error(`Video clip "${options.clipId}" does not exist.`);
	const clip = options.clips[index];
	requireFiniteSeconds(clip.sourceStartSeconds, `Video clip "${clip.id}" source start`);
	const availableSourceFrames = videoClipSourceFrameCapacity(
		options.sourceDurationSeconds - clip.sourceStartSeconds,
		options.frameRate
	);
	if (clip.durationFrames > availableSourceFrames) {
		throw new RangeError(`Video clip "${clip.id}" exceeds its source duration.`);
	}
	return {
		clip: { ...clip, audio: { ...clip.audio } },
		compositionFrameCount: options.compositionFrameCount,
		sourceDurationSeconds: options.sourceDurationSeconds,
		previousClipEndFrame:
			index === 0
				? 0
				: options.clips[index - 1].timelineStartFrame + options.clips[index - 1].durationFrames,
		nextClipStartFrame:
			index === options.clips.length - 1
				? options.compositionFrameCount
				: options.clips[index + 1].timelineStartFrame,
		frameRate: options.frameRate
	};
}

/** Resolve every pointer update from one immutable drag-start snapshot. */
export function resolveVideoClipDrag(
	origin: VideoClipDragOrigin,
	mode: VideoClipDragMode,
	frameDelta: number,
	snap?: VideoClipSnapOptions
): VideoClip {
	const delta = normalizeFrameDelta(frameDelta);
	const clip = cloneVideoClip(origin.clip);
	const clipEnd = clip.timelineStartFrame + clip.durationFrames;

	switch (mode) {
		case 'move': {
			const maximumStart =
				Math.min(origin.compositionFrameCount, origin.nextClipStartFrame) - clip.durationFrames;
			clip.timelineStartFrame = snapIntervalStart(
				origin.clip.timelineStartFrame + delta,
				clip.durationFrames,
				origin.previousClipEndFrame,
				maximumStart,
				snap
			);
			return clip;
		}
		case 'trim-left': {
			const sourceFramesBeforeStart = videoClipSourceFrameCapacity(
				origin.clip.sourceStartSeconds,
				origin.frameRate
			);
			const minimumStart = Math.max(
				origin.previousClipEndFrame,
				origin.clip.timelineStartFrame - sourceFramesBeforeStart
			);
			const start = snapVideoClipFrame(
				origin.clip.timelineStartFrame + delta,
				minimumStart,
				clipEnd - 1,
				snap
			);
			const appliedDelta = start - origin.clip.timelineStartFrame;
			clip.timelineStartFrame = start;
			clip.durationFrames = clipEnd - start;
			clip.sourceStartSeconds =
				origin.clip.sourceStartSeconds + framesToSeconds(appliedDelta, origin.frameRate);
			return clip;
		}
		case 'trim-right': {
			const sourceFrameCapacity = videoClipSourceFrameCapacity(
				origin.sourceDurationSeconds - origin.clip.sourceStartSeconds,
				origin.frameRate
			);
			const maximumEnd = Math.min(
				origin.compositionFrameCount,
				origin.nextClipStartFrame,
				origin.clip.timelineStartFrame + sourceFrameCapacity
			);
			const end = snapVideoClipFrame(
				clipEnd + delta,
				origin.clip.timelineStartFrame + 1,
				maximumEnd,
				snap
			);
			clip.durationFrames = end - origin.clip.timelineStartFrame;
			return clip;
		}
		case 'slip': {
			const sourceFramesBeforeStart = videoClipSourceFrameCapacity(
				origin.clip.sourceStartSeconds,
				origin.frameRate
			);
			const sourceFrameCapacity = videoClipSourceFrameCapacity(
				origin.sourceDurationSeconds -
					origin.clip.sourceStartSeconds,
				origin.frameRate
			);
			const sourceFramesAfterEnd = sourceFrameCapacity - origin.clip.durationFrames;
			const appliedDelta = clampFrame(delta, -sourceFramesBeforeStart, sourceFramesAfterEnd);
			clip.sourceStartSeconds =
				origin.clip.sourceStartSeconds + framesToSeconds(appliedDelta, origin.frameRate);
			return clip;
		}
	}
}

interface VideoClipGap {
	minimumStartFrame: number;
	maximumStartFrame: number;
}

function videoClipGaps(
	clips: readonly VideoClip[],
	compositionFrameCount: number,
	durationFrames: number
): VideoClipGap[] {
	const gaps: VideoClipGap[] = [];
	let gapStart = 0;
	for (const clip of clips) {
		const maximumStartFrame = clip.timelineStartFrame - durationFrames;
		if (maximumStartFrame >= gapStart)
			gaps.push({ minimumStartFrame: gapStart, maximumStartFrame });
		gapStart = clip.timelineStartFrame + clip.durationFrames;
	}
	const maximumStartFrame = compositionFrameCount - durationFrames;
	if (maximumStartFrame >= gapStart) gaps.push({ minimumStartFrame: gapStart, maximumStartFrame });
	return gaps;
}

/** Insert one clip into the nearest legal half-open gap without moving existing clips. */
export function resolveVideoClipDrop(options: ResolveVideoClipDropOptions): VideoClip[] | null {
	requireFrame(options.compositionFrameCount, 'Composition frame count', 1);
	requireFiniteSeconds(options.sourceDurationSeconds, 'Video source duration');
	validateClipLayout(options.clips, options.compositionFrameCount);
	if (options.clip.id.length === 0 || options.clips.some((clip) => clip.id === options.clip.id)) {
		throw new TypeError(`Dropped Video clip ID "${options.clip.id}" must be non-empty and unique.`);
	}
	requireFrame(options.clip.durationFrames, 'Dropped Video clip duration', 1);
	requireFiniteSeconds(options.clip.sourceStartSeconds, 'Dropped Video clip source start');
	const sourceCapacity = videoClipSourceFrameCapacity(
		options.sourceDurationSeconds - options.clip.sourceStartSeconds,
		options.frameRate
	);
	const durationFrames = Math.min(
		options.clip.durationFrames,
		options.compositionFrameCount,
		sourceCapacity
	);
	if (durationFrames < 1) return null;
	const proposedStart = normalizeFrameDelta(options.clip.timelineStartFrame);
	const gaps = videoClipGaps(options.clips, options.compositionFrameCount, durationFrames);
	if (gaps.length === 0) return null;
	validateSnapOptions(options.snap);

	const legalStarts = gaps.map((gap) =>
		snapIntervalStart(
			proposedStart,
			durationFrames,
			gap.minimumStartFrame,
			gap.maximumStartFrame,
			options.snap
		)
	);
	const timelineStartFrame = chooseNearestFrame(proposedStart, legalStarts);
	if (timelineStartFrame === null) return null;
	const dropped: VideoClip = {
		...options.clip,
		timelineStartFrame,
		durationFrames,
		audio: { ...options.clip.audio }
	};
	const insertionIndex = options.clips.findIndex(
		(clip) => clip.timelineStartFrame > timelineStartFrame
	);
	return insertionIndex < 0
		? [...options.clips, dropped]
		: [
				...options.clips.slice(0, insertionIndex),
				dropped,
				...options.clips.slice(insertionIndex)
			];
}
