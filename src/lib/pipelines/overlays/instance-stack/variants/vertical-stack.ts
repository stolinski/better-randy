import type { InstanceStackVariant } from './types';
import VerticalStackCanvasSource from './VerticalStackCanvasSource.svelte';

const SPACING_EM = 1.05;
const LAG_WINDOW = 0.4;
const OPACITY_FLOOR = 0.15;

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
		spacing: SPACING_EM,
		opacityFloor: OPACITY_FLOOR,
		lagWindow: LAG_WINDOW
	},
	motionShape: (instanceIndex, instanceCount, progress) => {
		const lag = (instanceIndex / Math.max(1, instanceCount - 1)) * LAG_WINDOW;
		const localProgress = smoothstep(lag, lag + (1 - LAG_WINDOW), progress);
		// Earlier instances arrive earlier and stay fully opaque; trailing
		// instances ramp opacity from the floor up to 1 as their lag-window
		// progress crosses the threshold.
		const opacity = lerp(OPACITY_FLOOR, 1, localProgress);
		return {
			xOffset: 0,
			yOffset: instanceIndex * SPACING_EM,
			opacity,
			scale: 1
		};
	},
	CanvasSource: VerticalStackCanvasSource
};
