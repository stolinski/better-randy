<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		kicker?: string;
		stageLabel?: string;
		actions?: Snippet;
		stage: Snippet;
		controls: Snippet;
	}

	let { title, kicker, stageLabel = 'Composition', actions, stage, controls }: Props = $props();
</script>

<main class="tool-workspace">
	<header class="tool-workspace__header split center">
		<div>
			{#if kicker}
				<p>{kicker}</p>
			{/if}
			<h1>{title}</h1>
		</div>

		{#if actions}
			<div class="cluster">
				{@render actions()}
			</div>
		{/if}
	</header>

	<div class="tool-workspace__body">
		<section class="tool-workspace__stage" aria-label={stageLabel}>
			{@render stage()}
		</section>

		{@render controls()}
	</div>
</main>

<style>
	.tool-workspace {
		block-size: 100dvh;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--vs-base);
		overflow: hidden;
		padding: var(--pad-l);
	}

	.tool-workspace__header {
		border-block-end: var(--border-1);
		padding-block-end: var(--vs-s);
	}

	.tool-workspace__header p,
	h1 {
		margin: 0;
	}

	.tool-workspace__header p {
		color: var(--fg-6);
		font-size: 0.875rem;
	}

	h1 {
		font-size: 1.5rem;
	}

	.tool-workspace__body {
		display: grid;
		gap: var(--vs-base);
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
		grid-template-rows: minmax(0, 1fr);
		min-block-size: 0;
	}

	.tool-workspace__stage {
		align-items: center;
		block-size: 100%;
		container-type: size;
		display: flex;
		flex-direction: column;
		gap: var(--vs-s);
		min-block-size: 0;
	}

	@media (max-width: 900px) {
		.tool-workspace {
			block-size: auto;
			min-block-size: 100dvh;
			overflow: visible;
		}

		.tool-workspace__body {
			grid-template-columns: 1fr;
		}
	}
</style>
