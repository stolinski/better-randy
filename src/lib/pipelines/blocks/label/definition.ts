import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const labelBlockDefinition = {
	type: 'label'
} satisfies BlockPipelineDefinition<'label'>;
