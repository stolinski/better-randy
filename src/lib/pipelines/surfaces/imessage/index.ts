import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { imessageSurfaceDefinition } from './definition';
export const imessageSurfaceRenderer: SurfaceRenderer = {
	...imessageSurfaceDefinition,
	CanvasSource,
	createPipeline(opts): SurfaceRenderInstance {
		// `flat` substrate — a phone screen, not photographed paper (no fiber grain).
		return createPaperPipeline({ ...opts, substrate: 'flat' });
	}
};
