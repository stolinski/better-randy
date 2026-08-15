import type { ChartBlock } from '$lib/platform/engine-schema';
import type { DeterministicReadableTextRole } from '$lib/platform/pipelines/types';
import { resolveChartBarColumnGeometry } from './chart-bar-column-geometry';
import { resolveChartFrameLayout } from './chart-layout';
import { resolveChartLineGeometry } from './chart-line-geometry';
import { resolveChartMotionState } from './chart-motion';
import { resolveChartNormalizedGeometry } from './chart-normalized-geometry';
import { createChartRenderTextMeasurer } from './chart-text-measurement';
import type { VideoOrientation } from './video-frame';

export interface ChartReadableText {
	id: string;
	text: string;
	role: DeterministicReadableTextRole;
}

/** Shared chart layout/formatting authority used by CanvasSources and audits. */
export function resolveChartReadableText(
	block: ChartBlock,
	orientation: VideoOrientation,
	compositionProgress: number
): readonly ChartReadableText[] {
	const measureText = createChartRenderTextMeasurer(orientation);
	const layout = resolveChartFrameLayout({ block, orientation, measureText });
	const geometry =
		block.type === 'bar-chart' || block.type === 'column-chart'
			? resolveChartBarColumnGeometry({ block, layout, orientation, measureText })
			: block.type === 'line-chart'
				? resolveChartLineGeometry({ block, layout, orientation, measureText })
				: resolveChartNormalizedGeometry({ block, layout, orientation, measureText });
	if (layout.overflow.length > 0 || geometry.overflow.length > 0) return [];
	const motion = resolveChartMotionState(block.motion, compositionProgress);
	if (motion.chartAlpha <= 0) return [];
	const prefix = `block:${block.id}`;
	const readable: ChartReadableText[] = [];
	if (motion.chromeAlpha > 0) {
		readable.push({
			id: `${prefix}:title`,
			text: layout.chrome.title.text,
			role: 'diagram-headline'
		});
		for (const [index, tick] of layout.axes.linearTicks.entries()) {
			readable.push({ id: `${prefix}:axis:${index}`, text: tick.label, role: 'diagram-caption' });
		}
		for (const category of layout.axes.categoryLabels) {
			readable.push({
				id: `${prefix}:category:${category.categoryId}`,
				text: category.labelLayout.text,
				role: 'diagram-caption'
			});
		}
		for (const legend of layout.chrome.legendItems) {
			readable.push({
				id: `${prefix}:legend:${legend.itemId}`,
				text: legend.labelLayout.text,
				role: 'diagram-caption'
			});
		}
		if (layout.chrome.sourceNote) {
			readable.push({
				id: `${prefix}:source`,
				text: layout.chrome.sourceNote.text,
				role: 'surface-label'
			});
		}
	}
	if (motion.annotationAlpha > 0) {
		for (const valueLabel of geometry.valueLabels) {
			readable.push({
				id: `${prefix}:value:${valueLabel.markId}`,
				text: valueLabel.text,
				role: 'diagram-caption'
			});
		}
		for (const annotation of geometry.annotations) {
			readable.push({
				id: `${prefix}:callout:${annotation.id}`,
				text: annotation.text,
				role: 'diagram-caption'
			});
		}
	}
	return readable;
}
