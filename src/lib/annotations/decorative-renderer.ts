import { drawAnnotationMarks } from '$lib/annotations/annotation-marks';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

export function createDecorativeAnnotationRenderer(style: AnnotationMarkStyle): AnnotationRenderer {
	return {
		style,
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
}
