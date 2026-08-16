import type { BlockPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const timelineSegmentBlockDefinition = {
	type: 'timeline-segment'
} satisfies BlockPipelineDefinition<'timeline-segment'>;
