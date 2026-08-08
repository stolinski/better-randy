<script lang="ts">
	import ChartBarColumnCanvasSource from '$lib/pipelines/blocks/bar-chart/CanvasSource.svelte';
	import ChartNormalizedCanvasSource from '$lib/pipelines/blocks/unit-grid-chart/CanvasSource.svelte';
	import { resolveVisibleChartBlock } from '$lib/utils/chart-visibility';
	import { animState } from './anim-state.svelte';
	import { engineState } from './engine-state.svelte';

	const visibleBlock = $derived(
		resolveVisibleChartBlock(engineState.surface.chart, animState.globalProgress)
	);
</script>

{#if visibleBlock?.type === 'bar-chart' || visibleBlock?.type === 'column-chart'}
	<div class="chart-mount" data-chart-active={visibleBlock.id}>
		<ChartBarColumnCanvasSource block={visibleBlock} />
	</div>
{:else if visibleBlock?.type === 'unit-grid-chart' || visibleBlock?.type === 'dot-field-chart'}
	<div class="chart-mount" data-chart-active={visibleBlock.id}>
		<ChartNormalizedCanvasSource block={visibleBlock} />
	</div>
{/if}

<style>
	.chart-mount {
		inset: 0;
		pointer-events: none;
		position: absolute;
	}
</style>
