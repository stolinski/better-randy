<script lang="ts">
	import type { ChartBlock } from './engine-schema';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import {
		resolveChartMotionState,
		resolveChartProgressBarProgress
	} from '$lib/utils/chart-motion';
	import { resolveChartChromeColors, resolveChartSeriesStrokeColor } from './packs/resolve';
	import { getPack } from './packs/registry';
	import { animState } from './anim-state.svelte';
	import { engineState, packState } from './engine-state.svelte';

	interface Props {
		block: ChartBlock;
	}

	let { block }: Props = $props();
	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const pack = $derived(getPack(packState.slug));
	const color = $derived(resolveChartSeriesStrokeColor(pack, 0));
	const trackColor = $derived(resolveChartChromeColors(pack).grid);
	const motion = $derived(resolveChartMotionState(block.motion, animState.globalProgress));
	const progress = $derived(
		resolveChartProgressBarProgress(block.motion, animState.globalProgress)
	);
	const patternId = $derived(`chart-progress-${encodeURIComponent(block.id)}`);
	const barHeight = $derived(Math.max(10, Math.round(Math.min(frame.width, frame.height) * 0.004)));
</script>

<svg
	class="chart-progress"
	data-chart-progress={block.id}
	viewBox={`0 0 ${frame.width} ${frame.height}`}
	preserveAspectRatio="none"
	aria-hidden="true"
>
	<defs>
		<pattern
			id={patternId}
			width="8"
			height="8"
			patternUnits="userSpaceOnUse"
			patternTransform="rotate(45)"
		>
			<rect width="4" height="8" fill={color} />
		</pattern>
	</defs>
	<rect width={frame.width} height={barHeight} fill={trackColor} opacity="0.12" />
	<rect
		width={frame.width * progress}
		height={barHeight}
		fill={`url(#${patternId})`}
		opacity={motion.chartAlpha * 0.72}
	/>
</svg>

<style>
	.chart-progress {
		block-size: 100%;
		inset: 0;
		inline-size: 100%;
		pointer-events: none;
		position: absolute;
		shape-rendering: crispEdges;
	}
</style>
