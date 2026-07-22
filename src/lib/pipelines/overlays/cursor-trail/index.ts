import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

const CursorPathSchema = z.object({
	targetSlot: z.string().min(1),
	// Hold on this waypoint (the cursor parks here). Drives the clock: a longer
	// dwell is a proportionally longer pause, not an equal slice — surfaced as a
	// draggable dwell clip per waypoint. See schedule.ts.
	dwellMs: z.number().nonnegative().default(400),
	// Glide INTO this waypoint from the previous one. Ignored for the first
	// waypoint (the cursor starts there). Also a draggable clip (its start).
	travelMs: z.number().nonnegative().default(700),
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
				{ targetSlot: 'title', dwellMs: 600, travelMs: 700, action: 'hover' },
				{ targetSlot: 'author', dwellMs: 400, travelMs: 700, action: 'idle' }
			]
		},
		position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
		enter: { start: 0, duration: 0.06, ease: 'smooth' },
		exit: { start: 0.94, duration: 0.04, ease: 'smooth' }
	};
}

export const cursorTrailOverlayRenderer: OverlayRenderer<CursorTrailContent> = {
	type: 'cursor-trail',
	label: 'Cursor trail',
	schema: CursorTrailContentSchema,
	defaults,
	CanvasSource,
	Editor
};
