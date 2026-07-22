import { createDecorativeAnnotationRenderer } from '$lib/annotations/decorative-renderer';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

export const circleAnnotationRenderer: AnnotationRenderer =
	createDecorativeAnnotationRenderer('circle');
