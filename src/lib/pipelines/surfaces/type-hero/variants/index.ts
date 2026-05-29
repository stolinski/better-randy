/**
 * Type-hero variants registry — per ADR-0020. Adding a new variant is one
 * file in this folder + one entry here + one identifier in `VARIANT_IDS`.
 */

import type { TypeHeroVariant } from './types';
import { singleTypeHero } from './single';
import { pairTypeHero } from './pair';

export const VARIANTS: Readonly<Record<string, TypeHeroVariant>> = {
	single: singleTypeHero,
	pair: pairTypeHero
};

export const VARIANT_IDS = ['single', 'pair'] as const;

export type TypeHeroVariantId = (typeof VARIANT_IDS)[number];

export type { TypeHeroVariant, CounterpointAnchor } from './types';
