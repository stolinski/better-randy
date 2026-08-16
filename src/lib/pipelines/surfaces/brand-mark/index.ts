import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { brandMarkSurfaceDefinition } from './definition';

export const brandMarkSurfaceRenderer: SurfaceRenderer = {
	...brandMarkSurfaceDefinition,
	CanvasSource,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
