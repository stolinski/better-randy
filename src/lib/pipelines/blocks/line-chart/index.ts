import LineChartCanvasSource from './CanvasSource.svelte';
import { LineChartBlockSchema, type LineChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

export const lineChartBlockRenderer: BlockRenderer<LineChartBlock> = {
	type: 'line-chart',
	schema: LineChartBlockSchema,
	CanvasSource: LineChartCanvasSource
};
