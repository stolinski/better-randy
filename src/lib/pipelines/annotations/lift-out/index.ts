import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';
import { liftOutAnnotationDefinition } from './definition';

export const liftOutAnnotationRenderer: AnnotationRenderer = {
	...liftOutAnnotationDefinition,
	computeFocalSlot({ canvasHeight, canvasWidth, layout, progress }): AnnotationFocalSlot {
		const bounds = layout.bounds;
		return {
			style: 'lift-out',
			rect: {
				x: bounds.x / canvasWidth,
				y: bounds.y / canvasHeight,
				width: bounds.width / canvasWidth,
				height: bounds.height / canvasHeight
			},
			magnify: 0.2 * progress,
			dim: progress,
			tear: 0
		};
	}
};
