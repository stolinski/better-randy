import { drawAnnotationMarks } from '$lib/annotations/annotation-marks';
import type { AnnotationPipelineDefinition } from '$lib/platform/pipelines/definition-types';
import type { AnnotationRenderer } from '$lib/platform/pipelines/types';

export function createDecorativeAnnotationRenderer(
	definition: AnnotationPipelineDefinition
): AnnotationRenderer {
	return {
		...definition,
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
