/**
 * Identity Spec for the `node` diagram Block (ADR-0036) — a labeled point in
 * an art-directed diagram. Which form (pin / box / dot) is content the author
 * picks; HOW that form looks concedes to the Pack; the entrance motion is
 * intrinsic (motion never concedes to a Pack).
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const nodeIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'a deliberately placed diagram point — pin, box, or dot — that reads as designed graphics, not a defaulted div',
	dimensions: [
		{
			name: 'fill-treatment',
			viaPack: 'node.fill',
			definition: 'Box-form card fill colour.',
			probe: {
				kind: 'named-observation',
				region: 'a box-form node at 200% zoom',
				expectation:
					'card fill resolves through the node.fill Role (core fill fallback); not a hardcoded hex in the component.'
			}
		},
		{
			name: 'accent-treatment',
			viaPack: 'node.accent',
			definition: 'Pin body / dot marker colour.',
			probe: {
				kind: 'named-observation',
				region: 'a pin-form node',
				expectation: 'pin body colour resolves through the node.accent Role (core accent fallback).'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'node.depth',
			definition: 'Box-form card shadow rig.',
			probe: {
				kind: 'named-observation',
				region: 'a box-form node edge',
				expectation:
					'the card shadow resolves through node.depth → core depth-treatment (syntax: hard offset, no blur); removing the Pack rig removes the shadow.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/platform/DiagramMount.svelte intrinsicStyle — scale-settle entrance (0.85→1 with opacity) driven by animState.blockProgresses; bypassed when the composition declares channels (ADR-0035 §2).',
			definition: 'Shape of the node entrance when the composition does not take the pen.',
			probe: {
				kind: 'named-observation',
				region: 'a node during its enter window',
				expectation:
					'the node settles from 85% scale with its fade; declaring animation.channels replaces this outright (no double motion).'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/platform/DiagramMount.svelte positionStyle — explicit composition-fraction placement, centred on the authored point; never auto-laid-out (ADR-0036 rejects mermaid-style layout).',
			definition: 'Where the node sits in the frame.',
			probe: {
				kind: 'named-observation',
				region: 'node placement vs its authored position',
				expectation:
					'the rendered node centres on `position` × frame size; moving the authored fraction moves the node 1:1.'
			}
		}
	]
};
