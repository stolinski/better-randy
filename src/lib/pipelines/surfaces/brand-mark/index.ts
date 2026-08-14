import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

export const BRAND_MARK_VARIANT_IDS = ['syntax-fm'] as const;

function defaults(): SurfaceState {
	return {
		type: 'brand-mark',
		variant: 'syntax-fm',
		content: { body: parseAnnotationBodyText('') }
	};
}

export const brandMarkSurfaceRenderer: SurfaceRenderer = {
	type: 'brand-mark',
	label: 'Brand mark',
	controls: {
		body: 'never',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true
	},
	variantIds: BRAND_MARK_VARIANT_IDS,
	CanvasSource,
	defaults,
	createPipeline(opts): SurfaceRenderInstance {
		return createPlainPipeline(opts);
	}
};
