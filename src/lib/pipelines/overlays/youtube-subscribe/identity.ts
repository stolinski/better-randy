/**
 * Identity Spec for the `youtube-subscribe` Overlay — a platform-faithful
 * creator CTA. The artifact's whole value is fidelity to YouTube's own UI, so
 * it declares Pack-immunity (ADR-0038); the press-beat choreography is
 * intrinsic motion-form (ADR-0033/0035 discipline: motion never concedes).
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const youtubeSubscribeIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'the real YouTube subscribe moment — channel card, red pill, press, check, bell ring',
	packImmunity: {
		rationale:
			'The artifact IS YouTube: the red pill, the Subscribed chip, the bell, the Roboto voice must read as the platform under every Pack — a viewer must recognise the real subscribe control instantly (the web-document fidelity bar). Only treatments layered on top (mount enter/exit, Effects) take the Pack.'
	},
	dimensions: [
		{
			name: 'artifact-fidelity',
			definition:
				'The card, pill, chip, check, and bell match the platform vocabulary a viewer knows — colours, radii, casing, and type voice are YouTube’s, not a Pack’s.',
			implementation:
				'src/lib/pipelines/overlays/youtube-subscribe/CanvasSource.svelte — literal platform palette (#ff0033 pill, #f2f2f2/#3f3f3f subscribed chip, light/dark card) and the Roboto stack; consumes no Pack CSS vars (declared pack-immune).',
			probe: {
				kind: 'named-observation',
				region: 'the card at 200% zoom, before and after the beat, under two Packs',
				expectation:
					'reads instantly as the YouTube subscribe control in both states; pixels identical across Packs (pack-immune).'
			}
		},
		{
			name: 'motion-form',
			definition:
				'The press is ONE continuous gesture, never a jump-cut: the pill squashes down (110 ms eased, to 0.92), the state swap hides inside the squash bottom, the release overshoots and settles (210 ms, resting at exactly 1) while the fill morphs red → chip grey per frame (220 ms) and the check draws on along its path (240 ms, trailing 60 ms); the bell rings in with a decaying wiggle (650 ms, resting at exactly 0) and a ripple leaves the pill — all keyed in real ms off the authored `beat` fraction.',
			implementation:
				'src/lib/pipelines/overlays/youtube-subscribe/CanvasSource.svelte — pressScale/morphT/checkT/ringT/rippleT derived purely from animState.globalProgress vs content.beat (frame-deterministic; no CSS transitions; color morph computed via mixHexColors per frame; transforms and morph styles emitted only while non-identity so the mount’s exit fade stays capture-safe).',
			probe: {
				kind: 'named-observation',
				region: 'frames straddling the beat (beat −0.02 … +0.12)',
				expectation:
					'red pill before; a visible squash at the beat; the label swap lands inside the squash bottom; the fill passes through intermediate red-to-grey mixes (a mid-morph frame is visibly pink) while the check stroke lengthens; bell rings in and settles to rest; nothing pops binary; the same frames re-render pixel-identically.'
			}
		},
		{
			name: 'frame-relationship',
			definition: 'A corner-anchored creator lower-third; timing of the beat is composition data.',
			implementation:
				"Standard OverlayMount positioning (anchor/offset/scale); `beat` is content and rides the draggable subtrack identified by `createTimelineTrackId({ kind: 'overlay-subtrack', overlayId, subtrack: { kind: 'beat' } })`, like the counter’s roll.",
			probe: {
				kind: 'named-observation',
				region: 'the timeline row + the rendered card',
				expectation:
					'dragging the beat clip moves the press moment; the card sits at its authored anchor inside safe zones.'
			}
		}
	]
};
