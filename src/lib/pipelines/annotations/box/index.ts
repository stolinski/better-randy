import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

import { boxAnnotationDefinition } from './definition';

export const boxAnnotationRenderer: AnnotationRenderer =
	createDecorativeAnnotationRenderer(boxAnnotationDefinition);
