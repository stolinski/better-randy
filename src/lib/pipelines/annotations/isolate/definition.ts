import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const isolateAnnotationDefinition = {
	style: 'isolate',
	kind: 'focal',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
