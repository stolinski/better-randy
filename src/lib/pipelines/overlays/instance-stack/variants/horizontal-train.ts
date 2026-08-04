import type { InstanceStackVariant } from './types';
import HorizontalTrainCanvasSource from './HorizontalTrainCanvasSource.svelte';
import { horizontalTrainMotionShape } from './instance-stack-motion';

export const horizontalTrain: InstanceStackVariant = {
	id: 'horizontal-train',
	label: 'Horizontal train',
	defaults: {
		count: 6,
		spacing: 1.4,
		opacityFloor: 0.18,
		lagWindow: 0.5
	},
	motionShape: horizontalTrainMotionShape,
	CanvasSource: HorizontalTrainCanvasSource
};
