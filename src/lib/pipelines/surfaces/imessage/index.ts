import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

/**
 * iMessage Surface — a faithful iOS Messages conversation that plays out over
 * the clip: received/sent bubbles pop in one-by-one (iOS scale-from-the-tail),
 * a three-dot typing indicator resolves into the next bubble, a tapback pops on
 * a bubble, and a delivered → read receipt fades in under the last sent bubble.
 * The whole choreography is driven by `animState.globalProgress` (frame-
 * deterministic), so preview == export.
 *
 * NOT a web-document site — there is no browser chrome; the content model is an
 * ordered `content.messages[]` (see ADR-0031), not the single-body slot. Reuses
 * the `paper` Pipeline runtime so the channel's `highlight` Annotation still
 * lands on a phrase inside a received (gray, dark-ink) bubble — the page is
 * light, so the highlight runs in the multiply blend mode like paper.
 */

function defaults(): SurfaceState {
	return {
		type: 'imessage',
		content: {
			author: 'Wes',
			body: parseAnnotationBodyText(''),
			messages: [
				{
					from: 'them',
					text: parseAnnotationBodyText('ok i finally found it'),
					enter: { start: 0.07, duration: 0.06 }
				},
				{
					from: 'them',
					text: parseAnnotationBodyText(
						'the bottleneck was a [highlight]console.log inside a hot loop[/highlight]'
					),
					tapback: 'heart',
					enter: { start: 0.25, duration: 0.06 },
					typing: { duration: 0.1 }
				},
				{
					from: 'me',
					text: parseAnnotationBodyText("wait that's it??"),
					status: 'read',
					enter: { start: 0.43, duration: 0.06 }
				}
			]
		},
		enter: { start: 0, duration: 0.05, ease: 'settled' }
	};
}

export const imessage: SurfaceRenderer = {
	type: 'imessage',
	label: 'iMessage',
	controls: {
		// The conversation is authored as `content.messages[]`, edited per bubble
		// in the inspector's Messages section; only the contact name reuses a
		// standard slot.
		author: true,
		body: 'never',
		messages: true,
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
		// `flat` substrate — a phone screen, not photographed paper (no fiber grain).
		return createPaperPipeline({ ...opts, substrate: 'flat' });
	}
};
