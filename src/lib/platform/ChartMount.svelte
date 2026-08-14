<script lang="ts">
	import ChartBarColumnCanvasSource from '$lib/pipelines/blocks/bar-chart/CanvasSource.svelte';
	import LineChartCanvasSource from '$lib/pipelines/blocks/line-chart/CanvasSource.svelte';
	import ChartNormalizedCanvasSource from '$lib/pipelines/blocks/unit-grid-chart/CanvasSource.svelte';
	import { resolveVisibleChartBlock } from '$lib/utils/chart-visibility';
	import ChartProgressBar from './ChartProgressBar.svelte';
	import { animState } from './anim-state.svelte';
	import { engineState } from './engine-state.svelte';

	const visibleBlock = $derived(
		resolveVisibleChartBlock(engineState.surface.chart, animState.globalProgress)
	);
</script>

{#if visibleBlock?.type === 'bar-chart' || visibleBlock?.type === 'column-chart'}
	<div class="chart-mount" data-chart-active={visibleBlock.id}>
		<ChartBarColumnCanvasSource block={visibleBlock} />
		{#if visibleBlock.progressBar}<ChartProgressBar block={visibleBlock} />{/if}
	</div>
{:else if visibleBlock?.type === 'line-chart'}
	<div class="chart-mount" data-chart-active={visibleBlock.id}>
		<LineChartCanvasSource block={visibleBlock} />
		{#if visibleBlock.progressBar}<ChartProgressBar block={visibleBlock} />{/if}
	</div>
{:else if visibleBlock?.type === 'unit-grid-chart' || visibleBlock?.type === 'dot-field-chart'}
	<div class="chart-mount" data-chart-active={visibleBlock.id}>
		<ChartNormalizedCanvasSource block={visibleBlock} />
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
