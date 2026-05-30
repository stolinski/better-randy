/**
 * Identity Spec for the `watermark` Overlay — per ADR-0015. A graphic
 * Overlay: a small, mono-set channel signature in a corner of the frame.
 * Frame-relationship and the mono signature are intrinsic; appearance
 * concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const watermarkIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a small mono-set channel signature anchored to a frame corner',
	dimensions: [
		{
			name: 'frame-relationship',
			definition:
				'Watermark anchors to a frame corner (bottom-right by default) with a deterministic offset that keeps it clear of the frame edge.',
			implementation:
				'src/lib/pipelines/overlays/watermark — OverlayPosition resolved via the engine\'s anchor + offset model; default position bottom-right with a small inset.',
			probe: {
				kind: 'named-observation',
				region: 'watermark position within the frame',
				expectation:
					'watermark sits in a frame corner with a measurable offset from both adjacent edges; never touches the frame boundary.'
			}
		},
		{
			name: 'mono-signature',
			definition:
				'Watermark text is set in the active Pack\'s mono family (the channel signature thread), not in the body/display family.',
			implementation:
				'src/lib/pipelines/overlays/watermark/CanvasSource.svelte — text element uses the Pack-resolved mono font stack.',
			probe: {
				kind: 'named-observation',
				region: 'watermark text glyphs',
				expectation: 'glyphs are monospaced; the mono family is the Pack-resolved signature mono, not a generic system mono.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'watermark.ink',
			definition: 'Watermark ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'watermark glyph colour',
				expectation: 'colour resolves through the watermark.ink Role.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/pipelines/overlays/watermark/CanvasSource.svelte — watermark fade-through enter motion driven by the overlay mount enter/exit timing.',
			definition: 'Shape of the watermark enter motion (fade, hold, none).',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline on the watermark',
				expectation: 'enter motion is a fade-through driven by the overlay mount enter/exit timing; it is intrinsic to the Pipeline, not Pack-resolved.'
			}
		}
	]
};
