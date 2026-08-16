import { ColumnChartBlockSchema } from '$lib/platform/engine-schema';
import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const columnChartBlockDefinition = {
	type: 'column-chart',
	schema: ColumnChartBlockSchema
} satisfies BlockPipelineDefinition<'column-chart'>;
