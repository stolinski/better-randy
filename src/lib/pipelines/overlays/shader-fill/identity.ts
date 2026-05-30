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
			implementation:
				'src/lib/pipelines/overlays/shader-fill/index.ts — the `wgsl` fragment program is the intrinsic fill: a three-centre inverse-square metaball gradient. Its three colours come from the preset `content` (color0/color1/color2) packed by `shaderPass.packUniforms` via getRgbColorChannels, not from the Pack.',
			definition: 'The intrinsic fragment-shader fill program (metaball gradient) the Pipeline paints; colours are preset content, not Pack-resolved.',
			probe: {
				kind: 'named-observation',
				region: 'centre of the shader-fill region',
				expectation: 'centre shows the three-colour metaball gradient from the preset content colours blended over the substrate at the content opacity.'
			}
		},
		{
			name: 'edge-treatment',
			implementation:
				'src/lib/pipelines/overlays/shader-fill/index.ts — the boundary is an intrinsic hard rect: the `wgsl` program tests `inOverlay` against boundsUvMin/boundsUvMax and returns the unmodified inputSample outside it, so the fill stops at a clean (sharp) rect with no feather or mask.',
			definition: 'How the shaded region meets its boundary: an intrinsic clean rect (the WGSL inOverlay bounds test), not Pack-driven.',
			probe: {
				kind: 'named-observation',
				region: 'region boundary',
				expectation: 'the gradient stops at a clean hard-edged rect with no feather or mask; pixels outside the rect are the unmodified substrate.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/pipelines/overlays/shader-fill — enter motion driven by the overlay mount enter/exit timing (defaults.enter / defaults.exit start, duration, ease).',
			definition: 'Shape of the region\'s enter/exit motion.',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline on the region',
				expectation: 'enter motion is the overlay mount enter timing (defaults.enter start 0, duration ~0.108, ease \'settled\'); the region eases in over the first ~10% of the timeline.'
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
