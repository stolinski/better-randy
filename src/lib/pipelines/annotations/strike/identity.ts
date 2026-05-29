/**
 * Identity Spec for the `strike` Annotation — per ADR-0015. Tool-kind: a
 * hand-pulled strike through a passage of body text. Tool physics (pressure,
 * mid-x-height drift, end-cap, single-pass character) are intrinsic; colour
 * concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const strikeIdentity: IdentitySpec = {
	kind: 'tool',
	claim: 'a single hand-pulled strike through a passage of body text',
	dimensions: [
		{
			name: 'stroke-weight-variation',
			definition:
				'Stroke weight varies along the strike length, implying real tool pressure rather than a constant-width vector rule.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § strike draw — per-pixel stroke height modulated by deterministic noise on the mark id.',
			probe: {
				kind: 'named-observation',
				region: 'a single strike at 400% zoom',
				expectation: 'stroke thickness varies along the line; no constant vector rule.'
			}
		},
		{
			name: 'mid-x-height-drift',
			definition:
				'Strike vertical position drifts within the x-height band, implying a hand-pulled stroke that does not perfectly bisect the glyphs.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § strike draw — vertical offset modulated by deterministic noise within ±0.15 of x-height.',
			probe: {
				kind: 'named-observation',
				region: 'strike vertical position along its length',
				expectation: 'strike is not a perfectly horizontal vector; offset stays within the x-height band.'
			}
		},
		{
			name: 'single-pass-character',
			definition:
				'The strike reads as a single hand pass rather than a layered fill — slight transparency where stroke pressure is light.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § strike draw — alpha modulated by stroke-pressure noise; minimum alpha ~0.6.',
			probe: {
				kind: 'named-observation',
				region: 'strike alpha along its length at 400% zoom',
				expectation: 'visible alpha variation along the strike; lightest passages are partly transparent over the underlying glyph.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'strike.fill',
			definition: 'Strike ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'strike colour',
				expectation: 'colour resolves through the strike.fill Role.'
			}
		}
	]
};
