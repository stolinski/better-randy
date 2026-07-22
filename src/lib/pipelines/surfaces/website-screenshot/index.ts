import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import { webDocumentScreen } from '$lib/pipelines/shader-passes/web-document-screen';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

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

export const websiteScreenshotSurfaceRenderer: SurfaceRenderer = {
	type: 'website-screenshot',
	label: 'Website screenshot',
	controls: {
		body: 'never',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true,
		websiteCapture: true
	},
	CanvasSource,
	defaults,
	shaderPass: webDocumentScreen,
	disablePackMaterial: true,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline({ ...opts, substrate: 'flat' });
	}
};
