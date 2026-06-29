import type { Component } from 'svelte';

import type { OverlayCanvasSourceProps } from '$lib/platform/pipelines/types';

import type { Text3dContent } from '../index';

export interface Text3dVariant {
	id: string;
	label: string;
	defaults: {
		rotationDegrees: number;
		radiusCh: number;
	};
	/**
	 * Pure motion-shape function — receives (glyphIndex, glyphCount, progress,
	 * rotationDegrees) and returns the per-glyph rotation angle (degrees) around
	 * the cylinder axis for the given progress. Pure per ADR-0020.
	 */
	motionShape: (
		glyphIndex: number,
		glyphCount: number,
		progress: number,
		rotationDegrees: number,
		spinStart: number,
		spinWindow: number
	) => number;
	CanvasSource: Component<OverlayCanvasSourceProps<Text3dContent>>;
}
