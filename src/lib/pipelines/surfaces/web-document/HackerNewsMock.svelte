<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';
	import type { DeterministicNonReadableTextReason } from '$lib/platform/pipelines/types';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — title/source/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the thread's type scales from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// Content slots for the HN layout: `title` = the parent story headline
	// (context line), `source` = commenter username, `dateLabel` = age, `body` =
	// the comment text carrying the hero `[highlight]`.
	const storyTitle = $derived((content.title ?? '').trim());
	const username = $derived((content.source ?? '').trim());
	const age = $derived((content.dateLabel ?? '').trim());

	// HN's content column ≈ 760 px of small Verdana; scaled up for 4K overlay.
	const logoFontPx = $derived(width * 0.03);
	const navFontPx = $derived(width * 0.022);
	const storyFontPx = $derived(width * 0.036);
	const metaFontPx = $derived(width * 0.024);
	const bodyFontPx = $derived(width * 0.03);
	const voteIconPx = $derived(width * 0.02);
	const decorativeSymbolReason: DeterministicNonReadableTextReason = 'decorative-symbol';
</script>

<!-- Hacker News thread (light beige page, orange masthead). -->
<div class="hn-panel">
	<div
		class="hn-topbar"
		style:padding={`${width * 0.012}px ${width * 0.018}px`}
		style:gap={`${width * 0.018}px`}
	>
		<span
			class="hn-logo"
			style:font-size={`${logoFontPx}px`}
			style:inline-size={`${logoFontPx}px`}
			style:block-size={`${logoFontPx}px`}
			aria-hidden="true"
			data-gfx-non-readable-reason={decorativeSymbolReason}>Y</span
		>
		<span
			class="hn-title"
			data-gfx-readable-id="surface:web-document:chrome:site-name"
			data-gfx-readable-text="Hacker News"
			data-gfx-text-role="found-document-metadata"
			style:font-size={`${logoFontPx}px`}>Hacker News</span
		>
		<span
			class="hn-nav"
			data-gfx-readable-id="surface:web-document:chrome:navigation"
			data-gfx-readable-text="new | past | comments | ask | show | jobs"
			data-gfx-text-role="found-document-metadata"
			style:font-size={`${navFontPx}px`}>new | past | comments | ask | show | jobs</span
		>
	</div>

	<div class="hn-thread" style:padding={`${width * 0.03}px`} style:gap={`${width * 0.022}px`}>
		{#if storyTitle}
			<h2
				class="hn-story"
				data-gfx-readable-id="surface:web-document:title"
				data-gfx-readable-text={storyTitle}
				data-gfx-text-role="found-document-title"
				style:font-size={`${storyFontPx}px`}
			>
				{storyTitle}
			</h2>
		{/if}

		<div class="hn-comment" style:gap={`${width * 0.012}px`}>
			<div class="hn-meta" style:font-size={`${metaFontPx}px`} style:gap={`${width * 0.008}px`}>
				<svg
					class="hn-vote"
					style:inline-size={`${voteIconPx}px`}
					style:block-size={`${voteIconPx}px`}
					viewBox="0 0 16 16"
					aria-hidden="true"><path fill="#999" d="M8 2l6 9H2z" /></svg
				>
				{#if username}<span
						class="hn-user"
						data-gfx-readable-id="surface:web-document:source"
						data-gfx-readable-text={username}
						data-gfx-text-role="found-document-metadata">{username}</span
					>{/if}
				{#if age}<span
						data-gfx-readable-id="surface:web-document:date-label"
						data-gfx-readable-text={age}
						data-gfx-text-role="found-document-metadata">{age}</span
					>{/if}
			</div>

			<DocumentBody
				body={content.body}
				fontSize={bodyFontPx}
				readablePrefix="surface:web-document:body"
			/>

			<div
				class="hn-reply"
				data-gfx-readable-id="surface:web-document:chrome:reply"
				data-gfx-readable-text="reply"
				data-gfx-text-role="found-document-metadata"
				style:font-size={`${metaFontPx}px`}
			>
				reply
			</div>
		</div>
	</div>
</div>

<style>
	/*
	 * Hacker News — light beige page with the orange masthead. The panel is the
	 * only opaque element; the browser frame around it (CanvasSource) stays
	 * transparent. HN palette: page #f6f6ef · masthead #ff6600 · text #1a1a1a ·
	 * meta #828282. Verdana/Geneva, small type — the structural HN tell.
	 */
	.hn-panel {
		--hn-bg: #f6f6ef;
		--hn-orange: #ff6600;
		--hn-text: #1a1a1a;
		--hn-meta: #828282;
		background-color: var(--hn-bg);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--hn-text);
		display: grid;
		font-family: Verdana, Geneva, sans-serif;
	}

	.hn-topbar {
		align-items: center;
		background-color: var(--hn-orange);
		display: flex;
	}
	.hn-logo {
		border: 1px solid #ffffff;
		box-sizing: border-box;
		color: #ffffff;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		font-weight: 700;
		line-height: 1;
	}
	.hn-title {
		color: #000000;
		font-weight: 700;
	}
	.hn-nav {
		color: #1a1a1a;
		flex: 1 1 auto;
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hn-thread {
		display: grid;
		min-inline-size: 0;
	}
	.hn-story {
		color: #000000;
		font-weight: 500;
		line-height: 1.2;
		margin: 0;
	}
	.hn-comment {
		display: grid;
	}
	.hn-meta {
		align-items: center;
		color: var(--hn-meta);
		display: flex;
	}
	.hn-vote {
		display: block;
		flex: 0 0 auto;
	}
	.hn-user {
		color: var(--hn-meta);
	}
	.hn-reply {
		color: var(--hn-meta);
		text-decoration: underline;
	}
</style>
