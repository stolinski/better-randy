import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

/**
 * Title-sequence Surface — hero title moment for an episode opener.
 * Reuses the plain Pipeline's transparent runtime scaffolding for DOM upload
 * + composite; the drop motion, 12-tap directional motion blur, impact flash,
 * settle shake, and atmospheric backdrop are all carried by the
 * `titleSequenceDrop` shaderPass. Layout: optional kicker above the hero
 * title; bold condensed sans title at hero scale (~92 px cap-height ratio at
 * 4K).
 */

function defaults(): SurfaceState {
	return {
		type: 'title-sequence',
		content: {
			kicker: 'EPISODE 47',
			title: 'Escape Velocity',
			body: parseAnnotationBodyText('')
		}
	};
}

export const titleSequenceSurfaceDefinition = {
	type: 'title-sequence',
	label: 'Title sequence',
	controls: {
		kicker: true,
		title: true,
		body: 'never'
	},
	defaults
} satisfies SurfacePipelineDefinition;
