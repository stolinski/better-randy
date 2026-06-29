import type { CursorPath } from './index';

// The cursor's motion profile is a sequence of authored phases, NOT uniform
// spacing across the clip. Each waypoint contributes a GLIDE into it (travelMs —
// skipped for the first waypoint, which is where the cursor starts) followed by a
// HOLD on it (dwellMs). Both are composition data (timeline clips), so dwellMs
// actually drives the clock — a 600ms hover reads as a proportionally longer
// pause than a 200ms one, instead of every waypoint getting an equal slice.
//
// All ms sums are normalized by the schedule's totalMs, so the profile maps onto
// the overlay clip's 0..1 progress regardless of absolute durations.

export interface CursorPhase {
	readonly kind: 'glide' | 'dwell';
	readonly fromIndex: number; // glide: source waypoint; dwell: the waypoint itself
	readonly toIndex: number; // glide: destination waypoint; dwell: the waypoint itself
	readonly startFraction: number; // normalized clip start (0..1)
	readonly endFraction: number; // normalized clip end (0..1)
}

export interface CursorDwellClip {
	readonly index: number; // which waypoint this hold belongs to
	readonly targetSlot: string;
	readonly arrivalFraction: number; // when the cursor reaches the waypoint (dwell start)
	readonly durationFraction: number; // how long it holds, as a clip fraction
	readonly glideStartMs: number; // ms at which the glide INTO this waypoint begins
	readonly hasGlide: boolean; // false for the first waypoint (no incoming glide)
}

export interface CursorSchedule {
	readonly totalMs: number;
	readonly phases: readonly CursorPhase[];
	readonly dwells: readonly CursorDwellClip[];
}

const DEFAULT_DWELL_MS = 400;
const DEFAULT_TRAVEL_MS = 700;

function dwellMsOf(step: CursorPath): number {
	return Number.isFinite(step.dwellMs) && step.dwellMs >= 0 ? step.dwellMs : DEFAULT_DWELL_MS;
}

function travelMsOf(step: CursorPath): number {
	const value = step.travelMs;
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: DEFAULT_TRAVEL_MS;
}

export function buildCursorSchedule(path: readonly CursorPath[]): CursorSchedule {
	const phases: CursorPhase[] = [];
	const dwellsMs: Array<{
		index: number;
		targetSlot: string;
		glideStartMs: number;
		arrivalMs: number;
		dwellMs: number;
		hasGlide: boolean;
	}> = [];

	let cursorMs = 0;
	for (let i = 0; i < path.length; i += 1) {
		const hasGlide = i > 0;
		const glideStartMs = cursorMs;
		if (hasGlide) {
			const travel = travelMsOf(path[i]);
			phases.push({
				kind: 'glide',
				fromIndex: i - 1,
				toIndex: i,
				startFraction: cursorMs,
				endFraction: cursorMs + travel
			});
			cursorMs += travel;
		}
		const arrivalMs = cursorMs;
		const hold = dwellMsOf(path[i]);
		phases.push({
			kind: 'dwell',
			fromIndex: i,
			toIndex: i,
			startFraction: cursorMs,
			endFraction: cursorMs + hold
		});
		cursorMs += hold;
		dwellsMs.push({ index: i, targetSlot: path[i].targetSlot, glideStartMs, arrivalMs, dwellMs: hold, hasGlide });
	}

	// Guard a zero-length schedule (all dwell/travel 0) so normalization never
	// divides by zero — collapse everything onto t=0.
	const totalMs = cursorMs > 0 ? cursorMs : 1;

	return {
		totalMs,
		phases: phases.map((phase) => ({
			...phase,
			startFraction: phase.startFraction / totalMs,
			endFraction: phase.endFraction / totalMs
		})),
		dwells: dwellsMs.map((dwell) => ({
			index: dwell.index,
			targetSlot: dwell.targetSlot,
			arrivalFraction: dwell.arrivalMs / totalMs,
			durationFraction: dwell.dwellMs / totalMs,
			glideStartMs: dwell.glideStartMs,
			hasGlide: dwell.hasGlide
		}))
	};
}

export interface CursorAt {
	readonly fromIndex: number;
	readonly toIndex: number;
	readonly localT: number; // 0..1 within the active phase
	readonly moving: boolean; // true only during a glide phase
}

// Resolve the cursor's from/to waypoints and intra-phase position for a clip
// progress, walking the normalized phase schedule. During a dwell, from === to
// (the cursor is parked, so velocity and trail collapse to zero naturally).
export function cursorAt(schedule: CursorSchedule, progress: number): CursorAt {
	const t = Math.max(0, Math.min(1, progress));
	const phases = schedule.phases;
	if (phases.length === 0) {
		return { fromIndex: 0, toIndex: 0, localT: 0, moving: false };
	}
	for (let i = 0; i < phases.length; i += 1) {
		const phase = phases[i];
		const isLast = i === phases.length - 1;
		if (t <= phase.endFraction || isLast) {
			const span = phase.endFraction - phase.startFraction;
			const localT = span > 0 ? Math.max(0, Math.min(1, (t - phase.startFraction) / span)) : 1;
			return {
				fromIndex: phase.fromIndex,
				toIndex: phase.toIndex,
				localT,
				moving: phase.kind === 'glide'
			};
		}
	}
	const last = phases[phases.length - 1];
	return { fromIndex: last.fromIndex, toIndex: last.toIndex, localT: 1, moving: false };
}
