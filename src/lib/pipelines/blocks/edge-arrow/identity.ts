/**
 * Identity Spec for the `edge-arrow` diagram Block (ADR-0036 §4) — a directed
 * connection whose ROUTE is content (authored endpoints + control point) and
 * whose STROKE is appearance (Pack Roles): syntax draws a hand-wobbled marker
 * line, editorial-mono a clean printed rule, a CRT pack a phosphor plotter
 * line. A hand-wobbled arrow under CRT is that pack's own aesthetic-miss —
 * which is exactly why the stroke can't be baked into the primitive.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const edgeArrowIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a deliberately routed, drawn-on directed connection between diagram points',
	dimensions: [
		{
			name: 'stroke-treatment',
			viaPack: 'diagram.stroke',
			definition: 'Line character: colour (ink sentinel or hex), width, hand-wobble amount.',
			probe: {
				kind: 'named-observation',
				region: 'an edge-arrow stroke at 200% zoom under two Packs',
				expectation:
					'syntax shows the multi-frequency marker wobble; a pack resolving wobble 0 draws the same route dead straight — the route is identical, only the stroke changes.'
			}
		},
		{
			name: 'arrowhead-form',
			viaPack: 'diagram.arrowhead',
			definition: 'Head form at the directed end(s): solid triangle, open chevron, or none.',
			probe: {
				kind: 'named-observation',
				region: 'the arrow tip at full draw',
				expectation:
					'head form resolves through the diagram.arrowhead Role, oriented along the path tangent.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/annotations/diagram-strokes.ts strokePartialPath — draw-on along the authored route on the blockProgresses scalar (steady power1.inOut, the Marks’ craft rule), the arrowhead riding the drawing tip; exit fades alpha, never un-draws.',
			definition: 'Draw-on reveal along the route.',
			probe: {
				kind: 'named-observation',
				region: 'an edge mid-enter (~50% of its window)',
				expectation:
					'ink covers ~half the route with the head at the ink tip — a pen drag, not a fading stamp.'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/annotations/diagram-strokes.ts resolveEndpoint + rectBoundaryPoint — endpoints resolve to node centres then inset to the node’s rendered boundary plus a stroke-scaled gap, so an arrow meets a node, never tunnels under it.',
			definition: 'How the edge meets its endpoints.',
			probe: {
				kind: 'named-observation',
				region: 'an edge terminating at a box node',
				expectation:
					'the stroke stops at the card boundary with a small gap; no ink under the card.'
			}
		}
	]
};
