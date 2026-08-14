<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	import GitHubMock from './GitHubMock.svelte';
	import HackerNewsMock from './HackerNewsMock.svelte';
	import NewsArticleMock from './NewsArticleMock.svelte';
	import PubMedMock from './PubMedMock.svelte';
	import RedditMock from './RedditMock.svelte';
	import TwitterMock from './TwitterMock.svelte';
	import WikipediaMock from './WikipediaMock.svelte';
	import YouTubeMock from './YouTubeMock.svelte';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// A transparent-overlay panel: a browser window (dark) framing a single,
	// isolated site card — the "clean by construction" document, no nav / sidebar
	// / ads. One Surface, per-site layout = content: the inner panel is a per-site
	// mock (twitter / reddit / wikipedia) selected by `surface.site`; the browser
	// chrome + address bar + enter motion are shared here. Vertically centred;
	// settles up from below as `paperVisibility` climbs 0 → 1. Height is
	// content-driven, so the card is centred via CSS (top:50% + translateY) rather
	// than a measured resting Y. NO CSS filter/glow on the card — it pixelates the
	// HTML-in-Canvas capture; the emissive/screen optical look is a TypeGPU
	// shaderPass (dex f0j654gu / ADR-0030).
	// Card footprint — a hero overlay, so the page fills much of the frame
	// (horizontal lifts the card's title + chrome above the rubric size floors;
	// vertical nearly spans the safe width). Shared across all sites.
	const CARD_WIDTH_RATIO_H = 0.62;
	const CARD_WIDTH_RATIO_V = 0.92;
	const ENTER_TRAVEL_RATIO = 0.055;

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const isVertical = $derived(frame.height > frame.width);
	const content = $derived(engineState.surface.content);
	const site = $derived(engineState.surface.site ?? 'twitter');

	const layout = $derived.by(() => {
		const widthRatio = isVertical ? CARD_WIDTH_RATIO_V : CARD_WIDTH_RATIO_H;
		const width = frame.width * widthRatio;
		const x = Math.round((frame.width - width) / 2);
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const enterOffsetPx = Math.round((1 - visibility) * frame.height * ENTER_TRAVEL_RATIO);
		return { x, width, enterOffsetPx, visibility };
	});

	// Address-bar text: the URL being shown, protocol + www stripped.
	const addressLabel = $derived(
		(content.sourceUrl?.trim() ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '')
	);

	const chromeFontPx = $derived(layout.width * (layout.width > 2200 ? 0.014 : 0.024));
</script>

<article
	bind:this={element}
	class="web-document surface"
	data-site={site}
	style:inline-size={`${layout.width}px`}
	style:left={`${layout.x}px`}
	style:opacity={site === 'twitter' ? layout.visibility : 1}
	style:transform={`translateY(calc(-50% + ${layout.enterOffsetPx}px))`}
>
	<!-- Dark browser chrome (mac-style) with the page URL in the address bar. -->
	<div class="web-document__chrome" style:font-size={`${chromeFontPx}px`}>
		<span class="web-document__dots" aria-hidden="true">
			<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i
				style="background:#28c840"
			></i>
		</span>
		{#if addressLabel}
			<span class="web-document__address">{addressLabel}</span>
		{/if}
	</div>

	<!-- Per-site card (the only opaque element). Selected by `surface.site`. -->
	{#if site === 'reddit'}
		<RedditMock {content} width={layout.width} />
	{:else if site === 'wikipedia'}
		<WikipediaMock {content} width={layout.width} />
	{:else if site === 'hackernews'}
		<HackerNewsMock {content} width={layout.width} />
	{:else if site === 'github'}
		<GitHubMock {content} width={layout.width} />
	{:else if site === 'youtube'}
		<YouTubeMock {content} width={layout.width} />
	{:else if site === 'news'}
		<NewsArticleMock {content} width={layout.width} />
	{:else if site === 'pubmed'}
		<PubMedMock {content} width={layout.width} />
	{:else}
		<TwitterMock {content} width={layout.width} />
	{/if}
</article>

<style>
	/*
	 * web-document Surface frame — a dark browser window on a transparent overlay
	 * frame. Only the per-site panel inside is opaque; the frame around it stays
	 * transparent. No Syntax collage chrome and NO CSS filter (it pixelates the
	 * capture). The emissive/screen optical look is a TypeGPU shaderPass
	 * (dex f0j654gu / ADR-0030).
	 */
	.web-document {
		box-sizing: border-box;
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		grid-template-rows: auto auto;
		position: absolute;
		top: 50%;
		transform-origin: center;
	}

	.web-document__chrome {
		align-items: center;
		background-color: #2c2c2e;
		border-start-start-radius: 0.85em;
		border-start-end-radius: 0.85em;
		display: flex;
		gap: 1em;
		padding: 0.75em 1.1em;
	}
	.web-document__dots {
		display: inline-flex;
		gap: 0.55em;
		flex: 0 0 auto;
	}
	.web-document__dots i {
		block-size: 0.8em;
		border-radius: 50%;
		display: block;
		inline-size: 0.8em;
	}
	.web-document__address {
		background-color: #1c1c1e;
		border-radius: 0.7em;
		color: #8b98a5;
		flex: 1 1 auto;
		overflow: hidden;
		padding: 0.4em 1em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
