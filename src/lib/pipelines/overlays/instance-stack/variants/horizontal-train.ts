import type { InstanceStackVariant } from './types';
import HorizontalTrainCanvasSource from './HorizontalTrainCanvasSource.svelte';

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
		opacityFloor: 0.18,
		lagWindow: 0.5
	},
	motionShape: (instanceIndex, instanceCount, progress, params) => {
		const lag = (instanceIndex / Math.max(1, instanceCount - 1)) * params.lagWindow;
		// Rise duration is a fraction of the lag window so the last instance
		// settles early enough for a visible hold before the composition exits.
		const riseDuration = Math.max(0.04, params.lagWindow * 0.25);
		const localProgress = smoothstep(lag, lag + riseDuration, progress);
		const opacity = lerp(params.opacityFloor, 1, localProgress);
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
