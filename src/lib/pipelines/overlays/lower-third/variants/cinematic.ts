import type { LowerThirdVariant } from './types';
import CinematicCanvasSource from './CinematicCanvasSource.svelte';

/**
 * Cinematic lower-third variant — a broadcast plate whose appearance resolves
 * through the active Pack. Its former anamorphic flare was removed by ADR-0039;
 * this module now owns only the variant's timing shape and defaults.
 */
export const cinematicLowerThird: LowerThirdVariant = {
	id: 'cinematic',
	label: 'Cinematic',
	defaults: {
		offsetY: 0.115
	},
	motionShape: (slotIndex, progress) => {
		// Cinematic variant front-loads the title; kicker and role catch up after.
		const lag = slotIndex === 1 ? 0 : slotIndex * 0.1 + 0.02;
		const local = Math.max(0, Math.min(1, (progress - lag) / (1 - lag)));
		return local * local * (3 - 2 * local);
	},
	CanvasSource: CinematicCanvasSource
};
