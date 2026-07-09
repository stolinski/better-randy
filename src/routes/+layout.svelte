<script lang="ts">
	import '@fontsource/archivo/latin-600.css';
	import '@fontsource/archivo/latin-900-italic.css';
	import '@fontsource/jetbrains-mono/latin-600.css';
	import '@drop-in/graffiti';
	import archivo600Url from '@fontsource/archivo/files/archivo-latin-600-normal.woff2?url';
	import archivo900ItalicUrl from '@fontsource/archivo/files/archivo-latin-900-italic.woff2?url';
	import jetbrainsMono600Url from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2?url';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
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
		href={jetbrainsMono600Url}
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>
</svelte:head>

{@render children()}
