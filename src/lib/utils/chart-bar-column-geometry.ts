import {
	CHART_CATEGORY_LIMIT,
	CHART_SERIES_LIMIT,
	type BarChartBlock,
	type ChartDataTarget,
	type ColumnChartBlock
} from '$lib/platform/engine-schema';
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

export type ChartBarColumnBlock = BarChartBlock | ColumnChartBlock;

export interface ChartBarColumnMarkGeometry extends ChartDatumGeometry {
	id: string;
	seriesId: string;
	categoryId: string;
	seriesIndex: number;
	fillVoiceIndex: number;
	categoryIndex: number;
	value: number;
	stackStart: number;
	stackEnd: number;
	bounds: ChartPixelRect;
	valueEndpoint: ChartPixelPoint;
	isZero: boolean;
	cornerRadius: number;
	isHighlighted: boolean;
	revealDirection: 'forward' | 'reverse';
}

export interface ChartLegendSwatchGeometry {
	seriesId: string;
	seriesIndex: number;
	fillVoiceIndex: number;
	bounds: ChartPixelRect;
	cornerRadius: number;
}

export interface ChartBarColumnValueLabelGeometry {
	markId: string;
	text: string;
	origin: ChartPixelPoint;
	measurement: ChartTextMeasurement;
	anchor: 'inside' | 'outside';
}

export interface ChartBarColumnGeometry {
	marks: readonly ChartBarColumnMarkGeometry[];
	legendSwatches: readonly ChartLegendSwatchGeometry[];
	valueLabels: readonly ChartBarColumnValueLabelGeometry[];
	annotations: readonly ChartEditorialAnnotationLayout[];
	overflow: readonly ChartLayoutOverflow[];
}

const CHART_MARK_BAND_INSET = 0.12;
const CHART_GROUP_GAP_FRACTION = 0.04;
const CHART_MAX_GROUP_GAP = 16;
const CHART_MARK_MAX_RADIUS = 32;
const CHART_VALUE_LABEL_GAP = 14;
const CHART_RENDER_MAX_MARKS = CHART_CATEGORY_LIMIT * CHART_SERIES_LIMIT;
const CHART_MIN_MARK_CROSS_SIZE = 18;

function chartMarkId(seriesId: string, categoryId: string): string {
	return createChartDatumIdentityKey({ seriesId, categoryId });
}

export function chartMarkMatchesTarget(
	mark: Pick<ChartBarColumnMarkGeometry, 'seriesId' | 'categoryId'>,
	target: ChartDataTarget
): boolean {
	if (mark.seriesId !== target.seriesId) return false;
	if (target.kind === 'series-total') return true;
	if (target.kind === 'datum') return mark.categoryId === target.categoryId;
	return target.categoryIds.includes(mark.categoryId);
}

function isChartMarkHighlighted(
	mark: Pick<ChartBarColumnMarkGeometry, 'seriesId' | 'categoryId'>,
	block: ChartBarColumnBlock
): boolean {
	return (block.highlights ?? []).some((highlight) =>
		chartMarkMatchesTarget(mark, highlight.target)
	);
}

function resolveMarkCrossAxis(input: {
	bandStart: number;
	bandwidth: number;
	seriesIndex: number;
	seriesCount: number;
	stacked: boolean;
}): { start: number; size: number } {
	const inset = input.bandwidth * CHART_MARK_BAND_INSET;
	const innerStart = input.bandStart + inset;
	const innerSize = Math.max(0, input.bandwidth - inset * 2);
	if (input.stacked || input.seriesCount === 1) return { start: innerStart, size: innerSize };
	const gap = Math.min(CHART_MAX_GROUP_GAP, innerSize * CHART_GROUP_GAP_FRACTION);
	const size = Math.max(0, (innerSize - gap * (input.seriesCount - 1)) / input.seriesCount);
	return { start: innerStart + input.seriesIndex * (size + gap), size };
}

function createMarkRect(input: {
	block: ChartBarColumnBlock;
	layout: ChartFrameLayout;
	categoryStart: number;
	categoryBandwidth: number;
	seriesIndex: number;
	seriesCount: number;
	valueStart: number;
	valueEnd: number;
}): ChartPixelRect {
	const cross = resolveMarkCrossAxis({
		bandStart: input.categoryStart,
		bandwidth: input.categoryBandwidth,
		seriesIndex: input.seriesIndex,
		seriesCount: input.seriesCount,
		stacked: input.block.layout.mode === 'stacked'
	});
	const scale = input.layout.linearScale;
	if (!scale) throw new RangeError('Bar and column mark geometry requires a linear chart scale.');
	const first = scale.map(input.valueStart);
	const second = scale.map(input.valueEnd);
	if (input.block.type === 'bar-chart') {
		return {
			x: Math.min(first, second),
			y: cross.start,
			width: Math.abs(second - first),
			height: cross.size
		};
	}
	return {
		x: cross.start,
		y: Math.min(first, second),
		width: cross.size,
		height: Math.abs(second - first)
	};
}

function chartRectContains(outer: ChartPixelRect, inner: ChartPixelRect): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

function chartRectsOverlap(first: ChartPixelRect, second: ChartPixelRect): boolean {
	return (
		first.x < second.x + second.width &&
		first.x + first.width > second.x &&
		first.y < second.y + second.height &&
		first.y + first.height > second.y
	);
}

function chartAnnotationBracketBounds(
	bracket: NonNullable<ChartEditorialAnnotationLayout['bracket']>
): ChartPixelRect {
	const padding = 15;
	return {
		x: Math.min(bracket.from.x, bracket.to.x) - padding,
		y: Math.min(bracket.from.y, bracket.to.y) - padding,
		width: Math.abs(bracket.to.x - bracket.from.x) + padding * 2,
		height: Math.abs(bracket.to.y - bracket.from.y) + padding * 2
	};
}

function resolveValueLabel(
	block: ChartBarColumnBlock,
	layout: ChartFrameLayout,
	mark: ChartBarColumnMarkGeometry,
	preferInside = false
): ChartBarColumnValueLabelGeometry | null {
	if (!block.labels.values) return null;
	const slot = layout.chrome.counterSlots.find(
		(candidate) => candidate.seriesId === mark.seriesId && candidate.categoryId === mark.categoryId
	);
	if (!slot) return null;
	if ((block.layout.mode === 'stacked' || preferInside) && !mark.isZero) {
		const insideOrigin = {
			x: mark.bounds.x + (mark.bounds.width - slot.measurement.width) / 2,
			y: mark.bounds.y + (mark.bounds.height - slot.measurement.height) / 2
		};
		if (
			mark.bounds.width >= slot.measurement.width + CHART_VALUE_LABEL_GAP * 2 &&
			mark.bounds.height >= slot.measurement.height + CHART_VALUE_LABEL_GAP * 2
		) {
			return {
				markId: mark.id,
				text: slot.text,
				origin: insideOrigin,
				measurement: slot.measurement,
				anchor: 'inside'
			};
		}
	}
	const positive = mark.value >= 0;
	const external: ChartPixelPoint =
		block.type === 'bar-chart'
			? {
					x: positive
						? mark.bounds.x + mark.bounds.width + CHART_VALUE_LABEL_GAP
						: mark.bounds.x - slot.measurement.width - CHART_VALUE_LABEL_GAP,
					y: mark.bounds.y + (mark.bounds.height - slot.measurement.height) / 2
				}
			: {
					x: mark.bounds.x + (mark.bounds.width - slot.measurement.width) / 2,
					y: positive
						? mark.bounds.y - slot.measurement.height - CHART_VALUE_LABEL_GAP
						: mark.bounds.y + mark.bounds.height + CHART_VALUE_LABEL_GAP
				};
	const externalRect = {
		x: external.x,
		y: external.y,
		width: slot.measurement.width,
		height: slot.measurement.height
	};
	if (chartRectContains(layout.plotBounds, externalRect)) {
		return {
			markId: mark.id,
			text: slot.text,
			origin: external,
			measurement: slot.measurement,
			anchor: 'outside'
		};
	}
	const markLongSize = block.type === 'bar-chart' ? mark.bounds.width : mark.bounds.height;
	const textLongSize =
		block.type === 'bar-chart' ? slot.measurement.width : slot.measurement.height;
	const inside = markLongSize >= textLongSize + CHART_VALUE_LABEL_GAP * 2;
	const insideOrigin: ChartPixelPoint =
		block.type === 'bar-chart'
			? {
					x: positive
						? mark.bounds.x + mark.bounds.width - slot.measurement.width - CHART_VALUE_LABEL_GAP
						: mark.bounds.x + CHART_VALUE_LABEL_GAP,
					y: mark.bounds.y + (mark.bounds.height - slot.measurement.height) / 2
				}
			: {
					x: mark.bounds.x + (mark.bounds.width - slot.measurement.width) / 2,
					y: positive
						? mark.bounds.y + CHART_VALUE_LABEL_GAP
						: mark.bounds.y + mark.bounds.height - slot.measurement.height - CHART_VALUE_LABEL_GAP
				};
	return {
		markId: mark.id,
		text: slot.text,
		origin: inside ? insideOrigin : external,
		measurement: slot.measurement,
		anchor: inside ? 'inside' : 'outside'
	};
}

export function resolveChartBarColumnGeometry(input: {
	block: ChartBarColumnBlock;
	layout: ChartFrameLayout;
	orientation: VideoOrientation;
	measureText: ChartTextMeasurer;
}): ChartBarColumnGeometry {
	const { block, layout, orientation, measureText } = input;
	if (!layout.linearScale) {
		throw new RangeError('Bar and column mark geometry requires a linear chart layout.');
	}
	if (block.data.series.length > CHART_SERIES_LIMIT) {
		throw new RangeError(
			`Bar and column rendering supports at most ${CHART_SERIES_LIMIT} declaration-order series.`
		);
	}
	if (block.data.categories.length * block.data.series.length > CHART_RENDER_MAX_MARKS) {
		throw new RangeError(
			`Bar and column rendering supports at most ${CHART_RENDER_MAX_MARKS} factual marks.`
		);
	}
	const categories = createChartCategoricalScale(
		block.data.categories.map((category) => category.id),
		block.type === 'bar-chart'
			? [layout.plotBounds.y, layout.plotBounds.y + layout.plotBounds.height]
			: [layout.plotBounds.x, layout.plotBounds.x + layout.plotBounds.width]
	);
	const positiveStackByCategory = new Map<string, number>();
	const negativeStackByCategory = new Map<string, number>();
	const marks: ChartBarColumnMarkGeometry[] = [];
	for (let categoryIndex = 0; categoryIndex < block.data.categories.length; categoryIndex += 1) {
		const category = block.data.categories[categoryIndex];
		const categoryBand = categories.bands[categoryIndex];
		for (let seriesIndex = 0; seriesIndex < block.data.series.length; seriesIndex += 1) {
			const series = block.data.series[seriesIndex];
			const datum = series.values.find((candidate) => candidate.categoryId === category.id);
			if (!datum) {
				throw new RangeError(
					`Chart series "${series.id}" has no value for category "${category.id}".`
				);
			}
			if (!Number.isFinite(datum.value)) {
				throw new RangeError(`Chart mark "${series.id}:${category.id}" requires a finite value.`);
			}
			const stack = datum.value < 0 ? negativeStackByCategory : positiveStackByCategory;
			const valueStart = block.layout.mode === 'stacked' ? (stack.get(category.id) ?? 0) : 0;
			const valueEnd = valueStart + datum.value;
			if (!Number.isFinite(valueEnd)) {
				throw new RangeError(`Chart stack for category "${category.id}" must remain finite.`);
			}
			if (block.layout.mode === 'stacked') stack.set(category.id, valueEnd);
			const bounds = createMarkRect({
				block,
				layout,
				categoryStart: categoryBand.start,
				categoryBandwidth: categories.bandwidth,
				seriesIndex,
				seriesCount: block.data.series.length,
				valueStart,
				valueEnd
			});
			const partialMark = { seriesId: series.id, categoryId: category.id };
			const valueEndpoint =
				block.type === 'bar-chart'
					? { x: layout.linearScale.map(valueEnd), y: bounds.y + bounds.height / 2 }
					: { x: bounds.x + bounds.width / 2, y: layout.linearScale.map(valueEnd) };
			marks.push({
				id: chartMarkId(series.id, category.id),
				...partialMark,
				seriesIndex,
				fillVoiceIndex: seriesIndex,
				categoryIndex,
				value: datum.value,
				stackStart: valueStart,
				stackEnd: valueEnd,
				identity: partialMark,
				bounds,
				calloutAnchor: valueEndpoint,
				valueEndpoint,
				isZero: datum.value === 0,
				revealDirection:
					layout.linearScale.map(valueStart) <= layout.linearScale.map(valueEnd)
						? 'forward'
						: 'reverse',
				cornerRadius:
					block.layout.mode === 'stacked'
						? 0
						: Math.min(
								CHART_MARK_MAX_RADIUS,
								(block.type === 'bar-chart' ? bounds.height : bounds.width) * 0.12
							),
				isHighlighted: isChartMarkHighlighted(partialMark, block)
			});
		}
	}
	const calledOutDatumMarkIds = new Set(
		(block.callouts ?? []).flatMap((callout) =>
			callout.target.kind === 'datum'
				? [chartMarkId(callout.target.seriesId, callout.target.categoryId)]
				: []
		)
	);
	const valueLabels = marks.flatMap((mark) => {
		const label = resolveValueLabel(block, layout, mark, calledOutDatumMarkIds.has(mark.id));
		return label ? [label] : [];
	});
	const legendSwatches = layout.chrome.legendItems.map((legend, seriesIndex) => ({
		seriesId: legend.itemId,
		seriesIndex,
		fillVoiceIndex: seriesIndex,
		bounds: legend.swatch,
		cornerRadius: Math.min(8, Math.min(legend.swatch.width, legend.swatch.height) * 0.18)
	}));
	const geometryOverflow: ChartLayoutOverflow[] = [];
	const valueLabelRects = valueLabels.map((label) => ({
		id: label.markId,
		rect: {
			x: label.origin.x,
			y: label.origin.y,
			width: label.measurement.width,
			height: label.measurement.height
		}
	}));
	for (let index = 0; index < valueLabelRects.length; index += 1) {
		const valueLabel = valueLabelRects[index];
		const collides = valueLabelRects.some(
			(candidate, candidateIndex) =>
				candidateIndex !== index &&
				valueLabel.rect.x < candidate.rect.x + candidate.rect.width &&
				valueLabel.rect.x + valueLabel.rect.width > candidate.rect.x &&
				valueLabel.rect.y < candidate.rect.y + candidate.rect.height &&
				valueLabel.rect.y + valueLabel.rect.height > candidate.rect.y
		);
		if (!chartRectContains(layout.plotBounds, valueLabel.rect) || collides) {
			geometryOverflow.push({
				code: 'value-label-no-space',
				message: `Chart value label "${valueLabel.id}" has no collision-free plot position.`,
				itemId: valueLabel.id
			});
		}
	}
	for (const mark of marks) {
		const crossSize = block.type === 'bar-chart' ? mark.bounds.height : mark.bounds.width;
		if (crossSize < CHART_MIN_MARK_CROSS_SIZE) {
			geometryOverflow.push({
				code: 'mark-too-small',
				message: `Chart mark "${mark.seriesId}" / "${mark.categoryId}" is thinner than ${CHART_MIN_MARK_CROSS_SIZE} native pixels.`,
				itemId: mark.id
			});
		}
	}
	const readableChrome = [
		layout.chrome.title,
		...layout.chrome.legendItems.map((item) => item.labelLayout),
		...layout.axes.linearTicks.map((tick) => tick.labelLayout),
		...layout.axes.categoryLabels.map((label) => label.labelLayout),
		...(layout.chrome.sourceNote ? [layout.chrome.sourceNote] : [])
	].map((text) => ({
		x: text.origin.x,
		y: text.origin.y,
		width: text.measurement.width,
		height: text.measurement.height
	}));
	const annotationLayouts: ChartEditorialAnnotationLayout[] = [];
	const annotationOverflow: ChartLayoutOverflow[] = [];
	const placedAnnotationOccupied: ChartPixelRect[] = [];
	const staticAnnotationOccupied: ChartPixelRect[] = [
		...marks.map((mark) => mark.bounds),
		...valueLabelRects.map((label) => label.rect),
		...readableChrome
	];
	const callouts = block.callouts ?? [];
	for (const [declarationIndex, callout] of callouts.entries()) {
		const id = `${block.id}:callout:${declarationIndex}`;
		const resolved = resolveChartDataTarget(block, callout.target);
		const targetGeometry = resolveChartTargetGeometry(resolved, marks);
		const text = formatChartValueLabel(resolved, callout.valueLabel);
		const aggregate = resolved.data.length > 1;
		const positive = resolved.value >= 0;
		const valueMeasurement = measureText({ text: String(resolved.value), role: 'value' });
		const baseBracketOffset =
			(block.type === 'bar-chart' ? valueMeasurement.width : valueMeasurement.height) + 24;
		const targetMarkIds = new Set(
			marks.filter((mark) => chartMarkMatchesTarget(mark, callout.target)).map((mark) => mark.id)
		);
		const futureAggregateSharesTarget = callouts.slice(declarationIndex + 1).some((candidate) => {
			const candidateResolved = resolveChartDataTarget(block, candidate.target);
			if (candidateResolved.data.length <= 1) return false;
			return marks.some(
				(mark) => targetMarkIds.has(mark.id) && chartMarkMatchesTarget(mark, candidate.target)
			);
		});
		const bracketObstacles = [
			...marks.filter((mark) => !targetMarkIds.has(mark.id)).map((mark) => mark.bounds),
			...valueLabelRects.map((label) => label.rect),
			...readableChrome,
			...placedAnnotationOccupied
		];
		let bracket: ChartEditorialAnnotationLayout['bracket'];
		if (aggregate) {
			for (let attempt = 0; attempt < 64; attempt += 1) {
				const bracketOffset = baseBracketOffset + attempt * 24;
				const candidate =
					block.type === 'bar-chart'
						? (() => {
								const x = positive
									? targetGeometry.bounds.x + targetGeometry.bounds.width + bracketOffset
									: targetGeometry.bounds.x - bracketOffset;
								return {
									from: { x, y: targetGeometry.bounds.y },
									to: { x, y: targetGeometry.bounds.y + targetGeometry.bounds.height }
								};
							})()
						: (() => {
								const y = positive
									? targetGeometry.bounds.y - bracketOffset
									: targetGeometry.bounds.y + targetGeometry.bounds.height + bracketOffset;
								return {
									from: { x: targetGeometry.bounds.x, y },
									to: { x: targetGeometry.bounds.x + targetGeometry.bounds.width, y }
								};
							})();
				const bounds = chartAnnotationBracketBounds(candidate);
				if (
					chartRectContains(layout.safeBounds, bounds) &&
					!bracketObstacles.some((obstacle) => chartRectsOverlap(bounds, obstacle))
				) {
					bracket = candidate;
					break;
				}
			}
			if (!bracket) {
				geometryOverflow.push({
					code: 'annotation-no-space',
					message: `Chart aggregate annotation "${id}" has no safe bracket route.`,
					itemId: id
				});
				continue;
			}
		}
		const datumAnchor =
			block.type === 'column-chart' && !aggregate && futureAggregateSharesTarget
				? {
						x: positive
							? targetGeometry.bounds.x + targetGeometry.bounds.width
							: targetGeometry.bounds.x,
						y: targetGeometry.bounds.y + targetGeometry.bounds.height / 2
					}
				: targetGeometry.anchor;
		const anchor = bracket
			? {
					x: (bracket.from.x + bracket.to.x) / 2,
					y: (bracket.from.y + bracket.to.y) / 2
				}
			: datumAnchor;
		const annotation: Parameters<typeof placeChartEditorialAnnotations>[0]['annotations'][number] =
			{
				id,
				declarationIndex,
				anchor,
				preferredLane:
					block.type === 'bar-chart' || (!aggregate && futureAggregateSharesTarget)
						? positive
							? 'local-right'
							: 'local-left'
						: positive
							? 'local-above'
							: 'local-below',
				...(bracket ? { bracket } : {}),
				text,
				measured: measureText({ text, role: 'callout' })
			};
		const placed = placeChartEditorialAnnotations({
			annotations: [annotation],
			safeBounds: layout.safeBounds,
			plotBounds: layout.plotBounds,
			occupied: [...staticAnnotationOccupied, ...placedAnnotationOccupied],
			orientation
		});
		annotationLayouts.push(...placed.layouts);
		annotationOverflow.push(...placed.overflow);
		const placedLayout = placed.layouts[0];
		if (placedLayout) placedAnnotationOccupied.push(placedLayout.box);
		if (bracket) placedAnnotationOccupied.push(chartAnnotationBracketBounds(bracket));
	}

	return {
		marks,
		legendSwatches,
		valueLabels,
		annotations: annotationLayouts,
		overflow: [...geometryOverflow, ...annotationOverflow]
	};
}

export function resolveChartBarColumnTargetRect(
	marks: readonly ChartBarColumnMarkGeometry[],
	target: ChartDataTarget
): ChartPixelRect | null {
	const selected = marks.filter((mark) => chartMarkMatchesTarget(mark, target));
	if (selected.length === 0) return null;
	const minX = Math.min(...selected.map((mark) => mark.bounds.x));
	const minY = Math.min(...selected.map((mark) => mark.bounds.y));
	const maxX = Math.max(...selected.map((mark) => mark.bounds.x + mark.bounds.width));
	const maxY = Math.max(...selected.map((mark) => mark.bounds.y + mark.bounds.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
