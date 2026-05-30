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
			viaPack: 'magnify.lensEdge',
			definition: 'How the magnified slot meets the surrounding dimmed body (sharp, soft, chromatic).',
			probe: {
				kind: 'named-observation',
				region: 'boundary between the magnified focal slot and the dimmed surrounding text',
				expectation: 'edge treatment resolves through the magnify.lensEdge Role.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'magnify.lensDepth',
			definition: 'Any implied lens chrome (shadow, rim, glass refraction) around the focal slot.',
			probe: {
				kind: 'named-observation',
				region: 'area immediately around the focal slot',
				expectation: 'lens chrome resolves through the magnify.lensDepth Role.'
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
				expectation: 'enter motion resolves through the magnify.enterMotion Role.'
			}
		}
	]
};
