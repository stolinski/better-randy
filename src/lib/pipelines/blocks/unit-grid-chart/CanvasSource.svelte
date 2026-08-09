<script lang="ts">
	import {
		ENGINE_FONT_FAMILIES,
		type DotFieldChartBlock,
		type UnitGridChartBlock
	} from '$lib/platform/engine-schema';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolveChartChromeColors, resolveFontTreatment } from '$lib/platform/packs/resolve';
	import { chartAnnotationLeaderSvgPath } from '$lib/utils/chart-editorial-annotation';
	import { resolveChartFrameLayout, type ChartMeasuredTextLayout } from '$lib/utils/chart-layout';
	import { resolveChartNormalizedGeometry } from '$lib/utils/chart-normalized-geometry';
	import { resolveChartMotionState } from '$lib/utils/chart-motion';
	import {
		createChartRenderTextMeasurer,
		resolveChartTextRoleStyle
	} from '$lib/utils/chart-text-measurement';

	interface Props {
		block: UnitGridChartBlock | DotFieldChartBlock;
	}

	let { block }: Props = $props();
	const pack = $derived(getPack(packState.slug));
	const chrome = $derived(resolveChartChromeColors(pack));
	const fontFamily = $derived(
		resolveFontTreatment(pack) ??
			ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]?.stack ??
			ENGINE_FONT_FAMILIES.sans.stack
	);
	const measureText = $derived(createChartRenderTextMeasurer(engineState.transport.orientation));
	const layout = $derived(
		resolveChartFrameLayout({
			block,
			orientation: engineState.transport.orientation,
			measureText
		})
	);
	const geometry = $derived(
		resolveChartNormalizedGeometry({
			block,
			layout,
			orientation: engineState.transport.orientation,
			measureText
		})
	);
	const isRenderable = $derived(layout.overflow.length === 0 && geometry.overflow.length === 0);
	const motion = $derived(resolveChartMotionState(block.motion, animState.globalProgress));

	function textStyle(text: ChartMeasuredTextLayout): string {
		const style = resolveChartTextRoleStyle(text.role, engineState.transport.orientation);
		return `font-size:${style.fontSize}px;font-weight:${style.fontWeight};letter-spacing:${style.letterSpacing}px`;
	}
</script>

<svg
	class="chart-normalized"
	data-chart-block={block.id}
	data-chart-type={block.type}
	data-chart-unit-count={block.normalization.unitCount}
	data-chart-allocation={geometry.allocationSignature}
	data-chart-columns={geometry.grid.columns}
	data-chart-rows={geometry.grid.rows}
	data-chart-overflow={layout.overflow.length + geometry.overflow.length}
	data-chart-renderable={isRenderable}
	data-chart-entry={motion.entryProgress}
	data-chart-reveal={motion.revealProgress}
	data-chart-emphasis={motion.emphasisProgress}
	data-chart-annotation={motion.annotationProgress}
	data-chart-exit={motion.exitProgress}
	data-chart-alpha={motion.chartAlpha}
	viewBox={`0 0 ${layout.frame.width} ${layout.frame.height}`}
	preserveAspectRatio="none"
	style:font-family={fontFamily}
	aria-hidden="true"
>
	{#if isRenderable}
		<g class="chart-normalized__labels" opacity={motion.chromeAlpha} fill={chrome.label}>
			<text
				data-chart-text-role="title"
				x={layout.chrome.title.origin.x}
				y={layout.chrome.title.origin.y}
				textLength={layout.chrome.title.measurement.width}
				lengthAdjust="spacingAndGlyphs"
				dominant-baseline="hanging"
				style={textStyle(layout.chrome.title)}>{layout.chrome.title.text}</text
			>
			{#each layout.chrome.legendItems as entry (entry.itemId)}
				<rect
					data-chart-key-swatch={entry.itemId}
					x={entry.swatch.x}
					y={entry.swatch.y}
					width={entry.swatch.width}
					height={entry.swatch.height}
					fill="none"
					stroke="none"
				/>
				<text
					data-chart-text-role="legend"
					data-chart-exact-key={entry.itemId}
					x={entry.labelLayout.origin.x}
					y={entry.labelLayout.origin.y}
					textLength={entry.labelLayout.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={textStyle(entry.labelLayout)}>{entry.labelLayout.text}</text
				>
			{/each}
			{#if layout.chrome.sourceNote}
				<text
					data-chart-text-role="source"
					x={layout.chrome.sourceNote.origin.x}
					y={layout.chrome.sourceNote.origin.y}
					textLength={layout.chrome.sourceNote.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={textStyle(layout.chrome.sourceNote)}>{layout.chrome.sourceNote.text}</text
				>
			{/if}
		</g>

		<g
			class="chart-normalized__annotations"
			opacity={motion.annotationAlpha}
			stroke={chrome.annotation}
			fill="none"
		>
			{#each geometry.annotations as annotation (annotation.id)}
				<path
					data-chart-callout-leader={annotation.id}
					d={chartAnnotationLeaderSvgPath(annotation)}
					stroke-width="6"
					stroke-linecap="square"
					stroke-linejoin="miter"
				/>
				<circle
					data-chart-callout-terminal={annotation.id}
					cx={annotation.leaderFrom.x}
					cy={annotation.leaderFrom.y}
					r="9"
					fill={chrome.annotation}
					stroke="none"
				/>
				<rect
					x={annotation.box.x}
					y={annotation.box.y}
					width={annotation.box.width}
					height={annotation.box.height}
					rx="12"
					stroke-width="4"
				/>
				{@const calloutStyle = resolveChartTextRoleStyle(
					'callout',
					engineState.transport.orientation
				)}
				<text
					data-chart-text-role="callout"
					data-chart-callout={annotation.id}
					x={annotation.box.x + 28}
					y={annotation.box.y + 20}
					fill={chrome.annotation}
					stroke="none"
					textLength={annotation.box.width - 56}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={`font-size:${calloutStyle.fontSize}px;font-weight:${calloutStyle.fontWeight};letter-spacing:${calloutStyle.letterSpacing}px`}
					>{annotation.text}</text
				>
			{/each}
		</g>
	{/if}
</svg>

<style>
	.chart-normalized {
		block-size: 100%;
		inset: 0;
		inline-size: 100%;
		pointer-events: none;
		position: absolute;
	}
</style>
