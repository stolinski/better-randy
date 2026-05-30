/**
 * Identity Spec for the `title-sequence` Surface — per ADR-0015. A graphic
 * Surface whose claim is a paced title reveal: a kicker drops into place
 * first, the title resolves second, and a subtitle (if present) settles
 * last. Motion-form and frame-relationship are intrinsic; the aesthetic
 * dress concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const titleSequenceIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a paced kicker → title → subtitle reveal sequence anchored to the frame centre',
	dimensions: [
		{
			name: 'fill-treatment',
			implementation:
				'title-sequence CanvasSource — substrate is transparent per the output contract (no painted background behind the title block); title ink arrives via the title-sequence.ink appearance Role.',
			definition: 'Background fill behind the title block.',
			probe: {
				kind: 'named-observation',
				region: 'frame behind the title block',
				expectation: 'no painted fill in the DOM substrate (transparent per the output contract); the deep-black backdrop with the warm upper-left glow is the intrinsic title-sequence-drop shaderPass, not a Pack Role.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'title-sequence.edge',
			definition: 'How the title block meets the frame (rule, scrim, none).',
			probe: {
				kind: 'named-observation',
				region: 'title block boundary',
				expectation: 'edge treatment resolves through the title-sequence.edge Role.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'title-sequence.depth',
			definition: 'Any implied depth under the title text.',
			probe: {
				kind: 'named-observation',
				region: 'beneath the title strokes',
				expectation: 'depth treatment resolves through the title-sequence.depth Role.'
			}
		},
		{
			name: 'light-treatment',
			viaPack: 'title-sequence.light',
			definition: 'Any directional light contribution on the title strokes.',
			probe: {
				kind: 'named-observation',
				region: 'title strokes under any implied light source',
				expectation: 'light treatment resolves through the title-sequence.light Role.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'A three-stage drop with deterministic per-row lag: kicker drops first, title resolves second, subtitle settles last. Each row carries a head-loaded enter curve.',
			implementation:
				'src/lib/pipelines/surfaces/title-sequence/CanvasSource.svelte — per-row enter offsets keyed to surface enter window; ease drawn from engine ease vocabulary.',
			probe: {
				kind: 'named-observation',
				region: 'first ~15% of the timeline across the three rows',
				expectation:
					'kicker arrives before title; title arrives before subtitle; gaps between row arrivals are deterministic and stable across re-renders.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Title block anchors at the frame centre with the three rows stacked on the vertical axis; the surrounding negative space carries the composition.',
			implementation:
				'title-sequence CanvasSource — centred flex column; no off-axis offsets in v1.',
			probe: {
				kind: 'named-observation',
				region: 'title block position within the frame',
				expectation:
					'title block sits on the frame centre axis with equal vertical room above and below the resolved title.'
			}
		}
	]
};
