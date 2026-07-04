/**
 * Identity Spec for the `tear-out` Annotation — per ADR-0015. A graphic
 * focal annotation reading as a torn paper fragment lifted from the
 * substrate. The tear physics (organic torn edge, paper-thickness shadow)
 * are intrinsic; chrome above and around concedes to the Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const tearOutIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a focal passage rendered as a torn paper fragment lifted from the substrate',
	dimensions: [
		{
			name: 'torn-edge-physics',
			definition:
				'The fragment\'s boundary is a value-noise-shaped tear with paper-fibre micro-detail, not a vector polygon or a CSS clip-path.',
			implementation:
				'src/lib/pipelines/annotations/tear-out + tear-edge shader pass — value noise SDF along the fragment boundary; fibre detail at higher frequency multiplied in.',
			probe: {
				kind: 'named-observation',
				region: 'fragment boundary at 400% zoom',
				expectation:
					'boundary is irregular and non-periodic; visible micro-fibre detail at the edge; no vector polyline or pixel-aligned step.'
			}
		},
		{
			name: 'paper-thickness-shadow',
			definition:
				'The torn fragment casts a directional shadow on the substrate beneath it, implying real paper thickness.',
			implementation:
				'src/lib/pipelines/annotations/tear-out — SDF-derived shadow along the implied light vector with falloff matched to fragment thickness.',
			probe: {
				kind: 'named-observation',
				region: 'shadow side of the torn fragment',
				expectation: 'visible directional shadow extending beyond the torn boundary; lit side has minimal shadow.'
			}
		},
		{
			name: 'focal-dim-relationship',
			definition: 'Surrounding (non-focal) body dims while the fragment holds full ink intensity.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § focal slot resolution — non-focal alpha reduced during the focal window.',
			probe: {
				kind: 'named-observation',
				region: 'body text outside the fragment during the focal window',
				expectation: 'non-focal text is visibly dimmer than the fragment\'s text.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'tear-out.fill',
			definition: 'Substrate of the torn fragment (paper colour or claim).',
			probe: {
				kind: 'named-observation',
				region: 'fragment substrate',
				expectation: 'substrate resolves through the tear-out.fill Role.'
			}
		}
	]
};
