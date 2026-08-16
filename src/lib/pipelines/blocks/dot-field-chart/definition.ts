import { DotFieldChartBlockSchema } from '$lib/platform/engine-schema';
import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const dotFieldChartBlockDefinition = {
	type: 'dot-field-chart',
	schema: DotFieldChartBlockSchema
} satisfies BlockPipelineDefinition<'dot-field-chart'>;
