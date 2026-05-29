/**
 * Identity Spec for the `shader-fill` Overlay — per ADR-0015. A graphic
 * Overlay whose claim is a procedural fragment-shader fill applied to a
 * rect region. Motion-form and frame-relationship are intrinsic; the
 * specific shader, fill colour, and edge behaviour all concede to the
 * active Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const shaderFillIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a procedurally shaded fill region anchored within the frame',
	dimensions: [
		{
			name: 'fill-treatment',
			viaPack: 'shader-fill.shader',
			definition: 'The fragment shader resolved by the Pack (which procedural fill program runs).',
			probe: {
				kind: 'named-observation',
				region: 'centre of the shader-fill region',
				expectation: 'fill shader resolves through the shader-fill.shader Role.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'shader-fill.edge',
			definition: 'How the shaded region meets its boundary (clean rect, feathered, masked).',
			probe: {
				kind: 'named-observation',
				region: 'region boundary',
				expectation: 'edge treatment resolves through the shader-fill.edge Role.'
			}
		},
		{
			name: 'motion-form',
			viaPack: 'shader-fill.enterMotion',
			definition: 'Shape of the region\'s enter/exit motion.',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline on the region',
				expectation: 'enter motion resolves through the shader-fill.enterMotion Role.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Region is positioned via the engine\'s overlay anchor + offset / normalized-rect model; positioning is deterministic per preset.',
			implementation:
				'src/lib/pipelines/overlays/shader-fill — OverlayPosition resolved via the engine\'s anchor + offset model.',
			probe: {
				kind: 'named-observation',
				region: 'shader-fill region position within the frame',
				expectation:
					'region honours the preset\'s declared anchor / rect; position is stable across re-renders.'
			}
		}
	]
};
