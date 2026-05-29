<script lang="ts">
	import '@drop-in/graffiti';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	.app-header {
		display: flex;
		padding: var(--vs-xs) var(--pad-l);
	}

	.app-header__brand {
		font-weight: 500;
		display: flex;
		gap: var(--vs-xs);
		align-items: center;
		color: var(--fg-9);
		text-decoration: none;
	}
</style>
