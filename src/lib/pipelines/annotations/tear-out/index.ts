import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';

export const tearOutAnnotationRenderer: AnnotationRenderer = {
	style: 'tear-out',
	kind: 'focal',
	appliesTo: ['paragraph'],
	computeFocalSlot({ canvasHeight, canvasWidth, layout, progress }): AnnotationFocalSlot {
		const bounds = layout.bounds;
		return {
			style: 'tear-out',
			rect: {
				x: bounds.x / canvasWidth,
				y: bounds.y / canvasHeight,
				width: bounds.width / canvasWidth,
				height: bounds.height / canvasHeight
			},
			magnify: 0.24 * progress,
			dim: progress,
			tear: progress
		};
	}
};
