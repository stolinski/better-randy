import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const magnifyAnnotationDefinition = {
	style: 'magnify',
	kind: 'focal',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
