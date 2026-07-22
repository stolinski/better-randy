import type { CounterVariant } from './types';
import { slotMachineRollCounter } from './slot-machine';

export const VARIANTS: Readonly<Record<string, CounterVariant>> = {
	'slot-machine-roll': slotMachineRollCounter
};

export const VARIANT_IDS = ['slot-machine-roll'] as const;

export type CounterVariantId = (typeof VARIANT_IDS)[number];
