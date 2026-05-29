/**
 * Identity Spec for the `box` Annotation — per ADR-0015. Tool-kind: a
 * hand-pulled rectangular outline around a passage. Tool physics (corner
 * over/undershoot, stroke pressure variation, registration jitter) are
 * intrinsic; colour concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const boxIdentity: IdentitySpec = {
	kind: 'tool',
	claim: 'a hand-pulled four-sided box drawn around a passage of body text',
	dimensions: [
		{
			name: 'corner-overshoot',
			definition:
				'Box corners over- or under-shoot the geometric ideal, implying a hand pass that crossed at each corner rather than vector-clean joins.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § box draw — per-corner overshoot offset seeded from the mark id (±3 px on each axis).',
			probe: {
				kind: 'named-observation',
				region: 'each box corner at 400% zoom',
				expectation: 'corners do not join cleanly; visible overshoot or undershoot at each corner; offsets are stable across re-renders.'
			}
		},
		{
			name: 'stroke-pressure-variation',
			definition: 'Stroke weight varies along each edge, implying real tool pressure.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § box draw — per-step stroke width modulated by deterministic noise.',
			probe: {
				kind: 'named-observation',
				region: 'a single box edge at 400% zoom',
				expectation: 'stroke thickness varies along the edge; no constant-width vector rule.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'box.fill',
			definition: 'Box ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'box stroke colour',
				expectation: 'colour resolves through the box.fill Role.'
			}
		}
	]
};
