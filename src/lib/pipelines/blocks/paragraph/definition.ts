import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const paragraphBlockDefinition = {
	type: 'paragraph'
} satisfies BlockPipelineDefinition<'paragraph'>;
