import {
	VARIANT_IDS as DEFINITION_VARIANT_IDS,
	type Text3dVariantId as DefinitionText3dVariantId
} from './variant-ids';
import type { Text3dVariant } from './types';
import { cylinderAxisY } from './cylinder-axis-y';

export const VARIANTS: Readonly<Record<string, Text3dVariant>> = {
	'cylinder-axis-y': cylinderAxisY
};

export const VARIANT_IDS = DEFINITION_VARIANT_IDS;

export type Text3dVariantId = DefinitionText3dVariantId;
