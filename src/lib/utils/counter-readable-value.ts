import type { CounterContent } from '$lib/pipelines/overlays/counter';
import { slotMachineRollMotionShape } from '$lib/pipelines/overlays/counter/variants/slot-machine-motion';

export function resolveCounterRollProgress(content: CounterContent, progress: number): number {
	const rollProgress = Math.max(
		0,
		Math.min(
			1,
			(progress - (content.rollStart ?? 0)) / Math.max(content.rollWindow ?? 0.78, 0.0001)
		)
	);
	return slotMachineRollMotionShape(0, rollProgress);
}

export function resolveCounterValueAtProgress(content: CounterContent, progress: number): number {
	const eased = resolveCounterRollProgress(content, progress);
	return content.from + (content.to - content.from) * eased;
}

export function formatCounterReadableValue(content: CounterContent, value: number): string {
	switch (content.format) {
		case 'currency':
			return `$${Math.round(value).toLocaleString('en-US')}`;
		case 'percent':
			return `${Math.round(value)}%`;
		case 'timecode': {
			const total = Math.max(0, Math.round(value));
			return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
		}
		case 'integer':
		default:
			return Math.round(value).toLocaleString('en-US');
	}
}
