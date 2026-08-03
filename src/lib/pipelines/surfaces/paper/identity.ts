/**
 * Identity Spec for the `paper` Surface — per ADR-0015. The base printer-paper
 * substrate: cleaner than `newspaper` (no halftone, no aged mottling) but still
 * a real paper claim with multi-scale grain, ink-fibre interaction at glyph
 * edges, edge-occlusion shadow under directional light, and a subtle camera
 * defocus budget. All dimensions are intrinsic to the material; none concede
 * to a Pack via ADR-0019, and since ADR-0039 §2 the sheet/ink colours are
 * substrate-immune too: an unauthored composition falls to the intrinsic
 * printer-paper constants (`paper-substrate.ts`), never the active Pack's
 * cores. Immunity is FULL — unlike the newspaper, this Surface carries no
 * claimable channel chrome of its own (marks and blocks layered on it are
 * their own Pipelines).
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const paperIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a sheet of printer paper photographed under directional light',
	packImmunity: {
		rationale:
			'A quoted paper document is a faithful artifact (ADR-0038 / ADR-0039 §2): the sheet and its printed ink are document physics. Authored typography colours remain composition content that wins; the active Pack never decides the body.'
	},
	dimensions: [
		{
			name: 'grain-multi-scale',
			definition:
				'Paper texture carries energy at three spatial frequencies — fine fibre, medium speckle, and a slow anisotropic warp — so the substrate reads as real paper rather than a flat fill.',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § grain composition — three noise scales summed into the substrate texture before glyph upload.',
			probe: {
				kind: 'named-observation',
				region: 'a paper-only patch within the card, away from text',
				expectation:
					'visible non-periodic grain at three scales; no sin-stripe banding; grain stays consistent across re-renders of the same preset.'
			}
		},
		{
			name: 'ink-bleed-at-edges',
			definition:
				'Glyph edges show ≤ 1 px softening implying ink absorbing into paper fibre rather than vector-clean rasterization.',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § edge softening — gated 2-tap dilation along inverse-luminance ink mask.',
			probe: {
				kind: 'named-observation',
				region: 'body glyph edge at 400% zoom',
				expectation:
					'edge transition spans ≥ 1.5 px with soft falloff into paper colour; no hard single-pixel stroke boundary.'
			}
		},
		{
			name: 'edge-occlusion-shadow',
			definition:
				'The paper sheet casts a directional, SDF-derived occlusion shadow on the substrate beneath it.',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § shadow — progressive probe along the implied light vector with quadratic falloff.',
			probe: {
				kind: 'named-observation',
				region: 'paper edges, comparing lit vs shadow side',
				expectation:
					'lit edge shows hard alpha-to-paper transition; shadow edge shows a soft gradient of darkened alpha extending beyond the paper boundary.'
			}
		},
		{
			name: 'surface-rotation',
			definition:
				'Paper sits at a seeded 0.5–2° rotation off frame axes, implying a hand-placed sheet on a surface.',
			implementation:
				'paper CanvasSource seeds rotation from preset title via hashStringToUnitInterval; CSS transform: rotate; HTML-in-Canvas captures the rotation into the surface texture.',
			probe: {
				kind: 'named-observation',
				region: 'card axis relative to canvas axes',
				expectation:
					'card axis is rotated 0.5–2° from horizontal; angle is deterministic across re-renders of the same preset.'
			}
		},
		{
			name: 'camera-defocus',
			definition:
				'Subtle radial blur on paper pixels grows with distance from the focal centre, implying a real camera aperture.',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § camera defocus — 4-tap diagonal blur whose radius is smoothstep-modulated by distance from focal centre.',
			probe: {
				kind: 'named-observation',
				region: 'body text near focal centre vs far from focal centre',
				expectation:
					'glyphs far from the focal centre show measurably softer edges than glyphs near it.'
			}
		},
		{
			name: 'lens-vignette',
			definition:
				'Multiplicative corner darkening on paper pixels — implies a real camera lens.',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § lens vignette — smoothstep-modulated luma attenuation in the far corner region, alpha untouched.',
			probe: {
				kind: 'named-observation',
				region: 'centre vs corner paper patches of equivalent content',
				expectation:
					'corner patch is 2–6% lower in luma than the centre patch on otherwise-equivalent content.'
			}
		}
	]
};
