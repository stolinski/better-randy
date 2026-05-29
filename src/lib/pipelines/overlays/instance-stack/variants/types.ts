import type { Component } from 'svelte';

import type { OverlayCanvasSourceProps } from '$lib/platform/pipelines/types';

import type { InstanceStackContent } from '../index';

export interface InstanceMotionState {
	xOffset: number;
	yOffset: number;
	opacity: number;
	scale: number;
}

export interface InstanceStackVariant {
	id: string;
	label: string;
	defaults: {
		count: number;
		spacing: number;
		opacityFloor: number;
		lagWindow: number;
	};
	/**
	 * Pure motion-shape function — (instanceIndex, instanceCount, progress).
	 * Pure per ADR-0020: no engineState reads, no DOM access, no wall-clock.
	 */
	motionShape: (instanceIndex: number, instanceCount: number, progress: number) => InstanceMotionState;
	CanvasSource: Component<OverlayCanvasSourceProps<InstanceStackContent>>;
}
