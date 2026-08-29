<script lang="ts">
	import type { Component } from 'svelte';

	import type { ChartBlock } from './engine-schema';
	import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
	import { requireLoadedBlockRenderer } from './pipelines/runtime-loader';
	import { resolveVisibleChartBlock } from '$lib/utils/chart-visibility';
	import ChartProgressBar from './ChartProgressBar.svelte';
	import { animState } from './anim-state.svelte';
	import { engineState } from './engine-state.svelte';

	const visibleBlock = $derived(
		resolveVisibleChartBlock(engineState.surface.chart, animState.globalProgress)
	);
	function requireChartCanvasSource(block: ChartBlock): Component<{ block: ChartBlock }> {
		// Read the reactive bundle revision before enforcing the synchronous invariant.
		pipelineRendererRuntime.current();
		const CanvasSource = requireLoadedBlockRenderer(block.type).CanvasSource;
		if (!CanvasSource) {
			throw new Error(`Required chart Block renderer "${block.type}" has no CanvasSource.`);
		}
		return CanvasSource as Component<{ block: ChartBlock }>;
	}

	const ChartCanvasSource = $derived(visibleBlock ? requireChartCanvasSource(visibleBlock) : null);
</script>

{#if visibleBlock && ChartCanvasSource}
	<div class="chart-mount" data-chart-active={visibleBlock.id}>
		<ChartCanvasSource block={visibleBlock} />
		{#if visibleBlock.progressBar}<ChartProgressBar block={visibleBlock} />{/if}
	</div>
{/if}

<style>
	.chart-mount {
		inset: 0;
		pointer-events: none;
		position: absolute;
	}
</style>
