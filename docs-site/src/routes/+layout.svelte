<script lang="ts">
	import '@fontsource-variable/archivo/index.css';
	import '@fontsource-variable/archivo/wght-italic.css';
	import '@fontsource-variable/inter/index.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '../app.css';

	import { page } from '$app/state';
	import Header from '$lib/components/Header.svelte';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { children, data } = $props();

	const isDoc = $derived(page.url.pathname !== '/');
</script>

<Header />
<SearchPalette />

{#if isDoc}
	<div class="shell">
		<Sidebar nav={data.nav} />
		{@render children()}
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 16.5rem minmax(0, 1fr);
		max-width: 90rem;
		margin: 0 auto;
	}

	@media (max-width: 56rem) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
