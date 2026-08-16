import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

import { highlightAnnotationDefinition } from './definition';

export const highlightAnnotationRenderer: AnnotationRenderer = createDecorativeAnnotationRenderer(
	highlightAnnotationDefinition
);
