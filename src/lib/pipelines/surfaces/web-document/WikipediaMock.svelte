<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — title/source/bodyLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the article's type scales from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// Content slots for the wikipedia layout: `title` = article title, `source` =
	// the italic subtitle ("From Wikipedia, the free encyclopedia"), `kicker` =
	// the section heading (the shared section-name slot), `body` = the section
	// prose carrying the hero `[highlight]` (the most body text of the three mocks).
	const title = $derived((content.title ?? '').trim());
	const subtitle = $derived(
		(content.source ?? '').trim() || 'From Wikipedia, the free encyclopedia'
	);
	const sectionHeading = $derived((content.kicker ?? '').trim());

	// Wikipedia's content column ≈ 740 px; scaled up for 4K-overlay legibility.
	const titleFontPx = $derived(width * 0.05);
	const subtitleFontPx = $derived(width * 0.024);
	const headingFontPx = $derived(width * 0.036);
	const bodyFontPx = $derived(width * 0.03);
</script>

<!-- Wikipedia article (Vector 2024 dark mode). Serif title/headings, sans body. -->
<article class="wiki-panel" style:padding={`${width * 0.038}px`} style:gap={`${width * 0.018}px`}>
	{#if title}
		<h1
			class="wiki-title"
			data-supers-readable-id="surface:web-document:title"
			data-supers-readable-text={title}
			data-supers-text-role="found-document-title"
			style:font-size={`${titleFontPx}px`}
		>
			{title}
		</h1>
	{/if}
	<p
		class="wiki-subtitle"
		data-supers-readable-id={content.source
			? 'surface:web-document:source'
			: 'surface:web-document:chrome:wikipedia-subtitle'}
		data-supers-readable-text={subtitle}
		data-supers-text-role="found-document-metadata"
		style:font-size={`${subtitleFontPx}px`}
	>
		{subtitle}
	</p>

	{#if sectionHeading}
		<h2
			class="wiki-heading"
			data-supers-readable-id="surface:web-document:kicker"
			data-supers-readable-text={sectionHeading}
			data-supers-text-role="found-document-metadata"
			style:font-size={`${headingFontPx}px`}
		>
			{sectionHeading}
		</h2>
	{/if}

	<DocumentBody
		body={content.body}
		fontSize={bodyFontPx}
		readablePrefix="surface:web-document:body"
	/>
</article>

<style>
	/*
	 * Wikipedia article — Vector (light) skin. The panel is the only opaque
	 * element; the browser frame around it (CanvasSource) stays transparent.
	 * Wikipedia light palette: bg #ffffff · text #202122 · secondary #54595d ·
	 * rule #a2a9b1 · link #3366cc. Signature look: serif title + section headings
	 * with a thin underline rule, sans-serif body. The hand-pulled amber highlight
	 * runs in the light (multiply) blend mode here — the dark body ink stays
	 * readable under the band, the same way it lands on paper.
	 */
	.wiki-panel {
		--wk-bg: #ffffff;
		--wk-text: #202122;
		--wk-meta: #54595d;
		--wk-rule: #a2a9b1;
		background-color: var(--wk-bg);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--wk-text);
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.wiki-title {
		border-block-end: 1px solid var(--wk-rule);
		font-family: 'Linux Libertine', Georgia, 'Times New Roman', serif;
		font-weight: 400;
		line-height: 1.1;
		margin: 0;
		padding-block-end: 0.18em;
	}
	.wiki-subtitle {
		color: var(--wk-meta);
		font-style: italic;
		margin: 0;
	}
	.wiki-heading {
		border-block-end: 1px solid var(--wk-rule);
		font-family: 'Linux Libertine', Georgia, 'Times New Roman', serif;
		font-weight: 400;
		line-height: 1.2;
		margin: 0;
		margin-block-start: 0.2em;
		padding-block-end: 0.16em;
	}
</style>
