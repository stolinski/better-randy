import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const liftOutAnnotationDefinition = {
	style: 'lift-out',
	kind: 'focal',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
