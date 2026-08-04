export function slotMachineRollMotionShape(_digitIndex: number, progress: number): number {
	const t = Math.max(0, Math.min(1, progress));
	return t * t * (3 - 2 * t);
}
