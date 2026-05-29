/**
 * Lower-third variants registry — per ADR-0020. Adding a new variant is one
 * file in this folder + one entry here + one identifier in `VARIANT_IDS`.
 * The family Pipeline\'s Zod schema is built from `VARIANT_IDS` at module
 * load, so the export script regenerates the JSON schema automatically.
 */

import type { LowerThirdVariant } from './types';
import { standardLowerThird } from './standard';
import { cinematicLowerThird } from './cinematic';

export const VARIANTS: Readonly<Record<string, LowerThirdVariant>> = {
	standard: standardLowerThird,
	cinematic: cinematicLowerThird
};

export const VARIANT_IDS = ['standard', 'cinematic'] as const;

export type LowerThirdVariantId = (typeof VARIANT_IDS)[number];

export type { LowerThirdVariant } from './types';
