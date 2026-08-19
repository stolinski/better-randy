/**
 * Identity Spec for the `isolate` Annotation — per ADR-0015. A graphic
 * focal annotation: nothing about the focal passage changes — instead the
 * surrounding body dims dramatically, so the focal reads by absence of
 * neighbour competition rather than by intrinsic emphasis. The dim-others
 * relationship is intrinsic; the dim depth concedes to the Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const isolateIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a focal passage emphasized by dramatically dimming everything else',
	dimensions: [
		{
			name: 'asymmetric-dim',
			definition:
				'Non-focal body alpha drops to a low value while focal passage alpha holds at 1.0; the dim ratio is dramatic (≥ 3×) rather than the subtle dim used by `magnify` and `lift-out`.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § isolate focal resolution — non-focal alpha clamped to 0.15–0.25 (vs ~0.35 for magnify/lift-out).',
			probe: {
				kind: 'named-observation',
				region: 'focal vs non-focal body during the focal window',
				expectation:
					'focal passage alpha is ≥ 3× the non-focal alpha; the dim is dramatic enough to read as deliberate isolation rather than subtle attention.'
			}
		},
		{
			name: 'motion-form',
			definition: 'The dim transition is monotonic and head-loaded over the focal enter window.',
			implementation:
				'src/lib/pipelines/annotations/isolate — alpha ramp uses the active mark timing ease; never overshoots or oscillates.',
			probe: {
				kind: 'named-observation',
				region: 'first ~20% of the focal window',
				expectation:
					'non-focal alpha drops monotonically without oscillation; the curve is head-loaded (most of the dim arrives in the first third of the window).'
			}
		},
		{
			name: 'depth-treatment',
			implementation:
				'src/lib/pipelines/annotations/isolate/index.ts — the focal-slot dim ratio is the complete intrinsic separation treatment; no blur, tint, or Pack depth pass is applied.',
			definition: 'Intrinsic alpha separation between the focal and dimmed body.',
			probe: {
				kind: 'named-observation',
				region: 'dimmed body during the focal window',
				expectation: 'isolation is produced only by the intrinsic focal/non-focal alpha ratio.'
			}
		}
	]
};
