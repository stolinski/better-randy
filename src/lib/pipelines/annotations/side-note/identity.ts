/**
 * Identity Spec for the `side-note` Annotation — per ADR-0015. A graphic
 * annotation: a margin annotation anchored to a body passage. Anchor
 * relationship is intrinsic; appearance concedes to the Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const sideNoteIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a margin annotation anchored to a passage of body text',
	dimensions: [
		{
			name: 'anchor-relationship',
			definition:
				'The side-note baseline aligns to the anchored passage\'s baseline (or first line of the passage), so the reader\'s eye can connect them without an explicit leader.',
			implementation:
				'src/lib/pipelines/annotations/side-note — note vertical position computed from the anchor passage\'s line-y; no explicit leader line in v1.',
			probe: {
				kind: 'named-observation',
				region: 'side-note baseline vs anchored passage baseline',
				expectation:
					'side-note baseline aligns to the anchored passage\'s baseline within ±2 px; the relationship is visually obvious without a leader.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Side-note anchors to the margin (left or right of the body block), not inline within the body measure.',
			implementation:
				'src/lib/pipelines/annotations/side-note — note placed in a margin slot outside the body measure.',
			probe: {
				kind: 'named-observation',
				region: 'side-note position relative to the body block',
				expectation: 'note is outside the body measure on one side; never overlaps the body inline.'
			}
		},
		{
			name: 'fill-treatment',
			implementation:
				'src/lib/pipelines/annotations/side-note/index.ts — draw() strokes the leader arrow and fills the arrowhead with getCanvasRgbColor(color, …); the `color` is the annotation mark colour from engineState.marks.defaults (engine-state.svelte.ts readMarkColor), not a Pack CSS var.',
			definition: 'Leader/arrowhead colour, taken from the annotation mark colour.',
			probe: {
				kind: 'named-observation',
				region: 'note text colour',
				expectation: 'arrow and arrowhead paint in the mark colour from engineState.marks.defaults[\'side-note\'].color (editor default #1f5aff); no separate Pack fill Role is consumed.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/pipelines/annotations/side-note — enter motion driven by the annotation mark timing; the note reveals on the mark\'s progress window.',
			definition: 'Shape of the note enter motion.',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the note\'s window',
				expectation: 'the leader arrow draws on progressively (arrowSegments gated by drawProgress) and the arrowhead pops in at drawProgress >= 0.65; motion is intrinsic to draw(), not Pack-resolved.'
			}
		}
	]
};
