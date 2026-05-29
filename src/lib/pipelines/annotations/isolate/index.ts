import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';

export const isolate: AnnotationRenderer = {
	style: 'isolate',
	kind: 'focal',
	appliesTo: ['paragraph'],
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
