/**
 * Identity Spec for the `plain` Surface — per ADR-0015. The honest scaffold
 * Surface: a transparent runtime base that hosts another Pipeline's content
 * without claiming any intrinsic physics. Its edge / depth / light treatments
 * concede to the active Pack via the via-pack clause (ADR-0019); its fill is
 * intrinsically transparent per the output contract and its motion +
 * frame-relationship are intrinsic to the Pipeline per ADR-0023, so they are
 * declared `implementation`, not Pack Roles.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const plainIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a transparent scaffold whose appearance is fully resolved by the active Pack',
	dimensions: [
		{
			name: 'fill-treatment',
			definition: 'The base substrate fill — intrinsically transparent per the output contract; ink colour comes from engineState.typography, not the Pack.',
			implementation:
				'CanvasSource.svelte paints background-color:transparent (hardcoded) and color:engineState.typography.inkColor; no Pack fill var is consumed.',
			probe: {
				kind: 'named-observation',
				region: 'centre of the surface, away from any text',
				expectation:
					'surface body is fully transparent (no painted fill); ink colour matches engineState.typography.inkColor.'
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
			implementation:
				'enter motion driven by the surface mount enter/exit Transition timing.',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline (enter window)',
				expectation:
					'enter motion shape matches the surface mount enter/exit Transition timing (intrinsic to the Pipeline, not Pack-resolved).'
			}
		},
		{
			name: 'frame-relationship',
			definition: 'How the surface is anchored within the frame.',
			implementation:
				'frame relationship intrinsic to the plain layout (centred).',
			probe: {
				kind: 'named-observation',
				region: 'surface position within the frame',
				expectation:
					'anchor + offset behaviour matches the intrinsic plain layout (centred); not Pack-resolved.'
			}
		}
	]
};
