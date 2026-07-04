/**
 * Identity Spec for the `imessage` Surface — per ADR-0015.
 *
 * Claims to be a live iOS Messages conversation, not a static card: the value is
 * the choreography. Every declared dimension is implemented in the CanvasSource
 * (driven by `animState.globalProgress`, so it is frame-deterministic) and the
 * highlight rides the reused `paper` Pipeline marks. See
 * docs/adr/0031-imessage-interactive-surface.md.
 *
 * The artifact is Pack-IMMUNE by declaration (ADR-0038): the iOS bubble
 * palette and Messages chrome are the claim itself, so the Surface skips
 * appearance-var injection. Treatments layered on top (the highlight mark,
 * edge/depth, Effects) still resolve from the active Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const imessageIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a live iOS Messages conversation',
	packImmunity: {
		rationale:
			'The artifact IS iOS Messages: the gray-received / blue-sent bubble palette, tail curls, and conversation chrome must stay Apple-faithful under every Pack, or the claim collapses. Only treatments layered on top (highlight marks, edge/depth, Effects) take the Pack.'
	},
	dimensions: [
		{
			name: 'conversation-bubbles',
			definition:
				'Received messages are gray bubbles on the left, sent messages are blue bubbles on the right, each with the iMessage tail curl at its bottom corner. In the default `chrome: "window"` mode they sit under an iOS conversation header (back chevron, centered contact avatar + name, FaceTime icon) with a timestamp and composer bar; in `chrome: "none"` there is no window at all (see chromeless-film-insert). Either way it reads as Messages, not a generic chat.',
			implementation:
				'src/lib/pipelines/surfaces/imessage/CanvasSource.svelte — `.im-bubble[data-from]` sets side/colour + the tail (two-pseudo page-cutout in window mode; single radial-gradient-to-transparent pseudo in chromeless); `.im-header` / timestamp / composer render only when `chrome ?? "window"` is `window`.',
			probe: {
				kind: 'named-observation',
				region: 'the message column (and, in window mode, the top header)',
				expectation:
					'gray left-aligned received bubbles and blue right-aligned sent bubbles, each with a tail at the inner-bottom corner; in window mode an iOS header with the contact name sits above the thread, in chromeless mode no header exists.'
			}
		},
		{
			name: 'chromeless-film-insert',
			definition:
				'With `chrome: "none"` the surface is the movie treatment of a text conversation: NOTHING but the bubbles floats over the footage — no Messages window, page background, header, timestamp, or composer bar. Every painted edge cuts to genuine transparency (the tail curls and the tapback ring never paint a page-colored block), and a localized substrate-darken radial vignette (≤ 30% of the frame) rises under the thread with the surface visibility ramp so the bubbles stay legible over any footage grade.',
			implementation:
				'src/lib/pipelines/surfaces/imessage/CanvasSource.svelte — `chrome ?? "window"` gates `.imessage--chromeless` (transparent page, no radius, header/timestamp/composer dropped from the DOM); the tail repaints as a radial-gradient-to-transparent pseudo and the tapback ring goes `border-color: transparent`; `.im-vignette` (plain radial-gradient, frame-pixel-sized, z-index below the tails) multiplies its opacity by `layout.visibility`. No CSS filter anywhere in the captured DOM.',
			probe: {
				kind: 'named-observation',
				region:
					'the frame around and between the bubbles, the tail corner of the last bubble in a run, and the tapbacked bubble corner, in a `chrome: "none"` preset',
				expectation:
					'no window, header, timestamp, or composer anywhere in the frame; the area between/around bubbles is transparent (footage or checkerboard shows through) except a soft localized radial darkening behind the thread column covering ≤ 30% of the frame; the tail curls and the tapback badge edge show no opaque page-colored blocks.'
			}
		},
		{
			name: 'choreographed-arrival',
			definition:
				'The conversation plays out over the clip: bubbles pop in one-by-one with the iOS scale-from-the-tail spring, and a three-dot typing indicator appears before a reply and resolves into its bubble — not a static thread shown all at once.',
			implementation:
				'src/lib/pipelines/surfaces/imessage/CanvasSource.svelte — `bubbleStyle` scales/fades each bubble from `appearAt(i)` (easeOutBack), `isTyping` + `dotOpacity` drive the typing indicator in the lead window before a `them` reply; all timed off `animState.globalProgress`.',
			probe: {
				kind: 'named-observation',
				region: 'the same bubble across progress 0.1, 0.2, 0.5',
				expectation:
					'bubbles are absent early and present later; at least one reply is preceded by an animated three-dot typing indicator that is replaced by the bubble.'
			}
		},
		{
			name: 'highlight-on-bubble',
			definition:
				'The channel’s hand-pulled highlighter marks a phrase inside a received (gray, dark-ink) bubble in the multiply blend mode, so the dark bubble text stays readable under the amber band — the same mark vocabulary as paper, now on a chat bubble.',
			implementation:
				'src/lib/pipelines/surfaces/imessage/CanvasSource.svelte renders the bubble text through DocumentBody (emitting `data-annotation-mark` spans); the reused `paper` Pipeline draws the highlight, and the white page luminance selects the light/multiply mode.',
			probe: {
				kind: 'named-observation',
				region: 'the received bubble carrying the `[highlight]` span at a progress past the mark draw-on',
				expectation:
					'an amber highlight band sits over a phrase inside a gray bubble with the dark bubble text still legible through it (multiply), not punched to ink.'
			}
		},
		{
			name: 'receipts-and-tapback',
			definition:
				'The conversation carries the small iMessage tells: a delivered → read receipt fades in under the last sent (blue) bubble, and a tapback reaction badge pops onto a bubble.',
			implementation:
				'src/lib/pipelines/surfaces/imessage/CanvasSource.svelte — `receiptLabel` swaps Delivered→Read under a sent bubble with a `status`, and `.im-tapback` (scaled in by `tapbackScale`) renders a reaction badge on a bubble with a `tapback`.',
			probe: {
				kind: 'named-observation',
				region: 'under the last blue bubble, and the corner of a tapbacked bubble, late in the clip',
				expectation:
					'a small right-aligned "Read" (or "Delivered") label sits under the last sent bubble, and a circular tapback badge overlaps the corner of a bubble.'
			}
		}
	]
};
