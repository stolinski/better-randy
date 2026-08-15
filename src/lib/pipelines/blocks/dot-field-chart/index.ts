import ChartNormalizedCanvasSource from '$lib/pipelines/blocks/unit-grid-chart/CanvasSource.svelte';
import { type DotFieldChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { dotFieldChartBlockDefinition } from './definition';

// One stable normalized Block record owns strict validation and shared crisp key/callout chrome.
export const dotFieldChartBlockRenderer: BlockRenderer<DotFieldChartBlock> = {
	...dotFieldChartBlockDefinition,
	CanvasSource: ChartNormalizedCanvasSource
};
