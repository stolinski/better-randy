import type { CounterVariant } from './types';
import SlotMachineCanvasSource from './SlotMachineCanvasSource.svelte';

export const slotMachineRollCounter: CounterVariant = {
	id: 'slot-machine-roll',
	label: 'Slot machine roll',
	defaults: {
		easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
	},
	motionShape: (_digitIndex, progress) => {
		const t = Math.max(0, Math.min(1, progress));
		return t * t * (3 - 2 * t);
	},
	CanvasSource: SlotMachineCanvasSource
};
