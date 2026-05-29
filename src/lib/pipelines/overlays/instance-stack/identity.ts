/**
 * Identity Spec for the `instance-stack` Overlay — per ADR-0015 + ADR-0020.
 * Family Pipeline (v1 variants: `vertical-stack`, `horizontal-train`).
 * motion-form is intrinsic (lag-window propagation across N spatially-
 * offset instances); fill / edge / depth / light / frame-relationship
 * concede to the active Pack per ADR-0019. The "Block" Layer in the
 * 5-Layer grammar maps to the Overlay slot in the current engine
 * implementation per the motion-primitives plan\'s Phase 4 note that the
 * engine\'s inline-body Block layer (paragraph) is reserved for body
 * content; standalone composition pieces ship as Overlays.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const instanceStackIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a text slot rendered as N spatially-offset instances with a per-instance progress lag',
	dimensions: [
		{
			name: 'motion-form',
			definition:
				'Each of N instances carries its own enter phase offset by `lagWindow * (i / (count-1))` of the surface enter window; later instances finish their motion after earlier ones, producing the visible "echo" propagation.',
			implementation:
				'src/lib/pipelines/overlays/instance-stack/variants/<id>.ts motionShape — pure (instanceIndex, instanceCount, progress) → per-instance state.',
			probe: {
				kind: 'named-observation',
				region: 'instance-stack mid-enter',
				expectation:
					'instance 0 is fully resolved while instances N-1 and N-2 are mid-motion; visible lag between adjacent instances.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'instance-stack.fill',
			definition: 'Instance ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'instance body colour',
				expectation: 'colour resolves through the instance-stack.fill Role.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'instance-stack.edge',
			definition: 'Glyph edge behaviour on each instance.',
			probe: {
				kind: 'named-observation',
				region: 'glyph edge at 400% zoom',
				expectation: 'edge treatment resolves through the instance-stack.edge Role.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'instance-stack.depth',
			definition: 'Implied depth between instances (opacity recession, z-offset, none).',
			probe: {
				kind: 'named-observation',
				region: 'instances 0 through N-1',
				expectation: 'depth treatment resolves through the instance-stack.depth Role.'
			}
		},
		{
			name: 'light-treatment',
			viaPack: 'instance-stack.light',
			definition: 'Any directional light contribution on the instances.',
			probe: {
				kind: 'named-observation',
				region: 'instance strokes',
				expectation: 'light treatment resolves through the instance-stack.light Role.'
			}
		},
		{
			name: 'frame-relationship',
			viaPack: 'instance-stack.frameRelationship',
			definition: 'How the stack is anchored within the frame.',
			probe: {
				kind: 'named-observation',
				region: 'stack position within the frame',
				expectation: 'anchor + offset behaviour resolves through the instance-stack.frameRelationship Role.'
			}
		}
	]
};
