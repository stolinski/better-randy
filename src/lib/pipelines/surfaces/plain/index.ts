import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import { createPlainPipeline } from './pipeline';

function defaults(): SurfaceState {
	return {
		type: 'plain',
		content: {
			body: parseAnnotationBodyText('')
		}
	};
}

export const plain: SurfaceRenderer = {
	type: 'plain',
	label: 'Plain',
	controls: {
		body: 'optional',
		typography: true,
		inkColor: true
	},
	CanvasSource,
	defaults,
	createPipeline(opts): SurfaceRenderInstance {
		const inner = createPlainPipeline(opts);
		return inner as unknown as SurfaceRenderInstance;
	}
};
