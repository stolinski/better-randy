<script lang="ts">
	import {
		ENGINE_FONT_FAMILIES,
		type BarChartBlock,
		type ColumnChartBlock
	} from '$lib/platform/engine-schema';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolveChartChromeColors, resolveFontTreatment } from '$lib/platform/packs/resolve';
	import { resolveChartBarColumnGeometry } from '$lib/utils/chart-bar-column-geometry';
	import { resolveChartFrameLayout, type ChartMeasuredTextLayout } from '$lib/utils/chart-layout';
	import { formatChartCounterValue, resolveChartMotionState } from '$lib/utils/chart-motion';
	import {
		createChartRenderTextMeasurer,
		resolveChartTextRoleStyle
	} from '$lib/utils/chart-text-measurement';

	interface Props {
		block: BarChartBlock | ColumnChartBlock;
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
		resolveChartBarColumnGeometry({
			block,
			layout,
			orientation: engineState.transport.orientation,
			measureText
		})
	);
	const isRenderable = $derived(layout.overflow.length === 0 && geometry.overflow.length === 0);
	const motion = $derived(resolveChartMotionState(block.motion, animState.globalProgress));
	const valueByMarkId = $derived(
		new Map(geometry.marks.map((mark) => [mark.id, mark.value] as const))
	);

	function valueLabelText(markId: string, terminalText: string): string {
		const value = valueByMarkId.get(markId);
		return value === undefined
			? terminalText
			: formatChartCounterValue(value, motion.annotationProgress);
	}

	function textStyle(text: ChartMeasuredTextLayout): string {
		const style = resolveChartTextRoleStyle(text.role, engineState.transport.orientation);
		return `font-size:${style.fontSize}px;font-weight:${style.fontWeight};letter-spacing:${style.letterSpacing}px`;
	}

	function linePath(line: {
		from: { x: number; y: number };
		to: { x: number; y: number };
	}): string {
		return `M ${line.from.x} ${line.from.y} L ${line.to.x} ${line.to.y}`;
	}
</script>

<svg
	class="chart-bar-column"
	data-chart-block={block.id}
	data-chart-type={block.type}
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
		<g
			class="chart-bar-column__grid"
			opacity={motion.chromeAlpha}
			fill="none"
			stroke={chrome.grid}
			stroke-width="2"
		>
			{#each layout.axes.linearTicks as tick (`${tick.value}:${tick.gridLine.from.x}:${tick.gridLine.from.y}`)}
				<path d={linePath(tick.gridLine)} opacity={tick.isZero ? 0 : 0.58} />
			{/each}
		</g>
		<g
			class="chart-bar-column__axes"
			opacity={motion.chromeAlpha}
			fill="none"
			stroke={chrome.axis}
			stroke-linecap="square"
		>
			{#if layout.axes.numericAxis}<path
					d={linePath(layout.axes.numericAxis)}
					stroke-width="3"
				/>{/if}
			{#if layout.axes.categoryAxis}<path
					d={linePath(layout.axes.categoryAxis)}
					stroke-width="3"
				/>{/if}
			{#if layout.axes.zeroBaseline}<path
					d={linePath(layout.axes.zeroBaseline)}
					stroke-width="6"
				/>{/if}
			{#each layout.axes.linearTicks as tick (`tick:${tick.value}`)}
				<path d={linePath(tick.tickLine)} stroke-width="3" />
			{/each}
		</g>

		<g class="chart-bar-column__datum-sentinels" fill="none" stroke="none">
			{#each geometry.marks as mark (mark.id)}
				<rect
					data-chart-datum={mark.id}
					data-chart-series={mark.seriesId}
					data-chart-category={mark.categoryId}
					data-chart-highlighted={mark.isHighlighted || undefined}
					x={mark.bounds.x}
					y={mark.bounds.y}
					width={mark.bounds.width}
					height={mark.bounds.height}
					rx={mark.cornerRadius}
				/>
			{/each}
		</g>

		<g class="chart-bar-column__labels" opacity={motion.chromeAlpha} fill={chrome.label}>
			<text
				data-chart-text-role="title"
				x={layout.chrome.title.origin.x}
				y={layout.chrome.title.origin.y}
				textLength={layout.chrome.title.measurement.width}
				lengthAdjust="spacingAndGlyphs"
				dominant-baseline="hanging"
				style={textStyle(layout.chrome.title)}>{layout.chrome.title.text}</text
			>
			{#each layout.axes.linearTicks as tick (`label:${tick.value}`)}
				<text
					data-chart-text-role="axis"
					x={tick.labelLayout.origin.x}
					y={tick.labelLayout.origin.y}
					textLength={tick.labelLayout.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={textStyle(tick.labelLayout)}>{tick.label}</text
				>
			{/each}
			{#each layout.axes.categoryLabels as category (category.categoryId)}
				<text
					data-chart-text-role="category"
					x={category.labelLayout.origin.x}
					y={category.labelLayout.origin.y}
					textLength={category.labelLayout.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={textStyle(category.labelLayout)}>{category.labelLayout.text}</text
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

		<g class="chart-bar-column__values" opacity={motion.annotationAlpha} fill={chrome.label}>
			{#each geometry.valueLabels as valueLabel (valueLabel.markId)}
				{@const roleStyle = resolveChartTextRoleStyle('value', engineState.transport.orientation)}
				{#if valueLabel.anchor === 'inside'}
					<rect
						x={valueLabel.origin.x - 10}
						y={valueLabel.origin.y - 6}
						width={valueLabel.measurement.width + 20}
						height={valueLabel.measurement.height + 12}
						rx="6"
						fill={chrome.labelPlate}
					/>
				{/if}
				<text
					data-chart-text-role="value"
					data-chart-value={valueLabel.markId}
					x={valueLabel.origin.x}
					y={valueLabel.origin.y}
					textLength={valueLabel.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={`font-size:${roleStyle.fontSize}px;font-weight:${roleStyle.fontWeight};letter-spacing:${roleStyle.letterSpacing}px`}
					>{valueLabelText(valueLabel.markId, valueLabel.text)}</text
				>
			{/each}
		</g>

		<g class="chart-bar-column__legend" opacity={motion.chromeAlpha} fill={chrome.label}>
			{#each layout.chrome.legendItems as legend (legend.itemId)}
				<rect
					data-chart-legend-swatch={legend.itemId}
					x={legend.swatch.x}
					y={legend.swatch.y}
					width={legend.swatch.width}
					height={legend.swatch.height}
					fill="transparent"
				/>
				<text
					data-chart-text-role="legend"
					x={legend.labelLayout.origin.x}
					y={legend.labelLayout.origin.y}
					textLength={legend.labelLayout.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={textStyle(legend.labelLayout)}>{legend.labelLayout.text}</text
				>
			{/each}
		</g>

		<g
			class="chart-bar-column__annotations"
			opacity={motion.annotationAlpha}
			stroke={chrome.annotation}
			fill="none"
		>
			{#each geometry.annotations as annotation (annotation.id)}
				<path
					data-chart-callout-leader={annotation.id}
					d={`M ${annotation.leaderFrom.x} ${annotation.leaderFrom.y} L ${annotation.leaderTo.x} ${annotation.leaderTo.y}`}
					stroke-width="4"
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
	.chart-bar-column {
		block-size: 100%;
		inset: 0;
		inline-size: 100%;
		pointer-events: none;
		position: absolute;
	}
</style>
