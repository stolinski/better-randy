import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { VARIANT_IDS } from './variants/variant-ids';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

/**
 * Type-hero Surface — family Pipeline per ADR-0020. Hosts the `single` and
 * `pair` variants under one Identity Spec; the family\'s shaderPass
 * (typeHeroRake) is variant-agnostic — both variants honour the raked-
 * light treatment dimension on the family Identity Spec. Adding a new
 * variant is one file in `variants/` + one entry in `variants/index.ts`.
 */

function defaults(): SurfaceState {
	return {
		type: 'type-hero',
		variant: 'single',
		content: {
			title: 'DRIFT',
			author: 'Episode 47 — 2026',
			body: parseAnnotationBodyText('')
		}
	};
}

export const typeHeroSurfaceDefinition = {
	type: 'type-hero',
	label: 'Type hero',
	controls: {
		title: true,
		author: true,
		// Secondary word beside the primary; only the `pair` variant renders it.
		counterpoint: true,
		body: 'never'
	},
	variantIds: VARIANT_IDS,
	defaults
} satisfies SurfacePipelineDefinition;
