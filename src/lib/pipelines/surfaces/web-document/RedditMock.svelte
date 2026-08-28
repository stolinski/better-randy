<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';
	import type { DeterministicNonReadableTextReason } from '$lib/platform/pipelines/types';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — title/source/author/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the panel's type + controls scale from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// Content slots for the reddit layout: `source` = subreddit ("r/webdev"),
	// `author` = poster ("u/devnotes"), `dateLabel` = age ("6h"), `title` = post
	// title, `body` = post text carrying the hero `[highlight]`.
	const subreddit = $derived((content.source ?? '').trim());
	const poster = $derived((content.author ?? '').trim());
	const age = $derived((content.dateLabel ?? '').trim());
	const title = $derived((content.title ?? '').trim());

	// Reddit's status column ≈ 640 px; scaled up for 4K-overlay legibility.
	const titleFontPx = $derived(width * 0.044);
	const bodyFontPx = $derived(width * 0.034);
	const metaFontPx = $derived(width * 0.027);
	const scoreFontPx = $derived(width * 0.026);
	const voteIconPx = $derived(width * 0.04);
	const actionFontPx = $derived(width * 0.026);
	const actionIconPx = $derived(width * 0.032);
	const decorativeSymbolReason: DeterministicNonReadableTextReason = 'decorative-symbol';
</script>

<!-- Reddit post (classic night-mode card). Iconic left vote rail + content column. -->
<div class="reddit-panel">
	<div class="reddit-votes" style:padding={`${width * 0.018}px`} style:gap={`${width * 0.014}px`}>
		<svg
			class="reddit-arrow reddit-arrow--up"
			style:inline-size={`${voteIconPx}px`}
			style:block-size={`${voteIconPx}px`}
			viewBox="0 0 24 24"
			aria-hidden="true"><path d="M12 3l9 9h-5.4v9h-7.2v-9H3z" /></svg
		>
		<span
			class="reddit-score"
			data-gfx-readable-id="surface:web-document:chrome:score"
			data-gfx-readable-text="4.2k"
			data-gfx-text-role="found-document-metadata"
			style:font-size={`${scoreFontPx}px`}>4.2k</span
		>
		<svg
			class="reddit-arrow reddit-arrow--down"
			style:inline-size={`${voteIconPx}px`}
			style:block-size={`${voteIconPx}px`}
			viewBox="0 0 24 24"
			aria-hidden="true"><path d="M12 21l-9-9h5.4V3h7.2v9H21z" /></svg
		>
	</div>

	<div class="reddit-content" style:padding={`${width * 0.03}px`} style:gap={`${width * 0.02}px`}>
		<div class="reddit-meta" style:font-size={`${metaFontPx}px`}>
			<span class="reddit-sub-dot" aria-hidden="true"></span>
			{#if subreddit}
				<span
					class="reddit-sub"
					data-gfx-readable-id="surface:web-document:source"
					data-gfx-readable-text={subreddit}
					data-gfx-text-role="found-document-metadata">{subreddit}</span
				>
			{/if}
			<span class="reddit-meta-rest">
				{#if poster}<span
						class="reddit-sep"
						aria-hidden="true"
						data-gfx-non-readable-reason={decorativeSymbolReason}>·</span
					><span
						data-gfx-readable-id="surface:web-document:chrome:posted-by"
						data-gfx-readable-text="Posted by"
						data-gfx-text-role="found-document-metadata">Posted by</span
					>
					<span
						data-gfx-readable-id="surface:web-document:author"
						data-gfx-readable-text={poster}
						data-gfx-text-role="found-document-metadata">{poster}</span
					>{/if}
				{#if age}<span
						class="reddit-sep"
						aria-hidden="true"
						data-gfx-non-readable-reason={decorativeSymbolReason}>·</span
					><span
						data-gfx-readable-id="surface:web-document:date-label"
						data-gfx-readable-text={age}
						data-gfx-text-role="found-document-metadata">{age}</span
					>{/if}
			</span>
		</div>

		{#if title}
			<h2
				class="reddit-title"
				data-gfx-readable-id="surface:web-document:title"
				data-gfx-readable-text={title}
				data-gfx-text-role="found-document-title"
				style:font-size={`${titleFontPx}px`}
			>
				{title}
			</h2>
		{/if}

		<DocumentBody
			body={content.body}
			fontSize={bodyFontPx}
			readablePrefix="surface:web-document:body"
		/>

		<footer class="reddit-actions" style:font-size={`${actionFontPx}px`} aria-hidden="true">
			<span class="reddit-action">
				<svg
					style:inline-size={`${actionIconPx}px`}
					style:block-size={`${actionIconPx}px`}
					viewBox="0 0 20 20"
					><path
						fill="currentColor"
						d="M10 2c4.42 0 8 2.96 8 6.6 0 3.64-3.58 6.6-8 6.6-.86 0-1.69-.11-2.46-.32L4 17v-3.1C2.16 12.7 1 10.78 1 8.6 1 4.96 4.58 2 10 2z"
					/></svg
				><span
					data-gfx-readable-id="surface:web-document:chrome:comments"
					data-gfx-readable-text="142 Comments"
					data-gfx-text-role="found-document-metadata">142 Comments</span
				></span
			>
			<span class="reddit-action">
				<svg
					style:inline-size={`${actionIconPx}px`}
					style:block-size={`${actionIconPx}px`}
					viewBox="0 0 24 24"
					><path
						fill="currentColor"
						d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"
					/></svg
				><span
					data-gfx-readable-id="surface:web-document:chrome:share"
					data-gfx-readable-text="Share"
					data-gfx-text-role="found-document-metadata">Share</span
				></span
			>
			<span class="reddit-action">
				<svg
					style:inline-size={`${actionIconPx}px`}
					style:block-size={`${actionIconPx}px`}
					viewBox="0 0 24 24"
					><path
						fill="currentColor"
						d="M6 3h12c.55 0 1 .45 1 1v17l-7-4-7 4V4c0-.55.45-1 1-1z"
					/></svg
				><span
					data-gfx-readable-id="surface:web-document:chrome:save"
					data-gfx-readable-text="Save"
					data-gfx-text-role="found-document-metadata">Save</span
				></span
			>
		</footer>
	</div>
</div>

<style>
	/*
	 * Reddit post — classic night-mode card. The panel is the only opaque element;
	 * the browser frame around it (CanvasSource) stays transparent.
	 * Reddit night palette: card #1a1a1b · rail #161617 · text #d7dadc · meta
	 * #818384 · border #343536 · upvote orange #ff4500.
	 */
	.reddit-panel {
		--rd-card: #1a1a1b;
		--rd-rail: #161617;
		--rd-text: #d7dadc;
		--rd-meta: #818384;
		--rd-border: #343536;
		--rd-orange: #ff4500;
		background-color: var(--rd-card);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--rd-text);
		display: grid;
		font-family:
			'IBM Plex Sans',
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			sans-serif;
		grid-template-columns: auto 1fr;
		overflow: hidden;
	}

	.reddit-votes {
		align-items: center;
		background-color: var(--rd-rail);
		display: flex;
		flex-direction: column;
	}
	.reddit-arrow {
		display: block;
	}
	.reddit-arrow--up {
		fill: var(--rd-orange);
	}
	.reddit-arrow--down {
		fill: var(--rd-meta);
	}
	.reddit-score {
		color: var(--rd-orange);
		font-weight: 700;
		line-height: 1;
	}

	.reddit-content {
		display: grid;
		min-inline-size: 0;
	}
	.reddit-meta {
		align-items: center;
		color: var(--rd-meta);
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	.reddit-sub-dot {
		background: linear-gradient(135deg, #ff4500, #ff8717);
		block-size: 1.5em;
		border-radius: 50%;
		display: inline-block;
		flex: 0 0 auto;
		inline-size: 1.5em;
	}
	.reddit-sub {
		color: var(--rd-text);
		font-weight: 700;
	}
	.reddit-meta-rest {
		color: var(--rd-meta);
	}
	.reddit-sep {
		margin: 0 0.4em;
	}

	.reddit-title {
		color: var(--rd-text);
		font-weight: 600;
		line-height: 1.2;
		margin: 0;
	}

	.reddit-actions {
		align-items: center;
		color: var(--rd-meta);
		display: flex;
		font-weight: 700;
		gap: 1.4em;
		margin-block-start: 0.3em;
	}
	.reddit-action {
		align-items: center;
		display: inline-flex;
		gap: 0.45em;
	}
	.reddit-action svg {
		display: block;
	}
</style>
