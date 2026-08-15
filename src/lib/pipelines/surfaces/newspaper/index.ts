import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { newspaperPhysics } from '$lib/pipelines/shader-passes/newspaper-physics';

import CanvasSource from './CanvasSource.svelte';

import { newspaperSurfaceDefinition } from './definition';
export const newspaperSurfaceRenderer: SurfaceRenderer = {
	...newspaperSurfaceDefinition,
	CanvasSource,
	shaderPass: newspaperPhysics,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline(opts);
	}
};
