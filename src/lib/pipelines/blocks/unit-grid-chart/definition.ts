import { UnitGridChartBlockSchema } from '$lib/platform/engine-schema';
import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const unitGridChartBlockDefinition = {
	type: 'unit-grid-chart',
	schema: UnitGridChartBlockSchema
} satisfies BlockPipelineDefinition<'unit-grid-chart'>;
