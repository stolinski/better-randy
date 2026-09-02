import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';
import { WEBSITE_SCREENSHOT_FRAMINGS } from '$lib/utils/website-showcase';

function defaults(): SurfaceState {
	return {
		type: 'website-screenshot',
		content: {
			body: parseAnnotationBodyText(''),
			sourceUrl: 'https://github.com/syntaxfm'
		},
		enter: { start: 0, duration: 0.07, ease: 'settled' },
		exit: { start: 0.9, duration: 0.1, ease: 'smooth' }
	};
}

export const websiteScreenshotSurfaceDefinition = {
	type: 'website-screenshot',
	label: 'Website screenshot',
	variantIds: WEBSITE_SCREENSHOT_FRAMINGS,
	controls: {
		body: 'never',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true,
		websiteCapture: true
	},
	defaults,
	disablePackMaterial: true
} satisfies SurfacePipelineDefinition;
