import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { checklistSurfaceDefinition } from './definition';
export const checklistSurfaceRenderer: SurfaceRenderer = {
	...checklistSurfaceDefinition,
	CanvasSource,
	createPipeline(opts): SurfaceRenderInstance {
		// `flat` substrate — a chrome card / bare type over footage, not
		// photographed paper (no fiber grain bake).
		return createPaperPipeline({ ...opts, substrate: 'flat' });
	}
};
