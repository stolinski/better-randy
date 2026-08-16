import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { webDocumentScreen } from '$lib/pipelines/shader-passes/web-document-screen';

import CanvasSource from './CanvasSource.svelte';
import { webDocumentSurfaceDefinition } from './definition';
export const webDocumentSurfaceRenderer: SurfaceRenderer = {
	...webDocumentSurfaceDefinition,
	CanvasSource,
	// Emissive screen optics (subpixel emission, backlight bloom, edge halo,
	// luminance floor, viewport-edge defocus) — the material substance behind
	// the "web page on a backlit display" claim. Runs on the composited card
	// between DOM upload and the effect chain (ADR-0008 / ADR-0010).
	shaderPass: webDocumentScreen,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline({ ...opts, highlightSurface: 'dark' });
	}
};
