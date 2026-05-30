/**
 * Identity Spec for the `pullquote-on-photo` Surface — per ADR-0015. A
 * material-kind Surface: the substrate is a real photographic image with
 * vignette, light interaction with the overlaid text, and a focal halo
 * behind the active word. Per the project memory note "research-paper
 * presets stay photoreal" the substrate must read as a photograph, not a
 * coloured plate.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const pullquoteOnPhotoIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a passage of typographic body text laid over a real photographic substrate',
	dimensions: [
		{
			name: 'photo-substrate',
			definition:
				'The substrate is a real photographic image rendered with its own luminance and colour ambient, not a flat fill or a desaturated plate.',
			implementation:
				'src/lib/pipelines/surfaces/pullquote-on-photo/CanvasSource.svelte — image element captured via HTML-in-Canvas at native resolution; no flat-colour fallback.',
			probe: {
				kind: 'named-observation',
				region: 'a photo-only patch away from text',
				expectation:
					'patch carries real photographic luminance variation, lens character, and ambient colour; no flat fill, no posterization.'
			}
		},
		{
			name: 'vignette-for-text-contrast',
			definition:
				'Edges of the photo are vignetted 40–60% so overlaid text holds contrast against the substrate.',
			implementation:
				'CSS radial gradient mask on the photo element + a multiplicative vignette pass in the surface shader path.',
			probe: {
				kind: 'named-observation',
				region: 'photo corner vs centre',
				expectation: 'corner luma is 40–60% lower than centre luma on otherwise-equivalent photo content.'
			}
		},
		{
			name: 'focal-halo',
			definition:
				'A warm soft halo sits behind the active focal word, implying a light source on the page.',
			implementation:
				'pullquote-on-photo CanvasSource — radial gradient halo positioned by the focal-word index resolved per frame from text-animation state.',
			probe: {
				kind: 'named-observation',
				region: 'area immediately behind the focal word',
				expectation:
					'soft warm gradient visible behind the active word; halo translates with the focal index as the animation progresses.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'pullquote-on-photo.ink',
			definition: 'Body text ink colour on the photographic substrate.',
			probe: {
				kind: 'named-observation',
				region: 'body text colour',
				expectation:
					'ink colour resolves through the active Pack manifest pullquote-on-photo.ink Role (the colour the CanvasSource quote paints via var(--ink)).'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'pullquote-on-photo CanvasSource — focal/brightness word-reveal driven per frame by the focal-word index from text-animation state, sequenced by mount timing; intrinsic to the pipeline, not pack appearance.',
			definition: 'Shape of the focal-word reveal across the passage.',
			probe: {
				kind: 'named-observation',
				region: 'focal-word transitions across the timeline',
				expectation:
					'word-reveal focus shape pulls from heavy disc-bokeh blur to pin-sharp over the first ~22% of progress, intrinsic to the pullquote-photo-backdrop shaderPass — no Pack Role involved.'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/pipelines/surfaces/pullquote-on-photo/CanvasSource.svelte — `.pullquote-source__attribution` is absolutely positioned bottom-centred (inset-block-end:12%; inset-inline:0; margin:0 auto; text-align:center); placement is intrinsic CSS, not Pack appearance.',
			definition:
				'Attribution placement (anchor + offset + scale) relative to the passage and the photo frame.',
			probe: {
				kind: 'named-observation',
				region: 'attribution slot',
				expectation:
					'attribution sits bottom-centred in the lower band of the frame, centred horizontally and offset up from the bottom edge.'
			}
		}
	]
};
