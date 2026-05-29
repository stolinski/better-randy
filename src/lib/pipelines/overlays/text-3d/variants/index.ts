import type { Text3dVariant } from './types';
import { cylinderAxisY } from './cylinder-axis-y';

export const VARIANTS: Readonly<Record<string, Text3dVariant>> = {
	'cylinder-axis-y': cylinderAxisY
};

export const VARIANT_IDS = ['cylinder-axis-y'] as const;

export type Text3dVariantId = (typeof VARIANT_IDS)[number];

export type { Text3dVariant } from './types';
