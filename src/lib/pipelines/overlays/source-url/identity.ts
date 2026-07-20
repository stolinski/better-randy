import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const sourceUrlIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a Pack-resolved source URL plate welded across a captured browser top edge',
	dimensions: [
		{
			name: 'fill-treatment',
			viaPack: 'source-url.plate',
			definition: 'The opaque matte plate behind the URL.',
			probe: {
				kind: 'named-observation',
				region: 'URL plate body',
				expectation: 'fill resolves from source-url.plate with no gradient or gloss.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'source-url.border',
			definition: 'The plate perimeter and visible boundary.',
			probe: {
				kind: 'named-observation',
				region: 'URL plate perimeter',
				expectation: 'a Pack-resolved visible edge cleanly contains the plate.'
			}
		},
		{
			name: 'corner-treatment',
			viaPack: 'source-url.radius',
			definition: 'The Pack-specific corner form.',
			probe: {
				kind: 'named-observation',
				region: 'URL plate corners',
				expectation: 'corner treatment matches source-url.radius.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'source-url.shadow',
			definition: 'The Pack-specific depth treatment beneath the plate.',
			probe: {
				kind: 'named-observation',
				region: 'beneath the URL plate',
				expectation:
					'depth matches source-url.shadow and remains distinct from the browser display optics.'
			}
		},
		{
			name: 'mono-chrome-voice',
			viaPack: 'source-url.fontLabel',
			definition: 'The URL uses the active Pack chrome face.',
			probe: {
				kind: 'named-observation',
				region: 'URL glyphs',
				expectation: 'URL typography resolves from source-url.fontLabel.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'The plate rises after the browser settles, pops into place, holds completely still, then leads the downward exit.',
			implementation:
				'src/lib/pipelines/overlays/source-url/CanvasSource.svelte maps the deterministic overlay progress to a short entry rise and full downward exit; the Preset Cascade welds its start to the Surface enter end.',
			probe: {
				kind: 'named-observation',
				region: 'URL plate entrance, hold, and exit',
				expectation:
					'one sharp settled rise, no hold drift, and a downward exit that begins before the browser.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'The plate stays horizontally centered with half its height above and half overlapping the browser chrome in both transports; it widens beyond the designed width to fit long URLs, capped at the browser width, so the citation reads in full.',
			implementation:
				'src/lib/utils/website-showcase.ts computes the shared browser-plus-plate stack from the active target safe area.',
			probe: {
				kind: 'named-observation',
				region: 'full horizontal and vertical frames',
				expectation:
					'the plate is centered across the browser top edge at a 50% overlap and remains inside the platform-safe region.'
			}
		}
	]
};
