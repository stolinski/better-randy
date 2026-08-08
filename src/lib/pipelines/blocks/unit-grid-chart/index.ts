import ChartNormalizedCanvasSource from '$lib/pipelines/blocks/unit-grid-chart/CanvasSource.svelte';
import { UnitGridChartBlockSchema, type UnitGridChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

// One stable normalized Block record owns strict validation and shared crisp key/callout chrome.
export const unitGridChartBlockRenderer: BlockRenderer<UnitGridChartBlock> = {
	type: 'unit-grid-chart',
	schema: UnitGridChartBlockSchema,
	CanvasSource: ChartNormalizedCanvasSource
};
