import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const tearOutAnnotationDefinition = {
	style: 'tear-out',
	kind: 'focal',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
