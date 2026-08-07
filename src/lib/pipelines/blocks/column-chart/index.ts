import { ColumnChartBlockSchema, type ColumnChartBlock } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

// ADR-0048 registers the strict validation Pipeline before visible renderer
// work. Later renderer tasks add CanvasSource/render to this same stable record;
// the schema is already live at every Preset ingress boundary.
export const columnChartBlockRenderer: BlockRenderer<ColumnChartBlock> = {
	type: 'column-chart',
	schema: ColumnChartBlockSchema
};
