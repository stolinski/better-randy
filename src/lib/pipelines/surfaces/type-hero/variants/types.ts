/**
 * Type-hero variant type — per ADR-0020. The type-hero family hosts shapes
 * that share an Identity Spec, the raked-light shader pass, and a flush-
 * left frame relationship. Variants differ in slot composition: `single`
 * carries one display word; `pair` adds a counterpoint slot at a
 * deterministic scale ratio + anchor relationship per the mo1-style
 * compositional pull named in the motion-primitives plan.
 */

import type { Component } from 'svelte';

export type CounterpointAnchor = 'inside-primary' | 'shoulder' | 'baseline-trailing';

export interface TypeHeroVariant {
	id: string;
	label: string;
	defaults: {
		/** Counterpoint cap-height as a fraction of the primary cap-height. */
		scaleRatio: number;
		/** Where the counterpoint sits relative to the primary letterform. */
		counterpointAnchor: CounterpointAnchor;
	};
	CanvasSource: Component<{ element?: HTMLElement | null }>;
}
