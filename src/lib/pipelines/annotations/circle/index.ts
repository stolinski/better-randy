import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

import { circleAnnotationDefinition } from './definition';

export const circleAnnotationRenderer: AnnotationRenderer = createDecorativeAnnotationRenderer(
	circleAnnotationDefinition
);
