import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const boxAnnotationDefinition = {
	style: 'box',
	kind: 'decorative',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
