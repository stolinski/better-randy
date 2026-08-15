import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

const WatermarkContentSchema = z.object({
	handle: z.string(),
	label: z.string().optional()
});

export type WatermarkContent = z.infer<typeof WatermarkContentSchema>;

function defaults(): OverlayDefaults<WatermarkContent> {
	return {
		content: { handle: '@supers', label: 'Watch next' },
		position: { anchor: 'top-right', offset: { x: 0.0625, y: 0.0625 } },
		enter: { start: 0.06, duration: 0.14, ease: 'settled' },
		exit: { start: 0.86, duration: 0.14, ease: 'smooth' }
	};
}

export const watermarkOverlayRenderer: OverlayRenderer<WatermarkContent> = {
	type: 'watermark',
	label: 'Watermark',
	schema: WatermarkContentSchema,
	defaults,
	CanvasSource,
	Editor,
	readableText: (content) => [
		{ id: 'handle', text: content.handle, role: 'overlay-corner-primary' },
		...(content.label
			? [{ id: 'label', text: content.label, role: 'overlay-corner-secondary' as const }]
			: [])
	]
};
