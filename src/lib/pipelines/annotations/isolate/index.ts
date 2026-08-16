import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';
import { isolateAnnotationDefinition } from './definition';

export const isolateAnnotationRenderer: AnnotationRenderer = {
	...isolateAnnotationDefinition,
	computeFocalSlot({ canvasHeight, canvasWidth, layout, progress }): AnnotationFocalSlot {
		const bounds = layout.bounds;
		return {
			style: 'isolate',
			rect: {
				x: bounds.x / canvasWidth,
				y: bounds.y / canvasHeight,
				width: bounds.width / canvasWidth,
				height: bounds.height / canvasHeight
			},
			magnify: 0,
			dim: progress,
			tear: 0
		};
	}
};
