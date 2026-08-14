import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const tweetStackIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'multiple recognizable X posts accumulating into a deterministic overlapping reaction pile',
	packImmunity: {
		rationale:
			'The cards are found X documents: platform palette, iconography, radii, and interface type remain literal under every Pack. The surrounding composition, timing, placement, and Effects remain Pack/composition-owned.'
	},
	dimensions: [
		{
			name: 'artifact-fidelity',
			definition:
				'Each card preserves the identity, text, timestamp, and action anatomy of an X post.',
			implementation:
				'src/lib/pipelines/overlays/tweet-stack/CanvasSource.svelte renders the literal X Dim palette, avatar/name/handle hierarchy, post body, date, X mark, and action icons.',
			probe: {
				kind: 'named-observation',
				region: 'each landed card under two Packs',
				expectation:
					'every card reads instantly as an X post and remains pixel-identical across Packs.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'Posts arrive one at a time along alternating vectors, settle into varied rotations, hold without drift, and leave in reverse pile order.',
			implementation:
				'src/lib/pipelines/overlays/tweet-stack/tweet-stack-motion.ts resolveTweetStackCardMotion derives every card state only from authored progress, index, count, and spread.',
			probe: {
				kind: 'named-observation',
				region: 'pile window start, midpoint, endpoint, and exit',
				expectation:
					'arrival order is sequential, landed cards are still, reverse exit is compact, and repeated frames are identical.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'A centered pile that widens and enlarges for vertical delivery while remaining inside platform safe areas.',
			implementation:
				'src/lib/pipelines/overlays/tweet-stack/tweet-stack-frame-layout.ts resolveTweetStackFrameLayout plus centered Overlay placement.',
			probe: {
				kind: 'named-observation',
				region: 'full native horizontal and vertical frames',
				expectation:
					'the complete pile stays inside safe areas with readable post text and no clipping.'
			}
		}
	]
};
