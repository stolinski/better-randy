import { BarChartBlockSchema } from '$lib/platform/engine-schema';
import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const barChartBlockDefinition = {
	type: 'bar-chart',
	schema: BarChartBlockSchema
} satisfies BlockPipelineDefinition<'bar-chart'>;
