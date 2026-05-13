<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		stageLabel?: string;
		stage: Snippet;
		controls: Snippet;
	}

	let { stageLabel = 'Composition', stage, controls }: Props = $props();
</script>

<main class="tool-workspace">
	<section class="tool-workspace__stage" aria-label={stageLabel}>
		{@render stage()}
	</section>

	{@render controls()}
</main>

<style>
	.tool-workspace {
		block-size: 100dvh;
		display: grid;
		gap: var(--vs-base);
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
		grid-template-rows: minmax(0, 1fr);
		min-block-size: 0;
		overflow: hidden;
		padding: var(--pad-l);
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
			grid-template-columns: 1fr;
			min-block-size: 100dvh;
			overflow: visible;
		}
	}
</style>
