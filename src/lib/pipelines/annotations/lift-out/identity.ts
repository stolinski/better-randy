/**
 * Identity Spec for the `lift-out` Annotation — per ADR-0015. A graphic
 * focal annotation: a passage rises out of its inline body position and
 * floats at a fixed offset, with the surrounding body dimming and the lifted
 * passage gaining a depth shadow. Vertical-translation motion and the
 * focal-dim relationship are intrinsic; chrome concedes to the Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const liftOutIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a passage that rises out of inline flow into a floating focal slot',
	dimensions: [
		{
			name: 'lift-translation',
			definition:
				'The focal passage translates vertically (and slightly out-of-plane via scale) into a deterministic offset; surrounding body remains in place.',
			implementation:
				'src/lib/pipelines/annotations/lift-out — focal slot transform: translateY + scale(1.05–1.1) over the focal enter window; rest of body unchanged.',
			probe: {
				kind: 'named-observation',
				region: 'focal passage vs surrounding body during the focal window',
				expectation: 'focal passage is visibly translated upward and slightly scaled relative to its inline neighbours.'
			}
		},
		{
			name: 'focal-dim-relationship',
			definition:
				'Surrounding (non-focal) body dims while the focal passage holds full ink intensity.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § focal slot resolution — non-focal alpha reduced during the focal window.',
			probe: {
				kind: 'named-observation',
				region: 'body text outside the focal passage during the focal window',
				expectation: 'non-focal text is visibly dimmer than focal text.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'lift-out.depth',
			definition: 'Implied depth under the lifted passage (shadow, ambient occlusion).',
			probe: {
				kind: 'named-observation',
				region: 'beneath the lifted passage',
				expectation: 'depth treatment resolves through the lift-out.depth Role.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'lift-out.edge',
			definition: 'Edge behaviour of the lifted slot.',
			probe: {
				kind: 'named-observation',
				region: 'boundary of the lifted passage',
				expectation: 'edge treatment resolves through the lift-out.edge Role.'
			}
		}
	]
};
