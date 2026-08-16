import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const sideNoteAnnotationDefinition = {
	style: 'side-note',
	kind: 'decorative',
	appliesTo: ['paragraph']
} satisfies AnnotationPipelineDefinition;
