import { LineChartBlockSchema } from '$lib/platform/engine-schema';
import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const lineChartBlockDefinition = {
	type: 'line-chart',
	schema: LineChartBlockSchema
} satisfies BlockPipelineDefinition<'line-chart'>;
