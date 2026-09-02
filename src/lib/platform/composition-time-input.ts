import {
	dropTimecodeToFrames,
	framesToSeconds,
	isDropTimecode,
	resolveFrameRate,
	secondsToFrames,
	timecodeToFrames
} from '../utils/composition-timing';

import type { FrameRate } from '../utils/composition-timing';

/** A direct user unit that avoids asking an agent to calculate storage-native time. */
export type CompositionTimeQuantity =
	{ seconds: number } | { milliseconds: number } | { frames: number };

/** A timeline position may also use the timecode an editor reads. */
export type CompositionTimePosition = number | CompositionTimeQuantity | { timecode: string };

/** A duration has no absolute timecode form. A number keeps the caller's legacy unit. */
export type CompositionTimeDuration = number | CompositionTimeQuantity;

export interface CompositionTimeGrid {
	durationSeconds: number;
	fps: number;
}

/** Whether an unknown value is a finite legacy number or one direct duration unit. */
export function isCompositionTimeDuration(value: unknown): value is CompositionTimeDuration {
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const entries = Object.entries(value);
	if (entries.length !== 1) return false;
	const [unit, amount] = entries[0];
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return false;
	if (unit === 'frames') return Number.isSafeInteger(amount);
	return unit === 'seconds' || unit === 'milliseconds';
}

function quantitySeconds(quantity: CompositionTimeQuantity, rate: FrameRate): number {
	if ('seconds' in quantity) return quantity.seconds;
	if ('milliseconds' in quantity) return quantity.milliseconds / 1000;
	return framesToSeconds(quantity.frames, rate);
}

/** Resolve a legacy fraction or a direct duration into the composition's stored fraction. */
export function resolveCompositionFractionTime(
	input: CompositionTimeDuration,
	grid: CompositionTimeGrid
): number {
	if (typeof input === 'number') return input;
	return quantitySeconds(input, resolveFrameRate(grid.fps)) / grid.durationSeconds;
}

/** Resolve an exact frame, seconds, milliseconds, or editor timecode to a frame index. */
export function resolveCompositionFrameTime(
	input: CompositionTimePosition,
	grid: CompositionTimeGrid
): number {
	if (typeof input === 'number') return input;
	const rate = resolveFrameRate(grid.fps);
	if ('timecode' in input) {
		return isDropTimecode(input.timecode)
			? dropTimecodeToFrames(input.timecode, rate)
			: timecodeToFrames(input.timecode, rate);
	}
	return secondsToFrames(quantitySeconds(input, rate), rate);
}
