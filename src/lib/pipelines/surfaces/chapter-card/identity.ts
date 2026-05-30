/**
 * Identity Spec for the `chapter-card` Surface — per ADR-0015. A
 * compositional Surface whose claim is a structured chapter title block
 * (kicker + title + optional subtitle) anchored to a deliberate frame
 * position with a staggered enter sequence across the three text rows.
 * Motion-form and frame-relationship are intrinsic; fill / edge / depth /
 * light concede to the active Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const chapterCardIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'a three-row chapter title block with staggered enter sequence anchored to a frame quadrant',
	dimensions: [
		{
			name: 'fill-treatment',
			implementation:
				'src/lib/pipelines/surfaces/chapter-card/CanvasSource.svelte — card substrate is transparent per the output contract (no painted body); chrome colors come via the chapter-card.ink/base/kicker/rule appearance Roles.',
			definition: 'Background fill or substrate behind the chapter block.',
			probe: {
				kind: 'named-observation',
				region: 'card body behind the text rows',
				expectation: 'card body behind the text reads as transparent (no painted substrate); the cinematic backdrop is the only thing visible behind the rows.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'chapter-card.edge',
			definition: 'How the card boundary meets the frame (rule, scrim, torn, none).',
			probe: {
				kind: 'named-observation',
				region: 'card boundary',
				expectation: 'edge treatment resolves through the chapter-card.edge Role.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'chapter-card.depth',
			definition: 'Any implied depth under the card.',
			probe: {
				kind: 'named-observation',
				region: 'beneath the card boundary',
				expectation: 'depth treatment resolves through the chapter-card.depth Role.'
			}
		},
		{
			name: 'light-treatment',
			viaPack: 'chapter-card.light',
			definition: 'Any directional light contribution on the card body or text.',
			probe: {
				kind: 'named-observation',
				region: 'card surface and text strokes',
				expectation: 'light treatment resolves through the chapter-card.light Role.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'Three-row staggered enter sequence with a fixed lag between kicker, title, and subtitle, and a head-loaded ease curve.',
			implementation:
				'src/lib/pipelines/surfaces/chapter-card/CanvasSource.svelte — per-row enter timing computed from the surface enter window with per-row offsets; ease applied via the engine ease vocabulary.',
			probe: {
				kind: 'named-observation',
				region: 'first ~12% of the timeline across the three rows',
				expectation:
					'kicker enters first; title enters after a measurable lag; subtitle (if present) enters last; all three are stable by the end of the enter window.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Card anchors to a single frame quadrant declared per-preset; counter-empty space is left intact to carry the compositional balance.',
			implementation:
				'src/lib/pipelines/surfaces/chapter-card/CanvasSource.svelte — anchor + offset applied via CSS transform; the counter-quadrant carries no chrome by design.',
			probe: {
				kind: 'named-observation',
				region: 'card position within the frame',
				expectation:
					'card occupies one quadrant of the frame; the diagonally opposite quadrant is empty (no chrome, no extra text).'
			}
		}
	]
};
