/**
 * Identity Spec for the `newspaper` Surface — per ADR-0015. Declares the
 * dimensions of realism this Pipeline owes when it claims to render aged
 * newsprint. Every material dimension is intrinsic — paper grain, halftone,
 * ink bleed, edge occlusion, optical misregistration, surface rotation,
 * camera defocus, lens vignette, and (since ADR-0039 §2) the tear character
 * of the cut are what the substrate *is*, not aesthetic dress a Pack varies.
 *
 * Partial substrate immunity (ADR-0039 §2): the document BODY — sheet fill,
 * body ink, print tints, tear character (`newsprint-substrate.ts`) — is
 * Pack-immune; a re-dressed newspaper stops being a newspaper. Channel chrome
 * ON the clipping stays claimable through `packImmunity.claimable`: the
 * kicker chip (`accent` plate + `kicker-ink`) and the depth/shadow rig
 * (`depth`). Annotation marks and the backdrop resolve through their own
 * Pipelines/composition state, untouched by this declaration.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const newspaperIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'aged newsprint photographed under directional light',
	packImmunity: {
		rationale:
			'A quoted newspaper is a faithful artifact like a quoted tweet (ADR-0038): repainting its sheet, ink, print tints, or tear under a pack swap breaks verisimilitude without gaining brand (ADR-0039 §2 — a white-and-blue "newspaper" is no longer a newspaper). Channel chrome ON the clipping stays the pack’s.',
		claimable: ['accent', 'kicker-ink', 'depth']
	},
	dimensions: [
		{
			name: 'grain-multi-scale',
			definition:
				'Paper texture carries energy at four distinct spatial frequencies — coarse fibre, fine speckle, anisotropic warp, and low-frequency mottling — so the substrate reads as newsprint rather than clean printer paper.',
			implementation:
				'paper Pipeline contributes the three fine/medium/anisotropic noise scales (src/lib/pipelines/surfaces/paper/pipeline.ts ~ grain composition); newspaper-physics adds the lowest-frequency mottling layer via 2D hash-based value noise (newspaper-physics.ts § Newsprint mottling).',
			probe: {
				kind: 'named-observation',
				region: 'a paper-only patch within the card, away from text',
				expectation:
					'visible organic density variation at ~500–1500 px scale at 4K, layered over the inherited fine grain; no periodic banding (sin-stripe patterns) anywhere.'
			}
		},
		{
			name: 'halftone-at-body',
			definition:
				'At body cap-height, dark ink resolves as a halftone dot pattern rather than a flat fill. The screen fires only on mid-tone luminance — pure-dark titles stay solid, near-white paper stays clean — and only on the document body: label ink inside saturated channel chrome (the kicker chip) is printed chrome, not newsprint, and never screens.',
			implementation:
				'newspaper-physics.ts § Halftone dot screen — smoothstep(0.05, 0.30) × (1 - smoothstep(0.70, 0.92)) mid-tone mask multiplied by per-cell dot coverage; HALFTONE_PITCH_PX = 10. § Chrome-neighborhood mask — four 12 px diagonal saturation taps veto the screen inside saturated chrome, so mid-luma chip label ink (clean-light slate) stays solid (dex lbwpnf69).',
			probe: {
				kind: 'named-observation',
				region: 'body text glyph at 400% zoom; kicker chip label at 400% zoom',
				expectation:
					'internal dot/grain texture visible inside the body stroke; title glyphs at the same zoom stay solid black (the screen correctly skips luma < 0.05); chip label glyphs stay solid under EVERY pack regardless of ink luma.'
			}
		},
		{
			name: 'ink-bleed-at-edges',
			definition:
				'Glyph edges show 1–2 px softening with sub-pixel chromatic separation, reading as ink absorbing into paper fibre rather than vector-clean rasterization.',
			implementation:
				'newspaper-physics.ts § Ink bleed — 4-tap diagonal dilation at BLEED_RADIUS_PX = 3, gated by an inverse-luminance ink mask so paper does not dilate.',
			probe: {
				kind: 'named-observation',
				region: 'body glyph edge at 400% zoom',
				expectation:
					'edge transition spans ≥ 2 px with slight chromatic offset between saturated and luma channels; no hard single-pixel stroke boundary.'
			}
		},
		{
			name: 'edge-occlusion-shadow',
			definition:
				'The paper sheet casts a directional, SDF-derived occlusion shadow on the substrate beneath it. Lit-side edges have zero shadow band; shadow-side edges have a soft falloff implying the paper sits on a real surface under directional light.',
			implementation:
				'newspaper-physics.ts § Edge occlusion shadow — 8-tap progressive probe along vec2f(-1, -1) (light direction); quadratic strength falloff to shadowRadiusPx = 60 px; shadowStrength = 0.45. Coexists with the CSS hard offset shadow on the card (Pack-side Syntax chrome).',
			probe: {
				kind: 'named-observation',
				region: 'paper edges, comparing upper-left (lit) vs lower-right (shadow)',
				expectation:
					'lit edge shows hard alpha transition from transparency directly to paper; shadow edge shows a soft gradient of darkened alpha extending ~300 px from the paper boundary. Lit-vs-shadow density ratio > 1.4.'
			}
		},
		{
			name: 'optical-misregistration',
			definition:
				'Saturated marks (highlights, annotation chrome) show chromatic channel offset implying print-plate misalignment from the dark ink plate. Newspaper substrate pixels are unaffected.',
			implementation:
				'newspaper-physics.ts § Optical misregistration — R channel sampled at vec2f(+1.5, +0.5) px offset, B channel at vec2f(-1.5, -0.5) px; mix factor gated by centerSaturation > 0.3 ∧ alpha > 0.5 so only saturated overlays/marks register.',
			probe: {
				kind: 'named-observation',
				region: 'edge of a yellow highlight rectangle at 400% zoom',
				expectation:
					'visible chromatic fringe — warm shift on one side of the highlight, cool shift on the other; dark glyphs inside the highlight show channel separation along their strokes.'
			}
		},
		{
			name: 'edge-treatment',
			definition:
				'The cut behavior of the clipping’s outer silhouette. A clipping is TORN from its source — the tear character is document physics, not Pack dress (ADR-0039 §2 reversed the ADR-0019-era via-pack concession: a die-cut “newspaper clipping” under a clean pack read as a printed card, not a quoted artifact).',
			implementation:
				'newsprint-substrate.ts § NEWSPRINT_EDGE_TREATMENT — intrinsic torn treatment (amplitudePx 40, wavelengthPx 150, fiber 1) consumed by the shared edge-treatment ShaderPass via the renderer’s intrinsicEdgeTreatment; the `edge` slot is absent from packImmunity.claimable, so resolveEdgeTreatment is never consulted for this Surface.',
			probe: {
				kind: 'named-observation',
				region: 'card silhouette against transparency at 200% zoom',
				expectation:
					'under EVERY pack: an irregular displaced tear path (~1–3% of the card’s smaller dimension) with a lighter interior fiber rim at the torn boundary, never an axis-perfect rectangular cut. The tear path is deterministic per preset — same seed, same tear across re-renders.'
			}
		},
		{
			name: 'surface-rotation',
			definition:
				'The paper sits at a seeded 1–3° rotation off frame axes, implying a physical object placed by hand on a surface rather than rasterized to grid.',
			implementation:
				'CanvasSource.svelte seeds rotation from the preset title via hashStringToUnitInterval; CSS transform: rotate(${rotationDeg}deg); HTML-in-Canvas captures the rotation into the surface texture before newspaper-physics runs. Determinism per G9 — same preset always rotates the same way.',
			probe: {
				kind: 'named-observation',
				region: 'card body relative to canvas axes',
				expectation:
					'card axis is rotated 1–3° from horizontal; angle is stable across re-renders of the same preset.'
			}
		},
		{
			name: 'camera-defocus',
			definition:
				'Subtle radial blur on newspaper pixels grows with UV distance from the implied focal centre, implying a real camera aperture rather than infinite-DOF vector rasterization.',
			implementation:
				'newspaper-physics.ts § Camera defocus — 4-tap diagonal blur whose radius is smoothstep(0.30, 0.70, distFromFocal) × 5 px; result mixed with halftone+bleed output by the same smoothstep factor.',
			probe: {
				kind: 'named-observation',
				region: 'body text far from focal centre vs glyphs near focal centre',
				expectation:
					'glyphs at high UV-distance show measurably softer edges (under-defined hairlines, lost stroke contrast on thins) compared to equivalent glyphs near the focal centre. Title (near centre) stays sharp.'
			}
		},
		{
			name: 'lens-vignette',
			definition:
				'Multiplicative corner darkening on newspaper pixels — implies a real camera lens, not a flat rasterizer.',
			implementation:
				'newspaper-physics.ts § Lens vignette — vignetteAmount = smoothstep(0.30, 0.85, distFromFocal) × 0.18 multiplied into the (already mottled + defocused + halftoned + bled) RGB; alpha untouched; transparent and overlay pixels excluded by the final composite gate.',
			probe: {
				kind: 'named-observation',
				region: 'two equal-content paper patches: one near UV (0.5, 0.5), one near the far card corner',
				expectation:
					'corner patch is 3–7% lower in luma than the centre patch on otherwise-equivalent content.'
			}
		}
	]
};
