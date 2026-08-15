import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const strikeAnnotationDefinition = {
	style: 'strike',
	kind: 'decorative',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
