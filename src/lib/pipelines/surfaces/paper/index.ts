import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

import { createPaperPipeline } from './pipeline';
import { paperSurfaceDefinition } from './definition';
export const paperSurfaceRenderer: SurfaceRenderer = {
	...paperSurfaceDefinition,
	CanvasSource,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline(opts);
	}
};
