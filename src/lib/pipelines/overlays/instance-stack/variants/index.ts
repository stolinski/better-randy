import type { InstanceStackVariant } from './types';
import { verticalStack } from './vertical-stack';
import { horizontalTrain } from './horizontal-train';

export const VARIANTS: Readonly<Record<string, InstanceStackVariant>> = {
	'vertical-stack': verticalStack,
	'horizontal-train': horizontalTrain
};

export const VARIANT_IDS = ['vertical-stack', 'horizontal-train'] as const;

export type InstanceStackVariantId = (typeof VARIANT_IDS)[number];
