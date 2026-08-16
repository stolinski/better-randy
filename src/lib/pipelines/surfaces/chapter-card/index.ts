import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { chapterCardBackdrop } from '$lib/pipelines/shader-passes/chapter-card-backdrop';

import CanvasSource from './CanvasSource.svelte';
import { chapterCardSurfaceDefinition } from './definition';
export const chapterCardSurfaceRenderer: SurfaceRenderer = {
	...chapterCardSurfaceDefinition,
	CanvasSource,
	shaderPass: chapterCardBackdrop,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
