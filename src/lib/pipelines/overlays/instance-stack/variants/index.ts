import {
	VARIANT_IDS as DEFINITION_VARIANT_IDS,
	type InstanceStackVariantId as DefinitionInstanceStackVariantId
} from './variant-ids';
import type { InstanceStackVariant } from './types';
import { verticalStack } from './vertical-stack';
import { horizontalTrain } from './horizontal-train';

export const VARIANTS: Readonly<Record<string, InstanceStackVariant>> = {
	'vertical-stack': verticalStack,
	'horizontal-train': horizontalTrain
};

export const VARIANT_IDS = DEFINITION_VARIANT_IDS;

export type InstanceStackVariantId = DefinitionInstanceStackVariantId;
