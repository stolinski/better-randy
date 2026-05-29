import { drawAnnotationMarks } from '$lib/annotations/annotation-marks';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

export const circle: AnnotationRenderer = {
	style: 'circle',
	kind: 'decorative',
	appliesTo: ['paragraph'],
	draw({ color, context, intensity, layout, progress }) {
		drawAnnotationMarks({
			colorsByIndex: [color],
			context,
			intensityByIndex: [intensity],
			layouts: [layout],
			progressByIndex: [progress]
		});
	}
};
