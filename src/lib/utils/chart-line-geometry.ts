import type { LineChartBlock } from '$lib/platform/engine-schema';
import {
	createChartDatumIdentityKey,
	resolveChartDataTarget,
	resolveChartTargetGeometry,
	type ChartDatumGeometry
} from './chart-data-target';
import {
	formatChartValueLabel,
	placeChartEditorialAnnotations,
	type ChartEditorialAnnotationLayout
} from './chart-editorial-annotation';
import type {
	ChartFrameLayout,
	ChartLayoutOverflow,
	ChartPixelPoint,
	ChartPixelRect,
	ChartTextMeasurement,
	ChartTextMeasurer
} from './chart-layout';
import { createChartCategoricalScale } from './chart-scale';
import type { VideoOrientation } from './video-frame';

export interface ChartLinePointGeometry extends ChartDatumGeometry {
	id: string;
	seriesId: string;
	categoryId: string;
	seriesIndex: number;
	fillVoiceIndex: number;
	categoryIndex: number;
	value: number;
	bounds: ChartPixelRect;
	cornerRadius: number;
	isHighlighted: boolean;
	revealDirection: 'forward';
}

export interface ChartLineSeriesGeometry {
	seriesId: string;
	seriesIndex: number;
	points: readonly ChartPixelPoint[];
}

export interface ChartLineValueLabelGeometry {
	markId: string;
	text: string;
	origin: ChartPixelPoint;
	measurement: ChartTextMeasurement;
	anchor: 'outside';
}

export interface ChartLineGeometry {
	marks: readonly ChartLinePointGeometry[];
	series: readonly ChartLineSeriesGeometry[];
	legendSwatches: readonly {
		seriesId: string;
		seriesIndex: number;
		fillVoiceIndex: number;
		bounds: ChartPixelRect;
		cornerRadius: number;
	}[];
	valueLabels: readonly ChartLineValueLabelGeometry[];
	annotations: readonly ChartEditorialAnnotationLayout[];
	overflow: readonly ChartLayoutOverflow[];
}

const LINE_POINT_RADIUS = 15;
const LINE_VALUE_GAP = 18;

function rectContains(outer: ChartPixelRect, inner: ChartPixelRect): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

export function resolveChartLineGeometry(input: {
	block: LineChartBlock;
	layout: ChartFrameLayout;
	orientation: VideoOrientation;
	measureText: ChartTextMeasurer;
}): ChartLineGeometry {
	const { block, layout, orientation, measureText } = input;
	if (!layout.linearScale)
		throw new RangeError('Line chart geometry requires a linear chart scale.');
	const categories = createChartCategoricalScale(
		block.data.categories.map((category) => category.id),
		[layout.plotBounds.x, layout.plotBounds.x + layout.plotBounds.width]
	);
	const marks: ChartLinePointGeometry[] = [];
	const series: ChartLineSeriesGeometry[] = [];
	for (let seriesIndex = 0; seriesIndex < block.data.series.length; seriesIndex += 1) {
		const chartSeries = block.data.series[seriesIndex];
		const points: ChartPixelPoint[] = [];
		for (let categoryIndex = 0; categoryIndex < block.data.categories.length; categoryIndex += 1) {
			const category = block.data.categories[categoryIndex];
			const datum = chartSeries.values.find((entry) => entry.categoryId === category.id);
			if (!datum)
				throw new RangeError(
					`Chart series "${chartSeries.id}" has no value for category "${category.id}".`
				);
			const point = {
				x: categories.bands[categoryIndex].center,
				y: layout.linearScale.map(datum.value)
			};
			const identity = { seriesId: chartSeries.id, categoryId: category.id };
			const bounds = {
				x: point.x - LINE_POINT_RADIUS,
				y: point.y - LINE_POINT_RADIUS,
				width: LINE_POINT_RADIUS * 2,
				height: LINE_POINT_RADIUS * 2
			};
			marks.push({
				id: createChartDatumIdentityKey(identity),
				...identity,
				identity,
				seriesIndex,
				fillVoiceIndex: seriesIndex,
				categoryIndex,
				value: datum.value,
				bounds,
				calloutAnchor: point,
				cornerRadius: LINE_POINT_RADIUS,
				isHighlighted: (block.highlights ?? []).some((highlight) => {
					const target = highlight.target;
					return (
						target.seriesId === chartSeries.id &&
						(target.kind === 'series-total' ||
							(target.kind === 'datum' && target.categoryId === category.id) ||
							(target.kind === 'category-set' && target.categoryIds.includes(category.id)))
					);
				}),
				revealDirection: 'forward'
			});
			points.push(point);
		}
		series.push({ seriesId: chartSeries.id, seriesIndex, points });
	}
	const overflow: ChartLayoutOverflow[] = [];
	const valueLabels: ChartLineValueLabelGeometry[] = [];
	if (block.labels.values) {
		for (const mark of marks) {
			const slot = layout.chrome.counterSlots.find(
				(entry) => entry.seriesId === mark.seriesId && entry.categoryId === mark.categoryId
			);
			if (!slot) continue;
			const origin = {
				x: mark.calloutAnchor.x - slot.measurement.width / 2,
				y: mark.calloutAnchor.y - slot.measurement.height - LINE_VALUE_GAP
			};
			const rect = { ...origin, width: slot.measurement.width, height: slot.measurement.height };
			if (!rectContains(layout.plotBounds, rect)) {
				overflow.push({
					code: 'value-label-no-space',
					message: `Line-chart value label "${mark.id}" has no safe plot position.`,
					itemId: mark.id
				});
			}
			valueLabels.push({
				markId: mark.id,
				text: slot.text,
				origin,
				measurement: slot.measurement,
				anchor: 'outside'
			});
		}
	}
	const occupied = [
		...marks.map((mark) => mark.bounds),
		...valueLabels.map((label) => ({
			x: label.origin.x,
			y: label.origin.y,
			width: label.measurement.width,
			height: label.measurement.height
		}))
	];
	const annotations = (block.callouts ?? []).map((callout, declarationIndex) => {
		const resolved = resolveChartDataTarget(block, callout.target);
		const target = resolveChartTargetGeometry(resolved, marks);
		const text = formatChartValueLabel(resolved, callout.valueLabel);
		return {
			id: `${block.id}:callout:${declarationIndex}`,
			declarationIndex,
			anchor: target.anchor,
			text,
			measured: measureText({ text, role: 'callout' })
		};
	});
	const placed = placeChartEditorialAnnotations({
		annotations,
		safeBounds: layout.safeBounds,
		plotBounds: layout.plotBounds,
		occupied,
		orientation
	});
	return {
		marks,
		series,
		legendSwatches: layout.chrome.legendItems.map((legend, seriesIndex) => ({
			seriesId: legend.itemId,
			seriesIndex,
			fillVoiceIndex: seriesIndex,
			bounds: legend.swatch,
			cornerRadius: legend.swatch.width / 2
		})),
		valueLabels,
		annotations: placed.layouts,
		overflow: [...overflow, ...placed.overflow]
	};
}
