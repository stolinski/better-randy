import type { InstanceStackVariant } from './types';
import HorizontalTrainCanvasSource from './HorizontalTrainCanvasSource.svelte';

const LAG_WINDOW = 0.5;
const OPACITY_FLOOR = 0.18;

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function smoothstep(a: number, b: number, t: number): number {
	const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
	return c * c * (3 - 2 * c);
}

export const horizontalTrain: InstanceStackVariant = {
	id: 'horizontal-train',
	label: 'Horizontal train',
	defaults: {
		count: 6,
		spacing: 1.4,
		opacityFloor: OPACITY_FLOOR,
		lagWindow: LAG_WINDOW
	},
	motionShape: (instanceIndex, instanceCount, progress) => {
		const lag = (instanceIndex / Math.max(1, instanceCount - 1)) * LAG_WINDOW;
		const localProgress = smoothstep(lag, lag + (1 - LAG_WINDOW), progress);
		const opacity = lerp(OPACITY_FLOOR, 1, localProgress);
		// Trailing instances arrive from the right, settling at their slot
		// position as the lag-window progress completes.
		const xOffset = (1 - localProgress) * (instanceCount - instanceIndex) * 0.25;
		return {
			xOffset,
			yOffset: 0,
			opacity,
			scale: lerp(0.94, 1, localProgress)
		};
	},
	CanvasSource: HorizontalTrainCanvasSource
};
