/**
 * Identity Spec for the `magnify` Annotation — per ADR-0015. A graphic
 * focal annotation: lifts a passage into a magnified focal slot while the
 * surrounding body dims. Magnification physics (real optical scaling, edge
 * mask) and the focal-dim relationship are intrinsic; the chrome around the
 * lens concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const magnifyIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a focal magnification of a passage with the surrounding body dimmed',
	dimensions: [
		{
			name: 'optical-magnification',
			definition:
				'The focal passage renders at a real scale-up factor with re-rasterized glyphs (not bilinear upsample), preserving stroke fidelity at the magnified size.',
			implementation:
				'src/lib/pipelines/annotations/magnify — focal slot is re-rasterized at the magnified cap-height; no bilinear scaling of the original raster.',
			probe: {
				kind: 'named-observation',
				region: 'the magnified passage at 400% zoom',
				expectation: 'glyph strokes are crisp at the magnified size; no blur or stair-stepping characteristic of bilinear upsample.'
			}
		},
		{
			name: 'focal-dim-relationship',
			definition:
				'Surrounding (non-focal) body is dimmed to a deterministic alpha while the focal passage holds full ink intensity.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § focal slot resolution — non-focal text alpha reduced to 0.35–0.45 during the focal window.',
			probe: {
				kind: 'named-observation',
				region: 'body text outside the focal passage during the focal window',
				expectation: 'non-focal text is visibly dimmer than focal text; ratio is stable across re-renders.'
			}
		},
		{
			name: 'edge-treatment',
			implementation:
				'src/lib/pipelines/annotations/magnify/index.ts § computeFocalSlot — the lens is a fixed-size rect (anchor line-height, width capped at 4.5× line-height); the AnnotationFocalSlot carries only { rect, magnify, dim, tear } and no edge field, so the boundary is intrinsic to the renderer, not Pack-resolved.',
			definition: 'How the magnified slot meets the surrounding dimmed body — a fixed-size rect lens with an intrinsic boundary.',
			probe: {
				kind: 'named-observation',
				region: 'boundary between the magnified focal slot and the dimmed surrounding text',
				expectation: 'the magnified slot is a fixed-size rect (≈4.5× line-height max width) with a hard boundary against the surrounding body; the boundary is stable across re-renders.'
			}
		},
		{
			name: 'depth-treatment',
			implementation:
				'src/lib/pipelines/annotations/magnify/index.ts § computeFocalSlot — no lens chrome is painted; the AnnotationFocalSlot returns { rect, magnify, dim, tear } with no shadow/rim/refraction field, so the focal slot has no implied depth around it.',
			definition: 'Lens chrome around the focal slot — intrinsically none; the focal slot carries no shadow/rim/refraction.',
			probe: {
				kind: 'named-observation',
				region: 'area immediately around the focal slot',
				expectation: 'there is no drop shadow, rim, or refraction chrome around the focal slot — only the magnified rect against the dimmed body.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/pipelines/annotations/magnify — lens enter motion intrinsic to computeFocalSlot reveal envelope (exponential ease).',
			definition: 'Shape of the focal entry motion (scale-in, fade, drop, none).',
			probe: {
				kind: 'named-observation',
				region: 'first ~6% of the focal window',
				expectation: 'the lens snaps in over the first ~10% of the bar via an exponential-ease reveal envelope (easeOutExpo on enter), holds at full scale, then snaps out over the final ~10% (easeInExpo); intrinsic, not Pack-driven.'
			}
		}
	]
};
