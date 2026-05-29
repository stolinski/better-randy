import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

// Callout is reserved for future work; it registers its slot but has no visual
// implementation in v1. Schema validates the mark; renderer is a no-op until
// the callout chrome design lands.
export const callout: AnnotationRenderer = {
	style: 'callout',
	kind: 'decorative',
	appliesTo: ['paragraph'],
	draw() {
		// no-op
	}
};
