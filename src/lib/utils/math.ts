export function clampNumber(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function easeOutCubic(progress: number): number {
	return 1 - Math.pow(1 - progress, 3);
}
