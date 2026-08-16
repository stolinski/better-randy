import ChartNormalizedCanvasSource from '$lib/pipelines/blocks/unit-grid-chart/CanvasSource.svelte';
import { type UnitGridChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { unitGridChartBlockDefinition } from './definition';

// One stable normalized Block record owns strict validation and shared crisp key/callout chrome.
export const unitGridChartBlockRenderer: BlockRenderer<UnitGridChartBlock> = {
	...unitGridChartBlockDefinition,
	CanvasSource: ChartNormalizedCanvasSource
};
