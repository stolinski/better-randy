/**
 * Identity Spec for the `plain` Surface — per ADR-0015. The honest scaffold
 * Surface: a transparent runtime base that hosts another Pipeline's content
 * without claiming any intrinsic physics. Per ADR-0019, every dimension here
 * concedes to the active Pack via the via-pack clause — `plain` does not
 * claim to be a material, a tool, or a graphic with intrinsic physics; it is
 * the substrate the Pack dresses. A Pack that does not bind every plain.*
 * Role fails the manifest validator at engine boot.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const plainIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a transparent scaffold whose appearance is fully resolved by the active Pack',
	dimensions: [
		{
			name: 'fill-treatment',
			definition: 'The base substrate colour or fill resolved by the Pack.',
			viaPack: 'plain.fill',
			probe: {
				kind: 'named-observation',
				region: 'centre of the surface, away from any text',
				expectation:
					'fill matches the active Pack manifest plain.fill value; no inline hex bypassing the Role.'
			}
		},
		{
			name: 'edge-treatment',
			definition: 'How the surface meets the frame edge (sharp, soft, vignetted).',
			viaPack: 'plain.edge',
			probe: {
				kind: 'named-observation',
				region: 'surface boundary against frame transparency',
				expectation:
					'edge behaviour matches the active Pack manifest plain.edge resolution.'
			}
		},
		{
			name: 'depth-treatment',
			definition: 'Any implied depth (shadow stack, ambient occlusion) sitting under the surface.',
			viaPack: 'plain.depth',
			probe: {
				kind: 'named-observation',
				region: 'beneath the surface where a shadow would fall',
				expectation:
					'depth treatment matches the active Pack manifest plain.depth resolution; no inline shadow stack.'
			}
		},
		{
			name: 'light-treatment',
			definition: 'Any directional sheen, rim, or ambient light contribution on the surface.',
			viaPack: 'plain.light',
			probe: {
				kind: 'named-observation',
				region: 'surface body under any implied light source',
				expectation:
					'light treatment matches the active Pack manifest plain.light resolution.'
			}
		},
		{
			name: 'motion-form',
			definition: 'The shape of the surface enter/exit motion.',
			viaPack: 'plain.enterMotion',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline (enter window)',
				expectation:
					'enter motion shape matches the active Pack manifest plain.enterMotion resolution.'
			}
		},
		{
			name: 'frame-relationship',
			definition: 'How the surface is anchored within the frame.',
			viaPack: 'plain.frameRelationship',
			probe: {
				kind: 'named-observation',
				region: 'surface position within the frame',
				expectation:
					'anchor + offset behaviour matches the active Pack manifest plain.frameRelationship resolution.'
			}
		}
	]
};
