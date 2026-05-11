<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		actions?: Snippet;
		children: Snippet;
	}

	let { title, actions, children }: Props = $props();
</script>

{#if title}
	<fieldset class="control-group stack">
		<header class="control-group__header split center">
			<legend>{title}</legend>
			{#if actions}
				<div class="cluster">
					{@render actions()}
				</div>
			{/if}
		</header>

		{@render children()}
	</fieldset>
{:else}
	<section class="control-group stack">
		{@render children()}
	</section>
{/if}

<style>
	.control-group {
		border: 0;
		margin: 0;
		min-inline-size: 0;
		padding: 0;
	}

	.control-group__header {
		border-block-end: var(--border-1);
		padding-block-end: var(--vs-s);
	}

	legend {
		font-weight: var(--fw-semibold);
		margin: 0;
		padding: 0;
	}
</style>
