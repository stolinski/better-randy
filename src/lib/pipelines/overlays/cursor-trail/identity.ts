/**
 * Identity Spec for the `cursor-trail` Overlay — per ADR-0015 + the motion-
 * primitives plan Phase 4.4. A single-shape Pipeline (no variants/ folder)
 * per ADR-0020 — the pointer shape is a Pack Role, not a variant.
 * motion-form is intrinsic (velocity-anisotropic trail synthesised in CSS
 * from frame-to-frame Δposition); depth-treatment is intrinsic (the cursor
 * sits in its own z-Layer above all content per ADR-0021); fill / edge
 * concede to the active Pack.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const cursorTrailIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'an animated pointer that traverses named target slots and dwells, with motion blur from frame-to-frame velocity',
	dimensions: [
		{
			name: 'motion-form',
			definition:
				'Pointer position is interpolated between path targets across the timeline; trail length and direction track frame-to-frame Δposition so the blur is oriented along the motion vector (anisotropic), not isotropic.',
			implementation:
				'src/lib/pipelines/overlays/cursor-trail/CanvasSource.svelte — pointer transform driven by progress + path interpolation; trail element rotates to match velocity vector.',
			probe: {
				kind: 'named-observation',
				region: 'cursor mid-traversal between two path targets',
				expectation:
					'pointer carries a trail oriented along the motion vector; trail length scales with current velocity; while dwelling on a target, trail length collapses to near-zero.'
			}
		},
		{
			name: 'depth-treatment',
			definition:
				'Cursor sits above all other Layers — per ADR-0021 its per-Layer default z is 0.9.',
			implementation:
				'CanvasSource composites at the highest z-Layer; pointer always renders over body, annotations, and other overlays.',
			probe: {
				kind: 'named-observation',
				region: 'cursor passing over a body passage',
				expectation: 'pointer occludes the body underneath; not the other way around.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'cursor-trail.pointer',
			definition: 'Pointer asset (mac-pointer, arrow, hand-pointer, crosshair) resolved by the Pack.',
			probe: {
				kind: 'named-observation',
				region: 'pointer body',
				expectation: 'pointer shape matches the Pack manifest cursor-trail.pointer resolution.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'cursor-trail.trailMaterial',
			definition: 'Trail material (gradient softness, falloff shape).',
			probe: {
				kind: 'named-observation',
				region: 'trail edge during traversal',
				expectation: 'trail edge resolves through the cursor-trail.trailMaterial Role.'
			}
		}
	]
};
