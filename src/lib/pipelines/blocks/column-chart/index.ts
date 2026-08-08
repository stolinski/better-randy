import ChartBarColumnCanvasSource from '$lib/pipelines/blocks/bar-chart/CanvasSource.svelte';
import { ColumnChartBlockSchema, type ColumnChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

// One stable Block record owns validation and the shared crisp chart-chrome source.
export const columnChartBlockRenderer: BlockRenderer<ColumnChartBlock> = {
	type: 'column-chart',
	schema: ColumnChartBlockSchema,
	CanvasSource: ChartBarColumnCanvasSource
};
