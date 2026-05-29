/**
 * Identity Spec for the `washi-tape` Overlay — per ADR-0015. A material-kind
 * Overlay: a strip of decorative adhesive tape with translucent body,
 * fibrous edges, and a real-tape shadow under directional light. All
 * dimensions are intrinsic to the material claim per ADR-0009.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const washiTapeIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a strip of translucent washi tape adhered to the substrate at a free rotation',
	dimensions: [
		{
			name: 'translucent-body',
			definition:
				'Tape body shows the substrate beneath it through its fill, with a coloured tint that does not fully occlude.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape — tape body alpha ~0.55–0.75 with a tint multiplied over the substrate sample.',
			probe: {
				kind: 'named-observation',
				region: 'tape body over a region of substrate with visible content',
				expectation:
					'substrate detail (texture, text, photo) is visible through the tape body; tape is not opaque.'
			}
		},
		{
			name: 'fibrous-edge',
			definition:
				'Tape edges show fibre detail along the long axis, implying real torn tape rather than a CSS rectangle.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape + tear-edge shader pass — high-frequency value noise modulating alpha along the long edges.',
			probe: {
				kind: 'named-observation',
				region: 'tape long edge at 400% zoom',
				expectation: 'visible fibre micro-detail along the edge; no pixel-aligned step.'
			}
		},
		{
			name: 'directional-shadow',
			definition:
				'Tape casts a directional shadow on the substrate beneath it, implying real tape thickness.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape — SDF-derived shadow along the implied light vector; falloff matched to tape thickness.',
			probe: {
				kind: 'named-observation',
				region: 'shadow side of the tape',
				expectation: 'visible directional shadow extending beyond the tape boundary; lit side has minimal shadow.'
			}
		},
		{
			name: 'free-rotation',
			definition:
				'Tape sits at a seeded rotation off frame axes, implying a hand-placed strip rather than a snapped rectangle.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape — rotation seeded from the overlay id via hashStringToUnitInterval.',
			probe: {
				kind: 'named-observation',
				region: 'tape axis relative to canvas axes',
				expectation: 'tape axis is rotated 5–25° from canvas horizontal; angle is deterministic per overlay id.'
			}
		}
	]
};
