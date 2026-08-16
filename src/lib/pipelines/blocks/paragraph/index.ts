import type { AnnotationBodyBlock } from '$lib/annotations/annotation-marks';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { paragraphBlockDefinition } from './definition';

export const paragraphBlockRenderer: BlockRenderer<AnnotationBodyBlock> = {
	...paragraphBlockDefinition
};
