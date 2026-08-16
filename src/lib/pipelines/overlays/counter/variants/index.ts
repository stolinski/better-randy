import {
	VARIANT_IDS as DEFINITION_VARIANT_IDS,
	type CounterVariantId as DefinitionCounterVariantId
} from './variant-ids';
import type { CounterVariant } from './types';
import { slotMachineRollCounter } from './slot-machine';

export const VARIANTS: Readonly<Record<string, CounterVariant>> = {
	'slot-machine-roll': slotMachineRollCounter
};

export const VARIANT_IDS = DEFINITION_VARIANT_IDS;

export type CounterVariantId = DefinitionCounterVariantId;
