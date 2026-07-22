export function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function easeOutBack(progress: number, overshoot = 1.4): number {
	const c1 = overshoot;
	const c3 = c1 + 1;
	const p = progress - 1;
	return 1 + c3 * p * p * p + c1 * p * p;
}
