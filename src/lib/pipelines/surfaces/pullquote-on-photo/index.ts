import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { pullquotePhotoBackdrop } from '$lib/pipelines/shader-passes/pullquote-photo-backdrop';

import CanvasSource from './CanvasSource.svelte';

/**
 * Pullquote-on-photo Surface — cinematic full-frame pullquote on a
 * synthesised photographic substrate. Reuses the plain Pipeline's transparent
 * runtime scaffolding for DOM upload + composite; the substrate look is
 * carried entirely by the `pullquotePhotoBackdrop` shaderPass (radial warmth
 * gradient + multi-octave noise + warm focal halo + heavy edge vignette).
 * Designed as a hero demo Preset that exercises shader-side compositing at
 * a level the existing card-based presets don't.
 */

function defaults(): SurfaceState {
	return {
		type: 'pullquote-on-photo',
		content: {
			title: 'The work that lasts is the work that responds gracefully to weather you did not predict.',
			author: 'Notebooks',
			body: parseAnnotationBodyText('')
		}
	};
}

export const pullquoteOnPhotoSurfaceRenderer: SurfaceRenderer = {
	type: 'pullquote-on-photo',
	label: 'Pullquote on photo',
	controls: {
		title: true,
		author: true,
		body: 'never'
	},
	CanvasSource,
	defaults,
	shaderPass: pullquotePhotoBackdrop,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
