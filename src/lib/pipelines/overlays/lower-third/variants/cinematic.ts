import type { LowerThirdVariant } from './types';
import CinematicCanvasSource from './CinematicCanvasSource.svelte';

/**
 * Cinematic lower-third variant — broadcast-grade plate with a thin orange
 * accent rule, a horizontal-gradient dark scrim, and the family-level
 * shaderPass\'s anamorphic flare gated to this variant. Per ADR-0019 the
 * light-treatment dimension on the family\'s Identity Spec resolves through
 * the active Pack\'s `lower-third.light` Role, which the syntax Pack
 * manifest binds to `anamorphic-flare` for this variant.
 */
export const cinematicLowerThird: LowerThirdVariant = {
	id: 'cinematic',
	label: 'Cinematic',
	defaults: {
		paperColor: '#0a0810',
		inkColor: '#fff8ec',
		offsetY: 0.1
	},
	motionShape: (slotIndex, progress) => {
		// Cinematic variant front-loads the title (slot 1) so it lands as the
		// flare sweep peaks; kicker and role catch up after.
		const lag = slotIndex === 1 ? 0 : slotIndex * 0.1 + 0.02;
		const local = Math.max(0, Math.min(1, (progress - lag) / (1 - lag)));
		return local * local * (3 - 2 * local);
	},
	CanvasSource: CinematicCanvasSource
};
