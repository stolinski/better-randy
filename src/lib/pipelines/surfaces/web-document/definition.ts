import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

/**
 * web-document Surface — a clean, recognizable site card on a transparent
 * overlay frame (the first **emissive** Surface). One Surface, per-site layout
 * = content: an inner Svelte mock captured via HTML-in-Canvas, selected by
 * `surface.site` (`twitter` / `reddit` / `wikipedia` / `hackernews` / `github` /
 * `youtube` / `news` / `pubmed`). A mix of dark pages
 * (twitter/reddit/github/youtube) and light pages
 * (wikipedia/hackernews/news/pubmed); the highlight blend mode follows each
 * page's paperColor luminance, so dark pages punch text to ink and light pages
 * multiply. CanvasSource owns the shared browser chrome + address bar + enter
 * motion; each site mock owns its panel. See
 * docs/adr/0030-web-document-emissive-surface.md.
 *
 * Reuses the `paper` Pipeline's runtime scaffolding (HTML-in-canvas DOM upload
 * + marks textures + composite) with the `dark`-surface highlight mode, so the
 * existing `highlight` Annotation lands readably (clean amber band + light text
 * punched to ink) on the post body's `[highlight]` hero span. The emissive
 * "backlit display" optics (subpixel emission, backlight bloom, escaping-bezel
 * halo, viewport-edge defocus) are the `shaderPass` below; the Identity Spec
 * (`./identity.ts`) declares + probes each dimension.
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

export const webDocumentSurfaceDefinition = {
	type: 'web-document',
	label: 'Web document',
	controls: {
		// title = reddit/wikipedia post title; kicker = wikipedia section heading.
		// Both unused by the twitter mock (an empty value hides the row).
		title: true,
		kicker: true,
		author: true,
		// avatarUrl = the tweet author's profile photo; only the twitter mock
		// consumes it, so the inspector gates the row on `surface.site`.
		avatarUrl: true,
		source: true,
		dateLabel: true,
		sourceUrl: true,
		site: true,
		// bodyLabel = the wikipedia mock's section label; hidden unless the
		// composition carries the slot (same rule as title/kicker).
		bodyLabel: true,
		body: 'always',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true
	},
	defaults
} satisfies SurfacePipelineDefinition;
