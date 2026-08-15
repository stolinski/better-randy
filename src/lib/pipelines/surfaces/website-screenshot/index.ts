import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import { webDocumentScreen } from '$lib/pipelines/shader-passes/web-document-screen';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { websiteScreenshotSurfaceDefinition } from './definition';
export const websiteScreenshotSurfaceRenderer: SurfaceRenderer = {
	...websiteScreenshotSurfaceDefinition,
	CanvasSource,
	shaderPass: webDocumentScreen,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline({ ...opts, substrate: 'flat' });
	}
};
