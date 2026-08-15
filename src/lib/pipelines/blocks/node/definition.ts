import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const nodeBlockDefinition = {
	type: 'node'
} satisfies BlockPipelineDefinition<'node'>;
