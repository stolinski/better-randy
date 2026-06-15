import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

const CursorPathSchema = z.object({
	targetSlot: z.string().min(1),
	dwellMs: z.number().nonnegative().default(400),
	action: z.enum(['hover', 'click', 'idle']).default('hover')
});

export type CursorPath = z.infer<typeof CursorPathSchema>;

const CursorTrailContentSchema = z.object({
	path: z.array(CursorPathSchema).min(1)
});

export type CursorTrailContent = z.infer<typeof CursorTrailContentSchema>;

function defaults(): OverlayDefaults<CursorTrailContent> {
	return {
		content: {
			path: [
				{ targetSlot: 'title', dwellMs: 600, action: 'hover' },
				{ targetSlot: 'author', dwellMs: 400, action: 'idle' }
			]
		},
		position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
		enter: { start: 0, duration: 0.06, ease: 'smooth' },
		exit: { start: 0.94, duration: 0.04, ease: 'smooth' }
	};
}

export const cursorTrail: OverlayRenderer<CursorTrailContent> = {
	type: 'cursor-trail',
	label: 'Cursor trail',
	schema: CursorTrailContentSchema,
	defaults,
	CanvasSource,
	Editor
};
