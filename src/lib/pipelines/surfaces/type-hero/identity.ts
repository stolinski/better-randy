/**
 * Identity Spec for the `type-hero` Surface — per ADR-0015. The signature
 * "single massive display word" Surface, with two intrinsic dimensions: a
 * type-aware raked-light treatment (the `typeHeroRake` shader pass owns
 * `light-treatment`) and an asymmetric flush-left composition that owns
 * `frame-relationship`. The remaining four dimensions concede to the active
 * Pack per ADR-0019. When the `pair` variant (Phase 4.1 of the motion-
 * primitives plan) lands, this spec is inherited unchanged — both variants
 * implement every dimension declared here.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const typeHeroIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a single display word at composition scale with raked directional light on its letterforms',
	dimensions: [
		{
			name: 'fill-treatment',
			viaPack: 'type-hero.inkFill',
			definition: 'The base fill of the hero word and the subtitle slot.',
			probe: {
				kind: 'named-observation',
				region: 'hero word body',
				expectation: 'fill resolves through the type-hero.inkFill Role.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'type-hero.edge',
			definition: 'Glyph edge character (clean vector, ink bleed, dilation, none).',
			probe: {
				kind: 'named-observation',
				region: 'hero word glyph edge at 400% zoom',
				expectation: 'edge treatment resolves through the type-hero.edge Role.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'type-hero.depth',
			definition: 'Any implied depth under the hero word.',
			probe: {
				kind: 'named-observation',
				region: 'beneath the hero word strokes',
				expectation: 'depth treatment resolves through the type-hero.depth Role.'
			}
		},
		{
			name: 'light-treatment',
			definition:
				'Edge-detected directional rim light on the letterforms with counter-shadow on the opposing edge, implying an upper-left light source.',
			implementation:
				'src/lib/pipelines/shader-passes/type-hero-rake.ts — edge-detection + dot-product against the implied light vector for the rim; opposing tap for the counter-shadow.',
			probe: {
				kind: 'named-observation',
				region: 'hero word strokes — upper-left vs lower-right edges',
				expectation:
					'upper-left stroke edges show a bright rim; lower-right stroke edges show a darker counter-shadow band; both effects are stronger on diagonal strokes than on horizontal ones (edge orientation matters).'
			}
		},
		{
			name: 'motion-form',
			viaPack: 'type-hero.enterMotion',
			definition: 'Shape of the hero word enter motion (drift, drop, scale, none).',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline',
				expectation: 'enter motion resolves through the type-hero.enterMotion Role.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Hero word is flush-left at composition scale; the mono subtitle slot anchors lower-right. The asymmetric layout supplies the compositional tension; centred variants are explicitly out of scope for this Pipeline.',
			implementation:
				'src/lib/pipelines/surfaces/type-hero/CanvasSource.svelte — CSS grid with hero word at top-left and subtitle absolutely anchored to bottom-right.',
			probe: {
				kind: 'named-observation',
				region: 'composition framing of the hero word and subtitle',
				expectation:
					'hero word baseline aligns to the left of the frame; subtitle sits in the bottom-right region; the upper-right quadrant carries no chrome.'
			}
		}
	]
};
