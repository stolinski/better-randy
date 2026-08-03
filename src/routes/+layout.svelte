<script lang="ts">
	// Every Archivo weight the chrome declares must be REGISTERED, or the
	// browser silently substitutes the nearest loaded cut — with only 600
	// present, all lighter text rendered semibold while computed styles still
	// reported the declared weight.
	import '@fontsource/archivo/latin-400.css';
	import '@fontsource/archivo/latin-500.css';
	import '@fontsource/archivo/latin-600.css';
	import '@fontsource/archivo/latin-700.css';
	import '@fontsource/archivo/latin-900-italic.css';
	import '@drop-in/graffiti';
	import archivo400Url from '@fontsource/archivo/files/archivo-latin-400-normal.woff2?url';
	import archivo600Url from '@fontsource/archivo/files/archivo-latin-600-normal.woff2?url';
	import archivo900ItalicUrl from '@fontsource/archivo/files/archivo-latin-900-italic.woff2?url';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preload" href={archivo400Url} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={archivo600Url} as="font" type="font/woff2" crossorigin="anonymous" />
	<link
		rel="preload"
		href={archivo900ItalicUrl}
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>
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
