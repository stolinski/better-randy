<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		id?: string;
		actions?: Snippet;
		footer?: Snippet;
		children: Snippet;
	}

	let { title, id = 'tool-controls', actions, footer, children }: Props = $props();

	const titleId = $derived(`${id}-title`);
</script>

<aside class="control-panel" aria-labelledby={titleId}>
	{#if title}
		<header class="control-panel__header split center">
			<h2 id={titleId}>{title}</h2>
			{#if actions}
				<div class="cluster">
					{@render actions()}
				</div>
			{/if}
		</header>
	{/if}

	<div class="control-panel__scroll stack">
		{@render children()}
	</div>

	{#if footer}
		<div class="control-panel__footer">
			{@render footer()}
		</div>
	{/if}
</aside>

<style>
	.control-panel {
		align-self: stretch;
		block-size: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--vs-s);
		margin: 0;
		min-block-size: 0;
	}

	.control-panel__header {
		border-block-end: var(--border-1);
		padding-block-end: var(--vs-s);
	}

	.control-panel__scroll {
		flex: 1 1 auto;
		min-block-size: 0;
		overflow: auto;
	}

	.control-panel__footer {
		padding-block-start: var(--vs-s);
	}

	h2 {
		font-size: 1rem;
		margin: 0;
	}
</style>
