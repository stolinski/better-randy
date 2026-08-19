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
				expectation:
					'focal passage is visibly translated upward and slightly scaled relative to its inline neighbours.'
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
			implementation:
				'src/lib/pipelines/annotations/lift-out/index.ts — the focal-slot lift and occlusion are packed intrinsically into the annotation focal slot.',
			definition: 'Intrinsic depth cue produced by the lifted focal-slot transform.',
			probe: {
				kind: 'named-observation',
				region: 'beneath the lifted passage',
				expectation:
					'the lift transform supplies the depth cue without a Pack-specific shadow Role.'
			}
		},
		{
			name: 'edge-treatment',
			implementation:
				'src/lib/pipelines/annotations/lift-out/index.ts — focal-slot geometry preserves the captured glyph boundary; no separate lifted plate edge is rendered.',
			definition: 'The captured glyph boundary remains the lifted slot edge.',
			probe: {
				kind: 'named-observation',
				region: 'boundary of the lifted passage',
				expectation: 'the lifted passage keeps its intrinsic glyph boundary with no Pack edge pass.'
			}
		}
	]
};
