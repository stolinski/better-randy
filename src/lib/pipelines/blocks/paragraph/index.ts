import type { ParagraphBlock } from '$lib/annotations/annotation-marks';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

export const paragraph: BlockRenderer<ParagraphBlock> = {
	type: 'paragraph'
};
