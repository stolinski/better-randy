/**
 * Identity Spec for the `imessage` Surface — per ADR-0015.
 *
 * Claims to be a live iOS Messages conversation, not a static card: the value is
 * the choreography. Every declared dimension is implemented in the CanvasSource
 * (driven by `animState.globalProgress`, so it is frame-deterministic) and the
 * highlight rides the reused `paper` Pipeline marks. See
 * docs/adr/0031-imessage-interactive-surface.md.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const imessageIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a live iOS Messages conversation',
	dimensions: [
		{
			name: 'conversation-bubbles',
			definition:
				'Received messages are gray bubbles on the left, sent messages are blue bubbles on the right, each with the iMessage tail curl at its bottom corner, under an iOS conversation header (back chevron, centered contact avatar + name, FaceTime icon). It reads as Messages, not a generic chat.',
			implementation:
				'src/lib/pipelines/surfaces/imessage/CanvasSource.svelte — `.im-bubble[data-from]` sets side/colour + the two-pseudo tail; `.im-header` renders the chevron / avatar / name / FaceTime icon.',
			probe: {
				kind: 'named-observation',
				region: 'the message column and the top header',
				expectation:
					'gray left-aligned received bubbles and blue right-aligned sent bubbles, each with a tail at the inner-bottom corner, beneath an iOS header showing the contact name.'
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
