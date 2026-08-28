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
	import {
		chartAnnotationBracketSvgPath,
		chartAnnotationLeaderSvgPath
	} from '$lib/utils/chart-editorial-annotation';
	import { resolveChartBarColumnGeometry } from '$lib/utils/chart-bar-column-geometry';
	import { resolveChartFrameLayout, type ChartMeasuredTextLayout } from '$lib/utils/chart-layout';
	import { resolveChartMotionState } from '$lib/utils/chart-motion';
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
	// Invalid layout remains visible for repair; static verification blocks delivery.
	const isLayoutValid = $derived(layout.overflow.length === 0 && geometry.overflow.length === 0);
	const motion = $derived(resolveChartMotionState(block.motion, animState.globalProgress));

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
	data-chart-layout-valid={isLayoutValid}
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
				data-gfx-readable-id={`block:${block.id}:title`}
				x={layout.chrome.title.origin.x}
				y={layout.chrome.title.origin.y}
				textLength={layout.chrome.title.measurement.width}
				lengthAdjust="spacingAndGlyphs"
				dominant-baseline="hanging"
				style={textStyle(layout.chrome.title)}>{layout.chrome.title.text}</text
			>
			{#each layout.axes.linearTicks as tick, index (`label:${tick.value}`)}
				<text
					data-chart-text-role="axis"
					data-gfx-readable-id={`block:${block.id}:axis:${index}`}
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
					data-gfx-readable-id={`block:${block.id}:category:${category.categoryId}`}
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
					data-gfx-readable-id={`block:${block.id}:source`}
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
					data-gfx-readable-id={`block:${block.id}:value:${valueLabel.markId}`}
					x={valueLabel.origin.x}
					y={valueLabel.origin.y}
					textLength={valueLabel.measurement.width}
					lengthAdjust="spacingAndGlyphs"
					dominant-baseline="hanging"
					style={`font-size:${roleStyle.fontSize}px;font-weight:${roleStyle.fontWeight};letter-spacing:${roleStyle.letterSpacing}px`}
					>{valueLabel.text}</text
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
					data-gfx-readable-id={`block:${block.id}:legend:${legend.itemId}`}
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
					d={chartAnnotationLeaderSvgPath(annotation)}
					stroke-width="6"
					stroke-linecap="square"
					stroke-linejoin="miter"
				/>
				{#if annotation.bracket}
					<path
						data-chart-callout-bracket={annotation.id}
						d={chartAnnotationBracketSvgPath(annotation.bracket)}
						stroke-width="6"
						stroke-linecap="square"
						stroke-linejoin="miter"
					/>
				{:else}
					<circle
						data-chart-callout-terminal={annotation.id}
						cx={annotation.leaderFrom.x}
						cy={annotation.leaderFrom.y}
						r="9"
						fill={chrome.annotation}
						stroke="none"
					/>
				{/if}
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
					data-gfx-readable-id={`block:${block.id}:callout:${annotation.id}`}
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
