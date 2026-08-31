<script lang="ts">
	// Every Archivo weight the chrome declares must be REGISTERED, or the
	// browser silently substitutes the nearest loaded cut — with only 600
	// present, all lighter text rendered semibold while computed styles still
	// reported the declared weight.
	import '@fontsource/archivo/latin-400.css';
	import '@fontsource/archivo/latin-500.css';
	import '@fontsource/archivo/latin-600.css';
	import '@fontsource/archivo/latin-700.css';
	import '@drop-in/graffiti';
	import archivo400Url from '@fontsource/archivo/files/archivo-latin-400-normal.woff2?url';
	import archivo600Url from '@fontsource/archivo/files/archivo-latin-600-normal.woff2?url';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';

	import {
		GFX_DESCRIPTION,
		GFX_PRODUCT_NAME,
		GFX_PUBLIC_ORIGIN,
		GFX_SOCIAL_CARD_PATH
	} from '$lib/identity/gfx-brand';
	import gfxMark from '$lib/assets/identity/gfx-mark.svg';
	import { readWebmcpCompositionPreconditions } from '$lib/platform/webmcp-tool-preconditions';
	import { startWebmcpToolController } from '$lib/platform/webmcp-tool-controller';
	import { listWebmcpToolDefinitions } from '$lib/platform/webmcp-tool-definitions';

	let { children } = $props();

	// WebMCP is progressive enhancement in one direction only (ADR-0054 §4):
	// without `document.modelContext`, or inside a frame, an insecure context, or
	// an opaque origin, this resolves to null and the app behaves exactly as it
	// does with no agent attached. Nothing below the layout may depend on it.
	const webmcpLifetime = new AbortController();
	const webmcpToolController = browser
		? startWebmcpToolController({
				view: window,
				definitions: listWebmcpToolDefinitions(),
				lifetime: webmcpLifetime.signal
			})
		: null;

	onDestroy(() => webmcpLifetime.abort());

	// Registration follows the route and the composition: the preconditions are
	// read inside the effect so any edit that makes a tool possible — or
	// impossible — reaches `document.modelContext` on the same tick the Workspace
	// sees it.
	$effect(() => {
		if (!webmcpToolController) return;
		const composition = readWebmcpCompositionPreconditions();
		const routeId = page.route.id;
		void webmcpToolController.synchronize(composition, routeId).catch((error: unknown) => {
			console.error('WebMCP tool registration failed', error);
		});
	});

	// Share scrapers need absolute URLs, and the only origin any of them ever
	// fetches is the ratified public one (ADR-0052) — a local or preview origin
	// in these tags would resolve to nothing for the reader who sees the card.
	const shareUrl = $derived(`${GFX_PUBLIC_ORIGIN}${page.url.pathname}`);
</script>

<svelte:head>
	<link rel="icon" href={gfxMark} />
	<meta name="description" content={GFX_DESCRIPTION} />
	<meta name="theme-color" content="#0c0c0e" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={GFX_PRODUCT_NAME} />
	<meta property="og:title" content={GFX_PRODUCT_NAME} />
	<meta property="og:description" content={GFX_DESCRIPTION} />
	<meta property="og:url" content={shareUrl} />
	<meta property="og:image" content="{GFX_PUBLIC_ORIGIN}{GFX_SOCIAL_CARD_PATH}" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="The GFX title card on the deck" />
	<meta name="twitter:card" content="summary_large_image" />
	<link rel="preload" href={archivo400Url} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={archivo600Url} as="font" type="font/woff2" crossorigin="anonymous" />
	<link
		rel="preload"
		href="/fonts/PaperMono-Variable.woff2"
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>
</svelte:head>

{@render children()}

<style>
	/* Paper Mono (paper.design, OFL) is the tool-chrome mono — the variable cut
	   covers every weight the chrome uses. Pack/content fonts register in their
	   own Pack folders and are unaffected. License: static/fonts/PaperMono-OFL.txt */
	@font-face {
		font-family: 'Paper Mono';
		src: url('/fonts/PaperMono-Variable.woff2') format('woff2-variations');
		font-weight: 100 800;
		font-style: normal;
		font-display: swap;
	}
</style>
