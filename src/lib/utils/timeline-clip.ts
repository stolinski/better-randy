import { clampNumber } from './math.ts';

/**
 * Unified timeline clip geometry + 5-handle drag resolution (ADR-0034 §2a).
 *
 * A Layer's timeline row is ONE continuous bar — `enter` ramp | solid | `exit`
 * ramp — not separate enter/exit blocks. These pure helpers translate between
 * the schema's `{ start, duration }` enter/exit ramps and the bar geometry the
 * timeline renders + drags. They hold no component state so they unit-test in
 * isolation and are shared by every Layer type that maps onto the bar model.
 */

export interface RampTiming {
	/** Ramp start, composition-time fraction 0–1. */
	start: number;
	/** Ramp duration, composition-time fraction 0–1. */
	duration: number;
}

export interface UnifiedBarGeometry {
	/** Left edge of the bar, composition-time fraction. */
	barStart: number;
	/** Right edge of the bar, composition-time fraction. */
	barEnd: number;
	/** `barEnd - barStart`, floored to a visible minimum. */
	barDuration: number;
	/** Enter-ramp width as a 0–1 fraction of the bar (left ramp). */
	enterZone: number;
	/** Exit-ramp width as a 0–1 fraction of the bar (right ramp). */
	exitZone: number;
}

/** Smallest renderable bar / ramp, in composition-time fractions. */
const MIN_BAR = 0.02;
const MIN_RAMP = 0.01;

/**
 * Bar span + ramp zones for a Layer's PERCEIVED presence (ADR-0034 §2a) — when
 * it visibly appears → when it's visibly gone — not the raw schema window.
 *
 * `enterLandFrac` / `exitLandFrac` (0–1) are where each ramp's ease perceptibly
 * lands; the invisible ease tail beyond them is collapsed so every bar edge and
 * handle sits at a real motion boundary. With both at 1 (linear/unknown ease)
 * the bar equals the schema window.
 *
 * - both ramps → bar spans `enter.start` → perceived gone (`exit.start +
 *   exit.duration × exitLandFrac`).
 * - enter only → bar holds solid to the composition end (`1`); only a left ramp.
 * - exit only → bar is solid from the start (`0`); only a right ramp.
 */
export function computeUnifiedBar(
	enter?: RampTiming,
	exit?: RampTiming,
	enterLandFrac = 1,
	exitLandFrac = 1
): UnifiedBarGeometry {
	const barStart = enter ? enter.start : 0;
	const barEnd = exit ? exit.start + exit.duration * exitLandFrac : 1;
	const barDuration = Math.max(MIN_BAR, barEnd - barStart);
	const enterZone = enter ? clampNumber((enter.duration * enterLandFrac) / barDuration, 0, 1) : 0;
	const exitZone = exit ? clampNumber((exit.duration * exitLandFrac) / barDuration, 0, 1) : 0;

	return { barStart, barEnd, barDuration, enterZone, exitZone };
}

export type UnifiedDragMode = 'move' | 'trim-start' | 'enter-zone' | 'exit-zone' | 'trim-end';

export interface UnifiedDragOrigin {
	/** Enter ramp at drag start; absent for an exit-only clip. */
	enterStart?: number;
	enterDuration?: number;
	/** Exit ramp at drag start; absent for an enter-only clip. */
	exitStart?: number;
	exitDuration?: number;
	/** Where each ramp's ease lands (0–1); the handles sit at these perceived
	 *  boundaries, so a delta on a duration handle scales by `1 / landFrac` to
	 *  reach the schema duration. Default 1. */
	enterLandFrac?: number;
	exitLandFrac?: number;
}

export interface UnifiedDragResult {
	/** New enter ramp, present only when this drag changed it. */
	enter?: RampTiming;
	/** New exit ramp, present only when this drag changed it. */
	exit?: RampTiming;
}

/**
 * Resolve one of the five bar handles into new `enter` / `exit` ramps.
 *
 * `delta` is signed and expressed as a fraction of the full timeline width, so
 * each pointer-move recomputes from the immutable drag `origin` (idempotent).
 * Handles sit at PERCEIVED motion boundaries (where the ease lands), so the two
 * handles that change a ramp length divide their delta by the landing fraction
 * to recover the schema duration (which carries the invisible ease tail).
 *
 * - `trim-start` — left outer edge: moves `enter.start` (the in-point).
 * - `enter-zone` — left inner handle: moves where the enter motion lands.
 * - `move` — body: shifts `enter.start` and `exit.start` together.
 * - `exit-zone` — right inner handle: moves where the exit begins (`exit.start`).
 * - `trim-end` — right outer edge: moves where the element is fully gone.
 */
export function resolveUnifiedDrag(
	mode: UnifiedDragMode,
	delta: number,
	origin: UnifiedDragOrigin
): UnifiedDragResult {
	const hasEnter = origin.enterStart !== undefined && origin.enterDuration !== undefined;
	const hasExit = origin.exitStart !== undefined && origin.exitDuration !== undefined;

	const enterStart = origin.enterStart ?? 0;
	const enterDuration = origin.enterDuration ?? 0;
	const exitStart = origin.exitStart ?? 1;
	const exitDuration = origin.exitDuration ?? 0;
	const enterLand = origin.enterLandFrac ?? 1;
	const exitLand = origin.exitLandFrac ?? 1;

	// Perceived boundaries: where the enter motion lands, and where the exit is gone.
	const enterLanded = hasEnter ? enterStart + enterDuration * enterLand : 0;
	const perceivedGone = hasExit ? exitStart + exitDuration * exitLand : 1;
	const solidStart = enterLanded;
	const solidEnd = hasExit ? exitStart : 1;

	switch (mode) {
		case 'move': {
			const result: UnifiedDragResult = {};
			// Clamp the shift so the schema window stays in [0, 1].
			let shift = delta;
			if (hasEnter) shift = Math.max(shift, -enterStart);
			if (hasExit) shift = Math.min(shift, 1 - (exitStart + exitDuration));
			if (hasEnter) result.enter = { start: enterStart + shift, duration: enterDuration };
			if (hasExit) result.exit = { start: exitStart + shift, duration: exitDuration };
			return result;
		}

		case 'trim-start': {
			if (!hasEnter) return {};
			// Move the in-point; keep the ramp length. Keep the landing left of the solid.
			const maxStart = solidEnd - enterDuration * enterLand - MIN_BAR;
			const nextStart = clampNumber(enterStart + delta, 0, Math.max(0, maxStart));
			return { enter: { start: nextStart, duration: enterDuration } };
		}

		case 'enter-zone': {
			if (!hasEnter) return {};
			// Drag where the motion lands; recover the schema duration via the ease.
			const maxLanded = solidEnd - MIN_BAR;
			const nextLanded = clampNumber(enterLanded + delta, enterStart + MIN_RAMP, maxLanded);
			return { enter: { start: enterStart, duration: (nextLanded - enterStart) / enterLand } };
		}

		case 'exit-zone': {
			if (!hasExit) return {};
			// Move where the exit begins; keep the perceived-gone point fixed.
			const nextStart = clampNumber(
				exitStart + delta,
				Math.max(solidStart + MIN_BAR, 0),
				perceivedGone - MIN_RAMP
			);
			return { exit: { start: nextStart, duration: (perceivedGone - nextStart) / exitLand } };
		}

		case 'trim-end': {
			if (!hasExit) return {};
			// Move where the element is fully gone; the exit's begin point stays fixed.
			const nextGone = clampNumber(perceivedGone + delta, exitStart + MIN_RAMP, 1);
			return { exit: { start: exitStart, duration: (nextGone - exitStart) / exitLand } };
		}
	}
}
