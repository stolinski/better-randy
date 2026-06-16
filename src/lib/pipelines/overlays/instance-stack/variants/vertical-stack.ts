import type { InstanceStackVariant } from './types';
import VerticalStackCanvasSource from './VerticalStackCanvasSource.svelte';

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function smoothstep(a: number, b: number, t: number): number {
	const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
	return c * c * (3 - 2 * c);
}

export const verticalStack: InstanceStackVariant = {
	id: 'vertical-stack',
	label: 'Vertical stack',
	defaults: {
		count: 9,
		spacing: 1.05,
		opacityFloor: 0.15,
		lagWindow: 0.4
	},
	motionShape: (instanceIndex, instanceCount, progress, params) => {
		const lag = (instanceIndex / Math.max(1, instanceCount - 1)) * params.lagWindow;
		const localProgress = smoothstep(lag, lag + (1 - params.lagWindow), progress);
		const opacity = lerp(params.opacityFloor, 1, localProgress);
		return {
			xOffset: 0,
			yOffset: instanceIndex * params.spacing,
			opacity,
			scale: 1
		};
	},
	CanvasSource: VerticalStackCanvasSource
};
