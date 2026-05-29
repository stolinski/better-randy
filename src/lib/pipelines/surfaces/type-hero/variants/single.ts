import type { TypeHeroVariant } from './types';
import SingleCanvasSource from './SingleCanvasSource.svelte';

/**
 * Single type-hero variant — one display word flush-left with a mono
 * subtitle anchored lower-right. Per ADR-0020 the default variant is the
 * most restrained of the set; this carries the family\'s historical shape
 * unchanged.
 */
export const singleTypeHero: TypeHeroVariant = {
	id: 'single',
	label: 'Single',
	defaults: {
		scaleRatio: 1,
		counterpointAnchor: 'shoulder',
		enterStagger: 0
	},
	motionShape: (_slotIndex, progress) => {
		const t = Math.max(0, Math.min(1, progress));
		return t * t * (3 - 2 * t);
	},
	CanvasSource: SingleCanvasSource
};
