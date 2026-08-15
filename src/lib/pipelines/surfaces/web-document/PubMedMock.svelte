<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';
	import type { DeterministicNonReadableTextReason } from '$lib/platform/pipelines/types';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — source/author/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the PubMed page scales from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// PubMed maps the annotation-capable body slot to the article title so a
	// title can carry the shared `[highlight]` mark without a second text model.
	const citation = $derived((content.source ?? '').trim());
	const author = $derived((content.author ?? '').trim());
	const identifiers = $derived((content.dateLabel ?? '').trim());

	const utilityFontPx = $derived(width * 0.018);
	const searchFontPx = $derived(width * 0.021);
	const citationFontPx = $derived(width * 0.022);
	const titleFontPx = $derived(width * (width > 2200 ? 0.063 : 0.072));
	const metaFontPx = $derived(width * 0.021);
	const decorativeSymbolReason: DeterministicNonReadableTextReason = 'decorative-symbol';
	const rasterizedArtifactTextReason: DeterministicNonReadableTextReason =
		'rasterized-artifact-text';
</script>

<!-- PubMed article: NLM masthead/search followed by the citation record. -->
<article class="pubmed-panel">
	<header class="pubmed-header" style:padding={`${width * 0.022}px ${width * 0.06}px`}>
		<div class="pubmed-utility" style:font-size={`${utilityFontPx}px`}>
			<span
				class="pubmed-ncbi"
				data-supers-readable-id="surface:web-document:chrome:ncbi"
				data-supers-readable-text="NCBI"
				data-supers-text-role="found-document-metadata">NCBI</span
			>
			<span
				data-supers-readable-id="surface:web-document:chrome:library-name"
				data-supers-readable-text="National Library of Medicine"
				data-supers-text-role="found-document-metadata">National Library of Medicine</span
			>
			<span
				class="pubmed-login"
				data-supers-readable-id="surface:web-document:chrome:login"
				data-supers-readable-text="Log in"
				data-supers-text-role="found-document-metadata">Log in</span
			>
		</div>
		<div class="pubmed-search-row" style:gap={`${width * 0.02}px`}>
			<img
				class="pubmed-logo"
				src="/web-document-pubmed/pubmed-logo.png"
				alt="PubMed"
				data-supers-non-readable-reason={rasterizedArtifactTextReason}
				style:inline-size={`${width * 0.15}px`}
			/>
			<div class="pubmed-search" style:font-size={`${searchFontPx}px`}>
				<span
					data-supers-readable-id="surface:web-document:chrome:search-placeholder"
					data-supers-readable-text="Search PubMed"
					data-supers-text-role="found-document-metadata">Search PubMed</span
				>
				<span
					class="pubmed-search-button"
					aria-hidden="true"
					data-supers-non-readable-reason={decorativeSymbolReason}>⌕</span
				>
			</div>
		</div>
	</header>

	<div
		class="pubmed-record"
		style:padding={`${width * 0.038}px ${width * 0.06}px ${width * 0.046}px`}
		style:gap={`${width * 0.018}px`}
	>
		{#if citation}
			<div
				class="pubmed-citation"
				data-supers-readable-id="surface:web-document:source"
				data-supers-readable-text={citation}
				data-supers-text-role="found-document-metadata"
				style:font-size={`${citationFontPx}px`}
			>
				{citation}
			</div>
		{/if}

		<div class="pubmed-title">
			<DocumentBody
				body={content.body}
				fontSize={titleFontPx}
				readablePrefix="surface:web-document:body"
			/>
		</div>

		{#if author}
			<div
				class="pubmed-author"
				data-supers-readable-id="surface:web-document:author"
				data-supers-readable-text={author}
				data-supers-text-role="found-document-metadata"
				style:font-size={`${metaFontPx}px`}
			>
				{author}
			</div>
		{/if}
		{#if identifiers}
			<div
				class="pubmed-identifiers"
				data-supers-readable-id="surface:web-document:date-label"
				data-supers-readable-text={identifiers}
				data-supers-text-role="found-document-metadata"
				style:font-size={`${metaFontPx}px`}
			>
				{identifiers}
			</div>
		{/if}

		<div class="pubmed-actions" style:font-size={`${utilityFontPx}px`} aria-hidden="true">
			<span
				data-supers-readable-id="surface:web-document:chrome:save"
				data-supers-readable-text="Save"
				data-supers-text-role="found-document-metadata">Save</span
			><span
				data-supers-readable-id="surface:web-document:chrome:email"
				data-supers-readable-text="Email"
				data-supers-text-role="found-document-metadata">Email</span
			><span
				data-supers-readable-id="surface:web-document:chrome:send-to"
				data-supers-readable-text="Send to"
				data-supers-text-role="found-document-metadata">Send to</span
			><span
				data-supers-readable-id="surface:web-document:chrome:display-options"
				data-supers-readable-text="Display options"
				data-supers-text-role="found-document-metadata">Display options</span
			>
		</div>
	</div>
</article>

<style>
	/*
	 * PubMed's light article record keeps its native federal-blue identity. The
	 * browser frame around it stays transparent; the shared screen shader owns
	 * emissive optics and the shared light-surface compositor owns the mark.
	 */
	.pubmed-panel {
		--pubmed-blue: #2567a2;
		--pubmed-blue-dark: #17466f;
		--pubmed-link: #1a5a96;
		--pubmed-ink: #1b1b1b;
		--pubmed-meta: #5f6368;
		background: #ffffff;
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--pubmed-ink);
		display: grid;
		font-family: Arial, Helvetica, sans-serif;
		overflow: hidden;
	}

	.pubmed-header {
		background: var(--pubmed-blue);
		color: #ffffff;
		display: grid;
		gap: 0.9em;
	}
	.pubmed-utility,
	.pubmed-search-row {
		align-items: center;
		display: flex;
	}
	.pubmed-utility {
		color: #dbe8f3;
		gap: 0.8em;
	}
	.pubmed-ncbi {
		border-inline-end: 1px solid rgb(255 255 255 / 0.45);
		color: #ffffff;
		font-weight: 700;
		padding-inline-end: 0.8em;
	}
	.pubmed-login {
		margin-inline-start: auto;
	}
	.pubmed-logo {
		display: block;
		flex: 0 0 auto;
		height: auto;
	}
	.pubmed-search {
		align-items: center;
		background: #ffffff;
		border-radius: 0.28em;
		color: #6b7280;
		display: flex;
		flex: 1 1 auto;
		justify-content: space-between;
		overflow: hidden;
		padding-inline-start: 0.8em;
	}
	.pubmed-search-button {
		align-items: center;
		background: var(--pubmed-blue-dark);
		color: #ffffff;
		display: inline-flex;
		font-size: 1.35em;
		justify-content: center;
		padding: 0.34em 0.7em;
	}

	.pubmed-record {
		display: grid;
	}
	.pubmed-citation {
		color: var(--pubmed-meta);
		font-weight: 700;
	}
	.pubmed-title :global(.document-body) {
		font-family: Arial, Helvetica, sans-serif;
		font-weight: 700;
		letter-spacing: -0.018em;
		line-height: 1.12;
	}
	.pubmed-author {
		color: var(--pubmed-link);
		text-decoration: underline;
	}
	.pubmed-identifiers {
		color: var(--pubmed-meta);
	}
	.pubmed-actions {
		border-block-start: 1px solid #d8dee4;
		color: var(--pubmed-link);
		display: flex;
		gap: 1.5em;
		margin-block-start: 0.3em;
		padding-block-start: 1em;
	}
</style>
