import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { createPaperPipeline } from './pipeline';

function defaults(): SurfaceState {
	return {
		type: 'paper',
		content: {
			title: 'Untitled paper',
			sourceUrl: '',
			body: parseAnnotationBodyText('')
		},
		enter: { start: 0, duration: 0.18, ease: 'settled' },
		exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
	};
}

export const paper: SurfaceRenderer = {
	type: 'paper',
	label: 'Paper',
	controls: {
		title: true,
		sourceUrl: true,
		author: true,
		source: true,
		dateLabel: true,
		body: 'always',
		typography: true,
		paperColor: true,
		inkColor: true,
		backgroundVisibility: true,
		enterExit: true
	},
	CanvasSource,
	defaults,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline(opts);
	}
};
