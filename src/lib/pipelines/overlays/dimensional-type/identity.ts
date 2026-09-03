/**
 * Identity Spec for the `dimensional-type` Overlay — per ADR-0015 + ADR-0020,
 * and the first Overlay-owned body of ADR-0051 (ADR-0062). The form — an
 * extruded, beveled headline in the Pack's face — and the settled-place
 * entrance are intrinsic; the face, the ink of the caps, and the accent of
 * the extrusion concede to the Pack; the light is the Stage's.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const dimensionalTypeIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a headline standing on the depth Stage as a real body: extruded, beveled, lit, and casting shadow',
	dimensions: [
		{
			name: 'form',
			definition:
				'The headline is geometry, not captured pixels: every glyph outline of the Pack face is flattened, triangulated, and extruded with a chamfer bevel, so the camera sees its sides and the key light finds its edges.',
			implementation:
				'src/lib/platform/pipelines/stage-type-geometry.ts buildStageTypeMesh — caps by earcut over winding-sorted contours, straight sides, a miter-limited chamfer, four material regions; drawn by depth-stage-body-pass.ts.',
			probe: {
				kind: 'named-observation',
				region: 'headline under an oblique camera pose',
				expectation:
					'the letterforms show visible depth: side faces darker than the caps, a lit bevel along the front edges, and a cast shadow on the plane behind.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'Settled-place: the headline starts lifted off its plane and leaning in, lands over the enter window with the Overlay ease, and the lens racks to it as it lands.',
			implementation:
				'src/lib/pipelines/overlays/dimensional-type/body.ts dimensionalTypeStageBody.contribute — lift and lean scale by (1 − progress); presence leads the landing; pullsFocus drives resolveStageBodyFocusPull.',
			probe: {
				kind: 'named-observation',
				region: 'headline over its enter window',
				expectation:
					'at the window start the headline is nearer the eye and tipped back; by its end it rests on its plane, sharp, with the page behind it softer.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'dimensional-type.ink',
			definition: 'The ink of the caps and the bevel: the Pack’s field ink, since a headline stands on the field.',
			probe: {
				kind: 'named-observation',
				region: 'front face of the letters',
				expectation: 'colour resolves through the dimensional-type.ink Role.'
			}
		},
		{
			name: 'accent-treatment',
			viaPack: 'dimensional-type.accent',
			definition: 'The extrusion’s colour: the Pack’s accent, so the sides read as the brand’s second colour.',
			probe: {
				kind: 'named-observation',
				region: 'side faces of the letters under a yawed camera',
				expectation: 'colour resolves through the dimensional-type.accent Role.'
			}
		},
		{
			name: 'font-treatment',
			viaPack: 'dimensional-type.face',
			definition: 'The face the headline is set in: a registered stage typeface compiled from the Pack’s own display cut.',
			probe: {
				kind: 'named-observation',
				region: 'letterforms',
				expectation: 'the glyph shapes are the Pack face named by dimensional-type.face, kerned by that face.'
			}
		},
		{
			name: 'light-treatment',
			implementation:
				'src/lib/platform/pipelines/depth-stage-material.ts — the Stage’s material model lights the body in linear light under the Pack key and the room; no Pipeline CSS applies.',
			definition: 'The headline is lit by the Stage, never by a CSS shadow or gradient.',
			probe: {
				kind: 'named-observation',
				region: 'bevel highlight',
				expectation: 'the highlight moves with the Pack key direction and the camera, as a lit object’s would.'
			}
		}
	]
};
