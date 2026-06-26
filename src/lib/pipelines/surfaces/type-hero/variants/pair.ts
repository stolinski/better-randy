import type { TypeHeroVariant } from './types';
import PairCanvasSource from './PairCanvasSource.svelte';

/**
 * Pair type-hero variant — primary display word paired with a small
 * counterpoint at the primary\'s shoulder. The mo1-style scale-counterpoint
 * composition referenced by the motion-primitives plan. The counterpoint
 * enter is staggered after the primary so the eye lands on the primary
 * first and the counterpoint resolves as a typographic annotation.
 */
export const pairTypeHero: TypeHeroVariant = {
	id: 'pair',
	label: 'Pair',
	defaults: {
		scaleRatio: 0.06,
		counterpointAnchor: 'shoulder'
	},
	CanvasSource: PairCanvasSource
};
