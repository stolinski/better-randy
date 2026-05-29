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
			viaPack: 'pullquote-on-photo.inkFill',
			definition: 'Body text ink colour on the photographic substrate.',
			probe: {
				kind: 'named-observation',
				region: 'body text colour',
				expectation:
					'ink colour resolves through the active Pack manifest pullquote-on-photo.inkFill Role.'
			}
		},
		{
			name: 'motion-form',
			viaPack: 'pullquote-on-photo.focalMotion',
			definition: 'Shape of the focal-word reveal across the passage.',
			probe: {
				kind: 'named-observation',
				region: 'focal-word transitions across the timeline',
				expectation:
					'focal motion shape resolves through the active Pack manifest pullquote-on-photo.focalMotion Role.'
			}
		},
		{
			name: 'frame-relationship',
			viaPack: 'pullquote-on-photo.attribution',
			definition:
				'Attribution placement (anchor + offset + scale) relative to the passage and the photo frame.',
			probe: {
				kind: 'named-observation',
				region: 'attribution slot',
				expectation:
					'attribution placement resolves through the pullquote-on-photo.attribution Role.'
			}
		}
	]
};
