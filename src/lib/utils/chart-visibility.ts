import type { ChartBlock, ChartGroup } from '$lib/platform/engine-schema';

export function resolveVisibleChartBlock(
	chart: ChartGroup | undefined,
	compositionProgress: number
): ChartBlock | null {
	if (!Number.isFinite(compositionProgress)) {
		throw new RangeError('Chart visibility requires finite composition progress.');
	}
	if (!chart) return null;
	const progress = Math.max(0, Math.min(1, compositionProgress));
	for (let index = chart.items.length - 1; index >= 0; index -= 1) {
		const item = chart.items[index];
		const visibleStart = item.motion.entry.start;
		const visibleEnd = item.motion.exit.start + item.motion.exit.duration;
		if (progress + 1e-12 >= visibleStart && progress + 1e-12 < visibleEnd) return item;
	}
	return null;
}
