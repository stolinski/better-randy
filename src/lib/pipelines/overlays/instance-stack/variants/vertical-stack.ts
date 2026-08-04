import type { InstanceStackVariant } from './types';
import VerticalStackCanvasSource from './VerticalStackCanvasSource.svelte';
import { verticalStackMotionShape } from './instance-stack-motion';

export const verticalStack: InstanceStackVariant = {
	id: 'vertical-stack',
	label: 'Vertical stack',
	defaults: {
		count: 9,
		spacing: 1.05,
		opacityFloor: 0.15,
		lagWindow: 0.4
	},
	motionShape: verticalStackMotionShape,
	CanvasSource: VerticalStackCanvasSource
};
