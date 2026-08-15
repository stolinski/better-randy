import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

function defaults(): SurfaceState {
	return {
		type: 'plain',
		content: {
			body: parseAnnotationBodyText('')
		}
	};
}

export const plainSurfaceDefinition = {
	type: 'plain',
	label: 'Plain',
	controls: {
		body: 'optional',
		typography: true,
		inkColor: true
	},
	defaults
} satisfies SurfacePipelineDefinition;
