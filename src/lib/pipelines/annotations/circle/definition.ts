import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const circleAnnotationDefinition = {
	style: 'circle',
	kind: 'decorative',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
