import LineChartCanvasSource from './CanvasSource.svelte';
import { type LineChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { lineChartBlockDefinition } from './definition';

export const lineChartBlockRenderer: BlockRenderer<LineChartBlock> = {
	...lineChartBlockDefinition,
	CanvasSource: LineChartCanvasSource
};
