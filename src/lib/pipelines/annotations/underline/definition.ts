import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const underlineAnnotationDefinition = {
	style: 'underline',
	kind: 'decorative',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
