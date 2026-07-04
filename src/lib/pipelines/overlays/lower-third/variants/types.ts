/**
 * Lower-third variant type — per ADR-0020 (variants-as-data). The lower-
 * third family hosts multiple chip / plate shapes that share an Identity
 * Spec, a content slot vocabulary (kicker / title / subtitle), an enter +
 * exit timing model, and a frame-anchor relationship. Each variant carries
 * its own visual rendering (a Svelte CanvasSource subcomponent) plus a pure
 * motion-shape function and the defaults the family uses when this variant
 * is selected.
 */

import type { Component } from 'svelte';

import type { OverlayCanvasSourceProps } from '$lib/platform/pipelines/types';

import type { LowerThirdContent } from '../index';

export interface LowerThirdMotionState {
	/** Multiplier applied to the kicker\'s enter alpha within the family\'s enter window. */
	kickerAlpha: number;
	/** Multiplier applied to the title\'s enter alpha. */
	titleAlpha: number;
	/** Multiplier applied to the subtitle\'s enter alpha. */
	subtitleAlpha: number;
}

export interface LowerThirdVariant {
	id: string;
	label: string;
	/**
	 * Variant-intrinsic layout defaults. Appearance (plate, scrim, ink,
	 * accent) is NOT declared here — it resolves through the active Pack's
	 * `lower-third.*` Roles (ADR-0024); baked colours would bypass the Role
	 * system and make one Pack a de facto base.
	 */
	defaults: {
		offsetY: number;
	};
	/**
	 * Pure deterministic motion-shape function. Receives slot index (0 =
	 * kicker, 1 = title, 2 = subtitle) and the global progress; returns
	 * per-slot enter alpha contributions. Pure per ADR-0020: no reads of
	 * `engineState`, no DOM access, no wall-clock.
	 */
	motionShape: (slotIndex: number, progress: number) => number;
	CanvasSource: Component<OverlayCanvasSourceProps<LowerThirdContent>>;
}
