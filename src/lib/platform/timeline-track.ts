/**
 * Timeline data model (ADR-0034 §2/§2a). One row per Layer; each row is a single
 * unified clip bar — `enter` ramp | solid | `exit` ramp — or a simple window clip
 * (stagger, roll, dwell …). Shared by the timeline-outline view and the
 * `buildTracks()` adapter that maps composition state onto it.
 */

export type TimelineTransitionRamp = 'in' | 'out';

/**
 * A Layer that maps onto the unified clip bar (ADR-0034 §2a). Carries the raw
 * schema scalars (used as drag origin + zone geometry) and the writers that
 * persist a dragged ramp back to the composition.
 */
export interface UnifiedClip {
	/** Enter ramp, composition-time fractions; absent for an exit-only clip. */
	enterStart?: number;
	enterDuration?: number;
	/** Exit ramp; absent for an enter-only clip. */
	exitStart?: number;
	exitDuration?: number;
	/** Where each ramp's ease lands (0–1) — handles sit at these perceived
	 *  boundaries, so the drag scales a duration delta by `1 / landFrac`. */
	enterLandFrac?: number;
	exitLandFrac?: number;
	/** Persist a dragged enter ramp back to the schema. */
	setEnter?: (start: number, duration: number) => void;
	/** Persist a dragged exit ramp back to the schema. */
	setExit?: (start: number, duration: number) => void;
}

export interface TimelineTransition {
	id: string;
	label?: string;
	start: number;
	duration: number;
	color?: string;
	ramp?: TimelineTransitionRamp;
	minStart?: number;
	maxStart?: number;
	minDuration?: number;
	maxDuration?: number;
	/** Simple single-clip drag (window clips: stagger, roll, dwell …). */
	onUpdate?: (next: { start: number; duration: number }) => void;
	/** Enter-ramp width as a 0–1 fraction of the bar (unified bars only). */
	enterZone?: number;
	/** Exit-ramp width as a 0–1 fraction of the bar (unified bars only). */
	exitZone?: number;
	/**
	 * Fraction of the enter ramp at which its ease perceptibly lands (ADR-0034
	 * §2a) — the ramp fill is drawn solid by `enterZone * enterLandFrac`, not the
	 * full `enterZone`, so a front-loaded ease doesn't over-state the motion.
	 * Defaults to 1 (ramp = duration) when the layer's ease is unknown.
	 */
	enterLandFrac?: number;
	/** As {@link enterLandFrac}, for the exit ramp. */
	exitLandFrac?: number;
	/** Present when the row is a unified clip bar; drives the 5-handle drag. */
	unified?: UnifiedClip;
}

export interface TimelineTrack {
	id: string;
	label: string;
	color?: string;
	transitions: TimelineTransition[];
	onTrackMove?: (delta: number) => void;
}
