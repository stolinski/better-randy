import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { pullquotePhotoBackdrop } from '$lib/pipelines/shader-passes/pullquote-photo-backdrop';

import CanvasSource from './CanvasSource.svelte';
import { pullquoteOnPhotoSurfaceDefinition } from './definition';
export const pullquoteOnPhotoSurfaceRenderer: SurfaceRenderer = {
	...pullquoteOnPhotoSurfaceDefinition,
	CanvasSource,
	shaderPass: pullquotePhotoBackdrop,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
