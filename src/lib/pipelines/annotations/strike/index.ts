import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

import { strikeAnnotationDefinition } from './definition';

export const strikeAnnotationRenderer: AnnotationRenderer = createDecorativeAnnotationRenderer(
	strikeAnnotationDefinition
);
