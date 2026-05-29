/**
 * Identity Spec for the `circle` Annotation — per ADR-0015. Tool-kind: a
 * hand-pulled circle around a passage of body text. Tool physics
 * (incomplete closure, pressure-varied stroke, organic ovality, registration
 * jitter) are intrinsic; colour concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const circleIdentity: IdentitySpec = {
	kind: 'tool',
	claim: 'a hand-pulled circle drawn around a passage of body text',
	dimensions: [
		{
			name: 'incomplete-closure',
			definition:
				'The circle does not close perfectly — start and end points are offset, implying a single hand pass that did not return to its origin.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § circle draw — start angle and arc length seeded from the mark id; arc length is ~340–355° rather than a full 360°.',
			probe: {
				kind: 'named-observation',
				region: 'circle start and end points at 400% zoom',
				expectation: 'visible gap or overshoot between the circle start and end; not a perfect closed ellipse.'
			}
		},
		{
			name: 'stroke-pressure-variation',
			definition:
				'Circle stroke weight varies along the arc, implying real tool pressure.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § circle draw — per-step stroke width modulated by deterministic noise on the mark id and angular position.',
			probe: {
				kind: 'named-observation',
				region: 'circle arc at 400% zoom',
				expectation: 'stroke thickness varies along the arc; no constant-width vector ring.'
			}
		},
		{
			name: 'organic-ovality',
			definition:
				'The circle is slightly oval and rotated off frame axes, implying a hand-drawn shape rather than a vector geometric ring.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § circle draw — axis ratio + rotation seeded from the mark id (ratio in ~[0.85, 1.0], rotation ±10°).',
			probe: {
				kind: 'named-observation',
				region: 'circle shape relative to a true geometric ring',
				expectation: 'visible ovality and rotation; the shape is deterministic per mark id.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'circle.fill',
			definition: 'Circle ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'circle colour',
				expectation: 'colour resolves through the circle.fill Role.'
			}
		}
	]
};
