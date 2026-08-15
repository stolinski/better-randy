import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { typeHeroRake } from '$lib/pipelines/shader-passes/type-hero-rake';

import CanvasSource from './CanvasSource.svelte';
import { VARIANT_IDS } from './variants';
import { typeHeroSurfaceDefinition } from './definition';
export const typeHeroSurfaceRenderer: SurfaceRenderer = {
	...typeHeroSurfaceDefinition,
	CanvasSource,
	shaderPass: typeHeroRake,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};

/** Exported for engine-side variant validation. */
export const TYPE_HERO_VARIANT_IDS = VARIANT_IDS;
