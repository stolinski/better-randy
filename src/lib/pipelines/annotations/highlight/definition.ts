import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const highlightAnnotationDefinition = {
	style: 'highlight',
	kind: 'decorative',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
