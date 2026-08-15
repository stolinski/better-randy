import ChartBarColumnCanvasSource from '$lib/pipelines/blocks/bar-chart/CanvasSource.svelte';
import { type BarChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { barChartBlockDefinition } from './definition';

// One stable Block record owns validation and the shared crisp chart-chrome source.
export const barChartBlockRenderer: BlockRenderer<BarChartBlock> = {
	...barChartBlockDefinition,
	CanvasSource: ChartBarColumnCanvasSource
};
