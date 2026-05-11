<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		id?: string;
		actions?: Snippet;
		children: Snippet;
	}

	let { title, id = 'tool-controls', actions, children }: Props = $props();

	const titleId = $derived(`${id}-title`);
</script>

<aside class="control-panel box stack" aria-labelledby={titleId}>
	<header class="control-panel__header split center">
		<h2 id={titleId}>{title}</h2>
		{#if actions}
			<div class="cluster">
				{@render actions()}
			</div>
		{/if}
	</header>

	{@render children()}
</aside>

<style>
	.control-panel {
		align-self: stretch;
		block-size: 100%;
		margin: 0;
		overflow: auto;
	}

	.control-panel__header {
		border-block-end: var(--border-1);
		padding-block-end: var(--vs-s);
	}

	h2 {
		font-size: 1rem;
		margin: 0;
	}
</style>
