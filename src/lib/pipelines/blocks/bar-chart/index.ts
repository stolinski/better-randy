import ChartBarColumnCanvasSource from '$lib/pipelines/blocks/bar-chart/CanvasSource.svelte';
import { BarChartBlockSchema, type BarChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

// One stable Block record owns validation and the shared crisp chart-chrome source.
export const barChartBlockRenderer: BlockRenderer<BarChartBlock> = {
	type: 'bar-chart',
	schema: BarChartBlockSchema,
	CanvasSource: ChartBarColumnCanvasSource
};
