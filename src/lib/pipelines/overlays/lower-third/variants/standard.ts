import type { LowerThirdVariant } from './types';
import StandardCanvasSource from './StandardCanvasSource.svelte';

/**
 * Standard lower-third variant — the family\'s default. Flat dark plate with
 * yellow mono kicker; no light treatment. Per ADR-0020 the default variant
 * is the most restrained of the set; cinematic ships as the explicit
 * Producer pick when broadcast chrome is wanted.
 */
export const standardLowerThird: LowerThirdVariant = {
	id: 'standard',
	label: 'Standard',
	defaults: {
		paperColor: '#0a0a0a',
		inkColor: '#ededed',
		offsetY: 0.15
	},
	motionShape: (slotIndex, progress) => {
		// Per-slot staggered alpha ramp: kicker leads, title follows, subtitle
		// lands last. Each slot uses a head-loaded smoothstep so the enter is
		// crisp without an overshoot.
		const slotLag = slotIndex * 0.08;
		const local = Math.max(0, Math.min(1, (progress - slotLag) / (1 - slotLag)));
		return local * local * (3 - 2 * local);
	},
	CanvasSource: StandardCanvasSource
};
