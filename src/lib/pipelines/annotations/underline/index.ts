import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

import { underlineAnnotationDefinition } from './definition';

export const underlineAnnotationRenderer: AnnotationRenderer = createDecorativeAnnotationRenderer(
	underlineAnnotationDefinition
);
