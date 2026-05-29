import type { Component } from 'svelte';

import type { OverlayCanvasSourceProps } from '$lib/platform/pipelines/types';

import type { CounterContent } from '../index';

export interface CounterVariant {
	id: string;
	label: string;
	defaults: {
		easing: string;
	};
	/**
	 * Pure motion-shape function. Receives digit position and current
	 * interpolated value; returns the per-digit roll progress used by the
	 * CanvasSource to position the digit strip.
	 */
	motionShape: (digitIndex: number, progress: number) => number;
	CanvasSource: Component<OverlayCanvasSourceProps<CounterContent>>;
}
