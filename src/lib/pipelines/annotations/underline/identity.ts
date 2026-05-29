/**
 * Identity Spec for the `underline` Annotation — per ADR-0015. Tool-kind:
 * a hand-pulled underline beneath a passage of body text. Tool physics
 * (pressure-varied stroke weight, sub-baseline drift, end-cap onset/lift)
 * are intrinsic; colour concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const underlineIdentity: IdentitySpec = {
	kind: 'tool',
	claim: 'a hand-pulled underline beneath a passage of body text',
	dimensions: [
		{
			name: 'stroke-weight-variation',
			definition:
				'Underline stroke thickness varies along its length, implying real tool pressure rather than a constant-width vector rule.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § underline draw — per-pixel stroke height modulated by deterministic noise on the mark id.',
			probe: {
				kind: 'named-observation',
				region: 'a single underline at 400% zoom',
				expectation: 'stroke thickness varies along the line; no constant vector rule.'
			}
		},
		{
			name: 'baseline-drift',
			definition:
				'Underline drifts ±0–2 px below the glyph baseline along its length, implying a hand-pulled stroke that does not perfectly trace the type baseline.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § underline draw — vertical offset modulated by deterministic noise; magnitude proportional to underline length.',
			probe: {
				kind: 'named-observation',
				region: 'underline vertical position along its length',
				expectation: 'underline is not a perfectly horizontal vector; offset is stable across re-renders.'
			}
		},
		{
			name: 'end-cap-behaviour',
			definition:
				'Underline ends taper rather than terminating with a hard vertical edge.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § underline draw — soft alpha ramp at both ends.',
			probe: {
				kind: 'named-observation',
				region: 'underline endpoints at 400% zoom',
				expectation: 'both endpoints taper to alpha 0; no hard vertical termination.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'underline.fill',
			definition: 'Underline ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'underline colour',
				expectation: 'colour resolves through the underline.fill Role.'
			}
		}
	]
};
