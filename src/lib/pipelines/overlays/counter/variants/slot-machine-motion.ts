import { resolveCounterRollMotionShape } from '$lib/utils/counter-readable-value';

export function slotMachineRollMotionShape(_digitIndex: number, progress: number): number {
	return resolveCounterRollMotionShape(progress);
}
