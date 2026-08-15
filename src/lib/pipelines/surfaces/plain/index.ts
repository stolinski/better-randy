import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { createPlainPipeline } from './pipeline';
import { plainSurfaceDefinition } from './definition';
export const plainSurfaceRenderer: SurfaceRenderer = {
	...plainSurfaceDefinition,
	CanvasSource,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
