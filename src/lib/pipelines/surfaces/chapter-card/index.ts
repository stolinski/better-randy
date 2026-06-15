import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { chapterCardBackdrop } from '$lib/pipelines/shader-passes/chapter-card-backdrop';

import CanvasSource from './CanvasSource.svelte';

/**
 * Chapter-card Surface — documentary-style chapter break. Slow shader-side
 * camera push with two-layer parallax over a deep cool substrate; a single
 * warm key-light implied from upper-right. Reuses the plain Pipeline's
 * transparent runtime scaffolding for DOM upload + composite; the cinematic
 * substrate look is carried entirely by the `chapterCardBackdrop` shaderPass.
 * Layout: centred kicker (e.g. "CHAPTER 03") above a huge serif title.
 */

function defaults(): SurfaceState {
	return {
		type: 'chapter-card',
		content: {
			kicker: 'CHAPTER 03',
			title: 'The Long Drift',
			body: parseAnnotationBodyText('')
		}
	};
}

export const chapterCard: SurfaceRenderer = {
	type: 'chapter-card',
	label: 'Chapter card',
	controls: {
		kicker: true,
		title: true,
		body: 'never'
	},
	CanvasSource,
	defaults,
	shaderPass: chapterCardBackdrop,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
