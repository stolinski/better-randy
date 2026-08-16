import ChartBarColumnCanvasSource from '$lib/pipelines/blocks/bar-chart/CanvasSource.svelte';
import { type ColumnChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { columnChartBlockDefinition } from './definition';

// One stable Block record owns validation and the shared crisp chart-chrome source.
export const columnChartBlockRenderer: BlockRenderer<ColumnChartBlock> = {
	...columnChartBlockDefinition,
	CanvasSource: ChartBarColumnCanvasSource
};
