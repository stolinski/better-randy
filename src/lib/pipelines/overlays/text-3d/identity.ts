/**
 * Identity Spec for the `text-3d` Overlay — per ADR-0015 + ADR-0020. Family
 * Pipeline (v1 variant: `cylinder-axis-y`). depth-treatment, light-
 * treatment, and motion-form are all intrinsic — the entire premise is
 * real cylindrical geometry with per-fragment lighting and rotation. Per
 * ADR-0021 the depth handling is internal to text-3d (the cylinder\'s
 * self-occlusion lives in its own render pass), so the engine-side z-plane
 * plumbing is not a prerequisite for shipping this Pipeline. Fill / edge /
 * frame-relationship concede to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const text3dIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a text slot rendered on a curved geometry with real perspective and per-fragment lighting',
	dimensions: [
		{
			name: 'depth-treatment',
			definition:
				'Glyphs wrap onto a cylindrical surface around an axis; the back-facing portion of the cylinder occludes itself (you cannot see the back of the cylinder through the front) — a property CSS `transform: rotate3d` does not give on a 2D plane.',
			implementation:
				'src/lib/pipelines/overlays/text-3d/variants/CylinderAxisYCanvasSource.svelte — 2D projection: each glyph\'s cylinder angle is computed from its slot index plus the global spin (baseRotation = motionShape progress × rotationDegrees). cos(angle) drives horizontal foreshortening (scaleX) and opacity; sin(angle) drives the lateral screen offset (xCh). Back-facing glyphs (cos ≤ 0) are excluded via {#if glyph.front}. No CSS perspective or backface-visibility is used.',
			probe: {
				kind: 'named-observation',
				region: 'cylinder during rotation',
				expectation:
					'glyphs facing away from the camera are hidden; visible glyphs lie on a curved surface, not a flat plane.'
			}
		},
		{
			name: 'light-treatment',
			definition:
				'Per-glyph opacity attenuates by the dot product of the glyph normal and the camera direction vector (cos of the glyph\'s cylinder angle). Glyphs at the camera-facing centre have full opacity; glyphs toward the cylinder edges fade toward transparent, producing a brightness-like falloff.',
			implementation:
				'src/lib/pipelines/overlays/text-3d/variants/CylinderAxisYCanvasSource.svelte — per-glyph `opacity: cos(angle)` (no clamp floor) applied via CSS `style:opacity`. No CSS `filter: brightness()` is used; the falloff is purely opacity-based. Back-facing glyphs (cos ≤ 0) are excluded entirely by {#if glyph.front}.',
			probe: {
				kind: 'named-observation',
				region: 'glyphs at the cylinder front vs side',
				expectation: 'centre glyph has full opacity; glyphs toward the visible edge have progressively lower opacity; transition is smooth across the arc with no clamp floor at the limb.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'Cylinder rotates around its axis across the timeline; rotation rate is deterministic per progress.',
			implementation:
				'src/lib/pipelines/overlays/text-3d/variants/cylinder-axis-y.ts — motionShape returns `t²(3-2t) × rotationDegrees` (smoothstep ease); CylinderAxisYCanvasSource.svelte calls motionShape with content.rotationDegrees to get baseRotation and adds per-glyph slot offsets.',
			probe: {
				kind: 'named-observation',
				region: 'cylinder at progress 0 vs progress 1',
				expectation: 'cylinder has visibly rotated; rotation is deterministic across re-renders.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'text-3d.ink',
			definition: 'Glyph ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'glyph body colour',
				expectation: 'colour resolves through the text-3d.ink Role (the glyph paints with var(--ink), fallback #fffaf2).'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'text-3d.edge',
			definition: 'Glyph edge behaviour.',
			probe: {
				kind: 'named-observation',
				region: 'glyph edge at 400% zoom',
				expectation: 'edge treatment resolves through the text-3d.edge Role.'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/pipelines/overlays/text-3d/variants/cylinder-axis-y.ts + CylinderAxisYCanvasSource.svelte — the cylinder is centred in the frame; frame relationship is intrinsic to the text-3d layout (no anchor/offset Role).',
			definition: 'How the cylinder is anchored within the frame.',
			probe: {
				kind: 'named-observation',
				region: 'cylinder position within the frame',
				expectation: 'the cylinder is centred in the frame; positioning is intrinsic to the text-3d layout, not driven by a Pack Role.'
			}
		}
	]
};
