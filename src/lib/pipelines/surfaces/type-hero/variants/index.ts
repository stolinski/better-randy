/**
 * Type-hero variants registry — per ADR-0020. Adding a new variant is one
 * file in this folder + one entry here + one identifier in `VARIANT_IDS`.
 */

import {
	VARIANT_IDS as DEFINITION_VARIANT_IDS,
	type TypeHeroVariantId as DefinitionTypeHeroVariantId
} from './variant-ids';
import type { TypeHeroVariant } from './types';
import { singleTypeHero } from './single';
import { pairTypeHero } from './pair';

export const VARIANTS: Readonly<Record<string, TypeHeroVariant>> = {
	single: singleTypeHero,
	pair: pairTypeHero
};

export const VARIANT_IDS = DEFINITION_VARIANT_IDS;

export type TypeHeroVariantId = DefinitionTypeHeroVariantId;
