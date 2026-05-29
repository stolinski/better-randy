/**
 * Identity Spec for the `callout` Annotation — per ADR-0015. A graphic
 * annotation: a labeled box with a leader line pointing at a passage. The
 * leader geometry (anchor + endpoint resolution) is intrinsic; the chrome
 * concedes to the Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const calloutIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a labeled box pointing at a passage of body text via a leader line',
	dimensions: [
		{
			name: 'leader-geometry',
			definition:
				'The leader line runs from the callout box edge to the anchored passage, terminating at the passage edge (not in its centre), with a deterministic offset that avoids running across the body text.',
			implementation:
				'src/lib/pipelines/annotations/callout — leader endpoint computed from the anchor passage layout; routed to avoid the body measure where possible.',
			probe: {
				kind: 'named-observation',
				region: 'leader line endpoints',
				expectation:
					'one end attaches to a side of the callout box; the other end terminates at the anchored passage edge; line never runs across unrelated body text.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'callout.boxFill',
			definition: 'Callout box fill.',
			probe: {
				kind: 'named-observation',
				region: 'callout box body',
				expectation: 'fill resolves through the callout.boxFill Role.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'callout.boxEdge',
			definition: 'Callout box boundary treatment.',
			probe: {
				kind: 'named-observation',
				region: 'callout box boundary',
				expectation: 'edge treatment resolves through the callout.boxEdge Role.'
			}
		},
		{
			name: 'motion-form',
			viaPack: 'callout.enterMotion',
			definition: 'Shape of the callout enter motion.',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the callout window',
				expectation: 'enter motion resolves through the callout.enterMotion Role.'
			}
		}
	]
};
