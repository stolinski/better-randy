<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';
	import type { DeterministicNonReadableTextReason } from '$lib/platform/pipelines/types';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — source/title/author/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the article's type scales from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// Content slots for the news layout: `source` = publication/section kicker,
	// `title` = headline, `author` = byline, `dateLabel` = date, `body` = the
	// article carrying the hero `[highlight]`. Publication-neutral so one mock
	// covers many outlets.
	const kicker = $derived((content.source ?? '').trim());
	const headline = $derived((content.title ?? '').trim());
	const author = $derived((content.author ?? '').trim());
	const date = $derived((content.dateLabel ?? '').trim());

	const kickerFontPx = $derived(width * 0.022);
	const headlineFontPx = $derived(width * 0.052);
	const bylineFontPx = $derived(width * 0.024);
	const bodyFontPx = $derived(width * 0.03);
	const decorativeSymbolReason: DeterministicNonReadableTextReason = 'decorative-symbol';
</script>

<!-- News article (light editorial): kicker · serif headline · byline · body. -->
<article class="news-panel" style:padding={`${width * 0.04}px`} style:gap={`${width * 0.016}px`}>
	{#if kicker}
		<div
			class="news-kicker"
			data-supers-readable-id="surface:web-document:source"
			data-supers-readable-text={kicker}
			data-supers-text-role="found-document-metadata"
			style:font-size={`${kickerFontPx}px`}
		>
			{kicker}
		</div>
	{/if}
	{#if headline}
		<h1
			class="news-headline"
			data-supers-readable-id="surface:web-document:title"
			data-supers-readable-text={headline}
			data-supers-text-role="surface-title"
			style:font-size={`${headlineFontPx}px`}
		>
			{headline}
		</h1>
	{/if}
	{#if author || date}
		<div class="news-byline" style:font-size={`${bylineFontPx}px`}>
			{#if author}<span class="news-author"
					><span
						data-supers-readable-id="surface:web-document:chrome:by"
						data-supers-readable-text="By"
						data-supers-text-role="found-document-metadata">By</span
					>
					<span
						data-supers-readable-id="surface:web-document:author"
						data-supers-readable-text={author}
						data-supers-text-role="found-document-metadata">{author}</span
					></span
				>{/if}{#if author && date}<span
					class="news-dot"
					aria-hidden="true"
					data-supers-non-readable-reason={decorativeSymbolReason}>·</span
				>{/if}{#if date}<span
					class="news-date"
					data-supers-readable-id="surface:web-document:date-label"
					data-supers-readable-text={date}
					data-supers-text-role="found-document-metadata">{date}</span
				>{/if}
		</div>
	{/if}
	<div class="news-rule"></div>
	<DocumentBody
		body={content.body}
		fontSize={bodyFontPx}
		readablePrefix="surface:web-document:body"
	/>
</article>

<style>
	/*
	 * News article — a publication-neutral light editorial page. The panel is the
	 * only opaque element; the browser frame around it (CanvasSource) stays
	 * transparent. Palette: page #ffffff · text #121212 · meta #6b6b6b · kicker
	 * accent #b80000 · rule #e2e2e2. Serif headline + body for editorial gravitas.
	 */
	.news-panel {
		--news-bg: #ffffff;
		--news-text: #121212;
		--news-meta: #6b6b6b;
		--news-accent: #b80000;
		--news-rule: #e2e2e2;
		background-color: var(--news-bg);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--news-text);
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.news-kicker {
		color: var(--news-accent);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.news-headline {
		color: var(--news-text);
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 700;
		line-height: 1.12;
		margin: 0;
	}
	.news-byline {
		color: var(--news-meta);
	}
	.news-dot {
		margin: 0 0.4em;
	}
	.news-rule {
		background-color: var(--news-rule);
		block-size: 1px;
		inline-size: 100%;
		margin-block: 0.2em;
	}
	/* Serif body to match the editorial headline. */
	.news-panel :global(.document-body) {
		font-family: Georgia, 'Times New Roman', serif;
	}
</style>
