/**
 * Identity Spec for the `timeline-segment` diagram Block (ADR-0036) — a
 * spanned interval with explicit endpoints; the H↔V reflow stress case
 * (reflow repositions endpoints, never reshapes the primitive).
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const timelineSegmentIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a drawn-on interval span with end ticks and a caption',
	dimensions: [
		{
			name: 'stroke-treatment',
			viaPack: 'diagram.stroke',
			definition: 'Span rule character: colour, width, hand-wobble — shared with edge-arrow.',
			probe: {
				kind: 'named-observation',
				region: 'the span rule at 200% zoom',
				expectation: 'the rule carries the same Pack stroke as edge-arrows (one diagram, one pen).'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/annotations/diagram-strokes.ts drawTimelineSegment — the rule draws on along the span (blockProgresses), start tick with the first ink, far tick landing as the span completes; caption rises via DiagramMount intrinsicStyle.',
			definition: 'Draw-on of the span and its end ticks.',
			probe: {
				kind: 'named-observation',
				region: 'a segment mid-enter and at enter end',
				expectation:
					'mid-enter shows a partial rule with only the start tick; at completion both ticks are planted.'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/annotations/diagram-strokes.ts drawTimelineSegment + DiagramMount centerFor — endpoints are explicit composition fractions; the caption centres above the span midpoint. A vertical preset re-authors the endpoints (H↔V reflow is repositioning, not reshaping).',
			definition: 'How the span occupies the frame across orientations.',
			probe: {
				kind: 'named-observation',
				region: 'the same segment in horizontal and vertical presets',
				expectation:
					'both orientations render the identical primitive along their authored axes; nothing about the mark itself changes.'
			}
		}
	]
};
