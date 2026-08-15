import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const BRAND_MARK_VARIANT_IDS = ['syntax-fm'] as const;

function defaults(): SurfaceState {
	return {
		type: 'brand-mark',
		variant: 'syntax-fm',
		content: { body: parseAnnotationBodyText('') }
	};
}

export const brandMarkSurfaceDefinition = {
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
	defaults
} satisfies SurfacePipelineDefinition;
