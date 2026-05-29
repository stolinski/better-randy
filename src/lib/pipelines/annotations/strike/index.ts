import { drawAnnotationMarks } from '$lib/annotations/annotation-marks';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

export const strike: AnnotationRenderer = {
	style: 'strike',
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
