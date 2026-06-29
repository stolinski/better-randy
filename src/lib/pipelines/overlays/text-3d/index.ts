import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { VARIANT_IDS, type Text3dVariantId } from './variants';

const Text3dContentSchema = z.object({
	variant: z.enum(VARIANT_IDS).default('cylinder-axis-y'),
	text: z.string().min(1),
	rotationDegrees: z.number().default(90),
	radiusCh: z.number().positive().default(4),
	// The spin-in to the hero frame runs over [spinStart, spinStart + spinWindow]
	// (fractions of the clip) and then HOLDS + breathes — a draggable timeline
	// clip, so the settle timing is composition data, not a hardcoded constant.
	spinStart: z.number().min(0).max(1).default(0),
	spinWindow: z.number().min(0).max(1).default(0.42)
});

export type Text3dContent = z.infer<typeof Text3dContentSchema>;
export type { Text3dVariantId };

function defaults(): OverlayDefaults<Text3dContent> {
	return {
		content: {
			variant: 'cylinder-axis-y',
			text: 'ROUND SPIN IT',
			rotationDegrees: 90,
			radiusCh: 4,
			spinStart: 0,
			spinWindow: 0.42
		},
		position: { anchor: 'center', offset: { x: 0, y: 0 } },
		enter: { start: 0, duration: 0.2, ease: 'smooth' },
		exit: { start: 0.85, duration: 0.1, ease: 'smooth' }
	};
}

export const text3d: OverlayRenderer<Text3dContent> = {
	type: 'text-3d',
	label: 'Text 3D',
	schema: Text3dContentSchema,
	defaults,
	CanvasSource,
	Editor
};
