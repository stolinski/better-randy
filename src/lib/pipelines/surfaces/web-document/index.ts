import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

/**
 * web-document Surface — a clean, recognizable site card on a transparent
 * overlay frame (the first **emissive** Surface). One Surface, per-site layout
 * = content (a Svelte mock captured via HTML-in-Canvas, selected by
 * `surface.site`); v1 ships the `twitter` layout. See
 * docs/briefs/web-document-demo.md.
 *
 * Reuses the `paper` Pipeline's runtime scaffolding (HTML-in-canvas DOM upload
 * + marks textures + composite) so the existing `highlight` Annotation lands on
 * the post body's `[highlight]` hero span exactly as it does on other Surfaces.
 *
 * Skeleton state (dex 4sge20km): the card look is carried entirely by the
 * CanvasSource CSS. No `shaderPass` yet — the per-pixel emissive optical pass
 * (subpixel emission, backlight bloom, viewport edge defocus) lands in T3 (dex
 * f0j654gu), at which point it attaches here as `shaderPass` and the Identity
 * Spec (`./identity.ts`) gains those dimensions.
 */

function defaults(): SurfaceState {
	return {
		type: 'web-document',
		site: 'twitter',
		content: {
			author: 'Dev Notes',
			source: '@devnotes',
			dateLabel: '2:14 PM · Jun 22, 2026',
			sourceUrl: 'x.com/devnotes/status/1934000000000000000',
			body: parseAnnotationBodyText(
				'Spent all weekend chasing a slow build. Turns out [highlight]the bottleneck was a console.log inside a hot loop[/highlight] — pulled it and the bundle step dropped 4x.'
			)
		},
		// Settle-in enter; no exit — a transparent overlay holds on its last
		// frame so a creator can freeze/extend it. The ~6s enter → highlight →
		// hold timeline is authored per-preset (dex pqmziqtl / ojdzid3x).
		enter: { start: 0, duration: 0.13, ease: 'settled' }
	};
}

export const webDocument: SurfaceRenderer = {
	type: 'web-document',
	label: 'Web document',
	controls: {
		title: false,
		author: true,
		source: true,
		dateLabel: true,
		sourceUrl: true,
		body: 'always',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true
	},
	CanvasSource,
	defaults,
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline({ ...opts, highlightSurface: 'dark' });
	}
};
