/**
 * Identity Spec for the `newspaper` Surface — per ADR-0015. Declares the
 * dimensions of realism this Pipeline owes when it claims to render a
 * broadsheet page photographed up close (ADR-0056, direction plates in
 * `docs/inspo/newspaper/`). Every dimension is intrinsic — grain, halftone,
 * ink bleed, the page crop, the camera's tilt, push, defocus, and vignette are
 * what the photographed substrate *is*, not aesthetic dress a Pack varies.
 *
 * Full substrate immunity (ADR-0056): a photographed page carries no channel
 * chrome — no kicker chip, no card shadow — so `claimable` is absent and
 * nothing on the page re-dresses under a Pack swap. Annotation marks laid on
 * the page (the highlighter) resolve through their own Pipelines/composition
 * state, untouched by this declaration.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const newspaperIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a broadsheet newspaper page photographed up close for a documentary insert',
	packImmunity: {
		rationale:
			'A quoted newspaper is a faithful artifact like a quoted tweet (ADR-0038): repainting its sheet, ink, or type under a pack swap breaks verisimilitude without gaining brand (ADR-0039 §2). Photographed up close there is no card and no chip for a pack to claim (ADR-0056), so the page is fully immune; the marker highlight on it stays the pack’s through the annotation Pipelines.'
	},
	dimensions: [
		{
			name: 'grain-multi-scale',
			definition:
				'Paper texture carries energy at five distinct spatial frequencies — coarse fibre, fine speckle, anisotropic warp, low-frequency mottling, and a per-pixel scan grain — so the substrate reads as photographed newsprint rather than clean printer paper.',
			implementation:
				'paper Pipeline contributes the three fine/medium/anisotropic noise scales (src/lib/pipelines/surfaces/paper/pipeline.ts ~ grain composition); newspaper-physics adds the lowest-frequency mottling layer via 2D hash-based value noise (newspaper-physics.ts § Newsprint mottling) and the finest scan-grain octave at 2 px cells (§ Scan grain).',
			probe: {
				kind: 'named-observation',
				region: 'a paper-only patch within the frame, away from text',
				expectation:
					'visible organic density variation at ~500–1500 px scale at 4K, layered over the inherited fine grain and a per-pixel grain of ±2–3% luma; no periodic banding (sin-stripe patterns) anywhere.'
			}
		},
		{
			name: 'halftone-at-body',
			definition:
				'At body cap-height, mid-tone ink resolves as a halftone dot pattern rather than a flat fill. The screen fires only on mid-tone luminance — pure-dark headline strokes stay solid, near-white paper stays clean — so glyph edges pick up the broken, printed character of a press run.',
			implementation:
				'newspaper-physics.ts § Halftone dot screen — smoothstep(0.05, 0.30) × (1 - smoothstep(0.50, 0.64)) mid-tone mask multiplied by per-cell dot coverage; HALFTONE_PITCH_PX = 10. The upper band closes below the grey sheet’s luma (≈ 0.70–0.76 after the compositor’s grain) so open paper never screens; gated to desaturated ink-on-paper pixels so the marker highlight never screens either.',
			probe: {
				kind: 'named-observation',
				region: 'body text glyph at 400% zoom; headline glyph at 400% zoom',
				expectation:
					'internal dot/grain texture visible at the body stroke edge; headline glyphs at the same zoom stay solid black in their interiors (the screen correctly skips luma < 0.05).'
			}
		},
		{
			name: 'ink-bleed-at-edges',
			definition:
				'Glyph edges show 1–2 px softening, reading as ink absorbing into paper fibre rather than vector-clean rasterization.',
			implementation:
				'newspaper-physics.ts § Ink bleed — component-wise min over the centre and four diagonal taps at BLEED_RADIUS_PX = 2, mixed in at 0.4, so paper touching a stroke takes on its ink and the stroke grows outward by a soft ramp (never an average, which would print a grey rim inside the glyph).',
			probe: {
				kind: 'named-observation',
				region: 'body glyph edge at 400% zoom',
				expectation:
					'edge transition spans ≥ 2 px; no hard single-pixel stroke boundary.'
			}
		},
		{
			name: 'page-crop',
			definition:
				'The frame is a tight crop INTO the page. The sheet overshoots every frame edge under both orientations, so no page silhouette, tear, or card shadow ever appears; headline, byline, and columns run off the frame the way a documentary insert of a real newspaper does.',
			implementation:
				'CanvasSource.svelte § page geometry — the article is sized larger than the frame (PAGE_OVERSHOOT_* fractions) and offset so its edges sit outside the canvas under the seeded tilt and the full camera push; the Composition’s overflow clip crops it. No edge treatment is declared on the definition (intentional absence — the shared edge pass would only carve the canvas boundary).',
			probe: {
				kind: 'named-observation',
				region: 'the whole frame at progress 0.0, 0.5, and 1.0 in both orientations',
				expectation:
					'alpha coverage is 100% at every sampled frame; no page edge, corner, or shadow band is visible; at least one column and the headline’s trailing edge are cropped by the frame.'
			}
		},
		{
			name: 'surface-rotation',
			definition:
				'The page sits at a seeded 0.3–0.8° tilt off the frame axes, implying a hand-held camera over a physical page rather than a scan aligned to the pixel grid.',
			implementation:
				'CanvasSource.svelte seeds the tilt from the headline via hashStringToUnitInterval; CSS transform rotate(${tiltDeg}deg) about the frame centre; HTML-in-Canvas captures the tilt into the surface texture before newspaper-physics runs. Determinism per G9 — same preset always tilts the same way.',
			probe: {
				kind: 'named-observation',
				region: 'the masthead rule and column rules relative to canvas axes',
				expectation:
					'rules are rotated 0.3–0.8° from the frame axes; the angle is stable across re-renders of the same preset.'
			}
		},
		{
			name: 'camera-push',
			definition:
				'The camera lands on the page and keeps pushing in, slowly, for the length of the piece — the locked-off documentary insert with a hint of life, never a card flying in.',
			implementation:
				'CanvasSource.svelte § camera — enter maps paperVisibility to a settle from CAMERA_LANDING_SCALE with a small vertical drop; globalProgress drives a continuous CAMERA_PUSH_SCALE push and lateral drift; exit accelerates the push. All transforms are pure functions of the frame’s timeline values (frame-deterministic, no wall-clock).',
			probe: {
				kind: 'named-observation',
				region: 'the headline’s cap-height measured at progress 0.1 and 0.9',
				expectation:
					'the later measurement is 1.5–3% larger; the first frame shows the page settling from a slightly larger scale, never entering from off-frame.'
			}
		},
		{
			name: 'camera-defocus',
			definition:
				'Radial blur grows with UV distance from the frame centre, implying a real macro aperture rather than infinite-DOF vector rasterization.',
			implementation:
				'newspaper-physics.ts § Camera defocus — 9-tap blur (centre, axis ring, tighter diagonal ring, gaussian-weighted) whose ring radius is smoothstep(0.32, 0.72, distFromFocal) × 4.5 px; result mixed with the halftone+bleed output by the same smoothstep factor. The radius stays small on purpose: a few taps spread wide read as a double image.',
			probe: {
				kind: 'named-observation',
				region: 'body text near the frame corners vs glyphs near the frame centre',
				expectation:
					'corner glyphs show measurably softer edges (under-defined hairlines, lost stroke contrast on thins) compared to equivalent glyphs near the centre. The headline (near centre) stays sharp.'
			}
		},
		{
			name: 'lens-vignette',
			definition:
				'Multiplicative corner darkening across the photographed frame — implies a real lens over a real page, not a flat rasterizer. Everything captured in the frame is in the photograph, marker highlight included.',
			implementation:
				'newspaper-physics.ts § Lens vignette — vignetteAmount = smoothstep(0.25, 0.85, distFromFocal) × 0.27 multiplied into every opaque pixel’s RGB after mottling, defocus, halftone, and bleed; alpha untouched.',
			probe: {
				kind: 'named-observation',
				region: 'two equal-content paper patches: one near UV (0.5, 0.5), one near a frame corner',
				expectation: 'the corner patch is 10–22% lower in luma than the centre patch.'
			}
		}
	]
};
