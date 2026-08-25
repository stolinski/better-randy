import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const brandMarkIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a registered brand silhouette centered as a full-frame chapter break',
	dimensions: [
		{
			name: 'mark-silhouette',
			definition: 'The selected registered brand mark keeps its exact authored geometry.',
			implementation:
				'src/lib/pipelines/surfaces/brand-mark/CanvasSource.svelte renders the selected variant from its canonical vector paths.',
			probe: {
				kind: 'named-observation',
				region: 'centered mark',
				expectation: 'the complete registered logo is recognizable and undistorted.'
			}
		},
		{
			name: 'ink-treatment',
			viaPack: 'accent-treatment',
			definition: 'The brand silhouette uses the active Pack accent.',
			probe: {
				kind: 'named-observation',
				region: 'logo fill',
				expectation: 'the silhouette resolves to the active Pack accent treatment.'
			}
		},
		{
			name: 'sponsor-ink-treatment',
			viaPack: 'field-ink-treatment',
			definition: 'The sponsor lockup uses the active Pack ink paired with its full-frame field.',
			probe: {
				kind: 'named-observation',
				region: 'sponsor lockup',
				expectation:
					'the sponsor text and mark remain readable against the active Pack field without a fixed white raster.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'The mark is large, centered, and aspect-preserving while its sponsor lockup remains safe in both transports.',
			implementation:
				'src/lib/pipelines/surfaces/brand-mark/CanvasSource.svelte sizes the SVG from the smaller frame axis, centers it, and raises the sponsor lockup above the vertical platform UI band.',
			probe: {
				kind: 'named-observation',
				region: 'full horizontal and vertical frames',
				expectation:
					'the mark remains centered and large, and the sponsor lockup stays inside platform-safe bounds.'
			}
		},
		{
			name: 'motion-form',
			definition: 'The mark uses the Surface GPU alpha channel for a smooth deterministic fade.',
			implementation:
				'src/lib/platform/composition-animation-manifest.ts drives paperVisibility from authored Surface opacity keyframes; the plain Surface pipeline multiplies captured pixels on the GPU.',
			probe: {
				kind: 'named-observation',
				region: 'mark entrance and exit',
				expectation: 'the logo fades without translation, scale, or opacity popping.'
			}
		}
	]
};
