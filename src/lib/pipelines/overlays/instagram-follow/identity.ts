/**
 * Identity Spec for the `instagram-follow` Overlay — the second platform-
 * faithful creator CTA. Pack-immune per ADR-0038 (the artifact IS Instagram);
 * the press-beat choreography is intrinsic motion-form.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const instagramFollowIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'the real Instagram follow moment — story-ring profile card, blue Follow, press, Following',
	packImmunity: {
		rationale:
			'The artifact IS Instagram: the story-ring gradient, the #0095f6 Follow blue, the Following chip and the platform type voice must read as Instagram under every Pack (the web-document fidelity bar). Only treatments layered on top (mount enter/exit, Effects) take the Pack.'
	},
	dimensions: [
		{
			name: 'artifact-fidelity',
			definition:
				'Ring gradient, avatar treatment, button states, casing and type voice match the platform vocabulary a viewer knows — Instagram’s, not a Pack’s.',
			implementation:
				'src/lib/pipelines/overlays/instagram-follow/CanvasSource.svelte — literal platform palette (story-ring gradient #f9ce34→#ee2a7b→#6228d7, #0095f6 Follow, #efefef/#363636 Following chip, light/dark card) and the SF/Segoe/Roboto system stack; consumes no Pack CSS vars (declared pack-immune).',
			probe: {
				kind: 'named-observation',
				region: 'the card at 200% zoom, before and after the beat, under two Packs',
				expectation:
					'reads instantly as the Instagram follow control in both states; pixels identical across Packs (pack-immune).'
			}
		},
		{
			name: 'motion-form',
			definition:
				'The press beat: button dips (140 ms, zero at both ends), state swaps to Following, the card takes a soft one-shot settle (420 ms, resting at exactly 1) — keyed in real ms off the authored `beat` fraction.',
			implementation:
				'src/lib/pipelines/overlays/instagram-follow/CanvasSource.svelte — pressT/settleT derived purely from animState.globalProgress vs content.beat (frame-deterministic; no CSS transitions; scales emitted only while non-identity so the mount’s exit fade stays capture-safe).',
			probe: {
				kind: 'named-observation',
				region: 'frames straddling the beat (beat −0.02 … +0.1)',
				expectation:
					'blue Follow before; a visible pressed dip at the beat; Following after with a soft card settle; the card’s footprint never changes (both states reserve one grid cell); re-renders are pixel-identical.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'A vertical-first profile card (bottom-centre on Reels-format frames); the beat timing is composition data.',
			implementation:
				'Standard OverlayMount positioning; `beat` is content and rides the draggable `overlay-{id}-beat` timeline sub-track shared with youtube-subscribe.',
			probe: {
				kind: 'named-observation',
				region: 'the timeline row + the rendered card in the vertical demo',
				expectation:
					'dragging the beat clip moves the press moment; the card clears the platform-UI safe bands.'
			}
		}
	]
};
