import type { AnnotationBodyBlock } from '$lib/annotations/annotation-marks';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

export const paragraphBlockRenderer: BlockRenderer<AnnotationBodyBlock> = {
	type: 'paragraph'
};
