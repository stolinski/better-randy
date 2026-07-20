import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

/**
 * Checklist Surface — a half-frame progress tracker: a title plus numbered
 * tasks occupying the right half of the horizontal frame (bottom half
 * vertical), riding beside footage. Completed items carry the red marker
 * strike drawn by the reused `strike` Annotation: a checked item with no
 * window is statically struck from frame 0; a checked item WITH a
 * `strike: { start, duration }` window draws through on cue — the recurring
 * check-off beat. Layout is stable (every item reserves its space from frame
 * 0) so the rules stay pinned to their phrases.
 *
 * NOT a `paper` preset — the content model is an ordered `content.items[]`
 * with per-item completion state (see ADR-0040; the ADR-0031 ordered-list
 * reasoning applies directly). `chrome: 'none'` (the ADR-0037 mode, reused)
 * drops the card plate for bare numbered type with a hard legibility shadow.
 */

function defaults(): SurfaceState {
	return {
		type: 'checklist',
		content: {
			title: 'PROJECT SETUP',
			body: parseAnnotationBodyText(''),
			items: [
				{ text: 'pnpm install', checked: true },
				{
					text: 'Env vars set',
					checked: true,
					strike: { start: 0.42, duration: 0.08, ease: 'sharp' }
				},
				{ text: 'DB migrated', checked: false },
				{ text: 'Dev server up', checked: false },
				{ text: 'First commit', checked: false }
			]
		},
		// 420 ms settled-place at the 6 s transport (G6 enter band).
		enter: { start: 0, duration: 0.07, ease: 'settled' }
	};
}

export const checklist: SurfaceRenderer = {
	type: 'checklist',
	label: 'Checklist',
	controls: {
		// The list is authored as `content.items[]`, edited per item in the
		// inspector's Checklist section; the panel heading reuses the standard
		// title slot. Per-item strike timing stays on the timeline's
		// `checklist-{index}` tracks.
		title: true,
		body: 'never',
		items: true,
		chrome: true,
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true
	},
	CanvasSource,
	defaults,
	createPipeline(opts): SurfaceRenderInstance {
		// `flat` substrate — a chrome card / bare type over footage, not
		// photographed paper (no fiber grain bake).
		return createPaperPipeline({ ...opts, substrate: 'flat' });
	}
};
