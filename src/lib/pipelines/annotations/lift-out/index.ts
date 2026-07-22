import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';

export const liftOutAnnotationRenderer: AnnotationRenderer = {
	style: 'lift-out',
	kind: 'focal',
	appliesTo: ['paragraph'],
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
