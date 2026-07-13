import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

export const highlight: AnnotationRenderer = createDecorativeAnnotationRenderer('highlight');
