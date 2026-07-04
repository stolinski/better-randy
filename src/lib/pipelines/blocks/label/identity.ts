/**
 * Identity Spec for the `label` diagram Block (ADR-0036) — the diagram's
 * caption voice: free text annotating a position.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const labelIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a placed diagram caption in the annotation register',
	dimensions: [
		{
			name: 'fill-treatment',
			viaPack: 'label.ink',
			definition: 'Caption ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'a diagram label',
				expectation:
					'ink resolves label.ink → core ink → the composition’s typography.inkColor (the mount’s currentColor), so over-footage presets that flipped their ink stay legible.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/platform/DiagramMount.svelte intrinsicStyle — short rise (24px at 4K) + fade on blockProgresses; bypassed by authored channels (ADR-0035 §2).',
			definition: 'Shape of the caption entrance.',
			probe: {
				kind: 'named-observation',
				region: 'a label during its enter window',
				expectation: 'the caption rises ~24px into place with its fade; no scale, no bounce.'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/platform/DiagramMount.svelte positionStyle — explicit composition-fraction placement, centred on the authored point; `scale` multiplies the caption’s size for art-directed hierarchy.',
			definition: 'Where the caption sits and how it scales.',
			probe: {
				kind: 'named-observation',
				region: 'label placement vs its authored position',
				expectation:
					'the rendered caption centres on `position` × frame size and tracks `scale` linearly.'
			}
		}
	]
};
