import type { CounterVariant } from './types';
import SlotMachineCanvasSource from './SlotMachineCanvasSource.svelte';
import { slotMachineRollMotionShape } from './slot-machine-motion';

export const slotMachineRollCounter: CounterVariant = {
	id: 'slot-machine-roll',
	label: 'Slot machine roll',
	defaults: {
		easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
	},
	motionShape: slotMachineRollMotionShape,
	CanvasSource: SlotMachineCanvasSource
};
