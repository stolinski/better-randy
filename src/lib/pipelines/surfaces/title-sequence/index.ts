import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { titleSequenceDrop } from '$lib/pipelines/shader-passes/title-sequence-drop';

import CanvasSource from './CanvasSource.svelte';
import { titleSequenceSurfaceDefinition } from './definition';
export const titleSequenceSurfaceRenderer: SurfaceRenderer = {
	...titleSequenceSurfaceDefinition,
	CanvasSource,
	shaderPass: titleSequenceDrop,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
