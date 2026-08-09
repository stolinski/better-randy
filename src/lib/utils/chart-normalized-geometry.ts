import {
	allocateChartNormalizedUnits,
	type ChartNormalizedBlock,
	type ChartNormalizedCategoryAllocation
} from './chart-normalized-allocation';
import {
	resolveChartDataTarget,
	resolveChartTargetGeometry,
	type ChartDatumGeometry
} from './chart-data-target';
import {
	formatChartValueLabel,
	placeChartEditorialAnnotations,
	routeChartAnnotationLeader,
	type ChartEditorialAnnotationLayout
} from './chart-editorial-annotation';
import type {
	ChartFrameLayout,
	ChartLayoutOverflow,
	ChartPixelPoint,
	ChartPixelRect,
	ChartTextMeasurer
} from './chart-layout';
import type { VideoOrientation } from './video-frame';

export interface ChartNormalizedMarkGeometry extends ChartDatumGeometry {
	id: string;
	seriesId: string;
	categoryId: string;
	categoryIndex: number;
	unitIndex: number;
	categoryUnitIndex: number;
	fillVoiceIndex: number;
	bounds: ChartPixelRect;
	cornerRadius: number;
	isHighlighted: boolean;
	allocationKind: 'base' | 'largest-remainder';
	revealDirection: 'forward';
}

export interface ChartNormalizedLegendSwatchGeometry {
	categoryId: string;
	fillVoiceIndex: number;
	bounds: ChartPixelRect;
	cornerRadius: number;
}

export interface ChartNormalizedGeometry {
	allocations: readonly ChartNormalizedCategoryAllocation[];
	marks: readonly ChartNormalizedMarkGeometry[];
	datumGeometry: readonly ChartDatumGeometry[];
	legendSwatches: readonly ChartNormalizedLegendSwatchGeometry[];
	valueLabels: readonly [];
	annotations: readonly ChartEditorialAnnotationLayout[];
	overflow: readonly ChartLayoutOverflow[];
	grid: { columns: number; rows: number; cellSize: number; markSize: number };
	allocationSignature: string;
}

const NORMALIZED_MARK_SIZE_FRACTION = 0.72;
const NORMALIZED_MIN_MARK_SIZE = 8;

interface ChartNormalizedLeaderCandidate {
	point: ChartPixelPoint;
	markId: string;
	declarationIndex: number;
}

function segmentIntersectsRectInterior(
	from: ChartPixelPoint,
	to: ChartPixelPoint,
	rect: ChartPixelRect
): boolean {
	const epsilon = 1e-6;
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const p = [-dx, dx, -dy, dy];
	const q = [
		from.x - (rect.x + epsilon),
		rect.x + rect.width - epsilon - from.x,
		from.y - (rect.y + epsilon),
		rect.y + rect.height - epsilon - from.y
	];
	let entry = 0;
	let exit = 1;
	for (let index = 0; index < p.length; index += 1) {
		const direction = p[index];
		const distance = q[index];
		if (direction === undefined || distance === undefined) return false;
		if (Math.abs(direction) < Number.EPSILON) {
			if (distance < 0) return false;
			continue;
		}
		const ratio = distance / direction;
		if (direction < 0) entry = Math.max(entry, ratio);
		else exit = Math.min(exit, ratio);
		if (entry > exit) return false;
	}
	return entry < 1 && exit > 0;
}

function normalizedLeaderCandidates(
	targetMarks: readonly ChartNormalizedMarkGeometry[],
	box: ChartPixelRect
): ChartNormalizedLeaderCandidate[] {
	const boxCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	return targetMarks
		.flatMap((mark) => {
			const { x, y, width, height } = mark.bounds;
			const right = x + width;
			const bottom = y + height;
			const points = [
				{ x: right, y: y + height / 2 },
				{ x: x + width / 2, y },
				{ x: x + width / 2, y: bottom },
				{ x, y: y + height / 2 }
			];
			return points.map((point, declarationIndex) => ({
				point,
				markId: mark.id,
				declarationIndex: mark.unitIndex * points.length + declarationIndex
			}));
		})
		.sort((a, b) => {
			const aDistance = (a.point.x - boxCenter.x) ** 2 + (a.point.y - boxCenter.y) ** 2;
			const bDistance = (b.point.x - boxCenter.x) ** 2 + (b.point.y - boxCenter.y) ** 2;
			return aDistance - bDistance || a.declarationIndex - b.declarationIndex;
		})
		.slice(0, 64);
}

// Normalized charts have no authored routing escape hatch. Search deterministic mark
// perimeter starts, then route an orthogonal leader to a box-edge midpoint. Dense fields
// may need one clean dogleg corridor to avoid claiming a different category's marks.
function normalizedOrthogonalLeaderRoutes(
	leaderFrom: ChartPixelPoint,
	box: ChartPixelRect,
	allMarks: readonly ChartNormalizedMarkGeometry[]
) {
	const direct = routeChartAnnotationLeader(leaderFrom, box);
	const routeGutter = 24;
	const horizontalCorridors = [
		...new Set([
			box.y - routeGutter,
			box.y + box.height + routeGutter,
			...allMarks.flatMap((mark) => [
				mark.bounds.y - routeGutter,
				mark.bounds.y + mark.bounds.height + routeGutter
			])
		])
	];
	const verticalCorridors = [
		...new Set([
			box.x - routeGutter,
			box.x + box.width + routeGutter,
			...allMarks.flatMap((mark) => [
				mark.bounds.x - routeGutter,
				mark.bounds.x + mark.bounds.width + routeGutter
			])
		])
	];
	const routes = [direct];
	for (const corridorY of horizontalCorridors) {
		const leaderTo =
			corridorY <= box.y
				? { x: box.x + box.width / 2, y: box.y }
				: corridorY >= box.y + box.height
					? { x: box.x + box.width / 2, y: box.y + box.height }
					: null;
		if (!leaderTo) continue;
		routes.push({
			leaderFrom,
			leaderWaypoints: [
				{ x: leaderFrom.x, y: corridorY },
				{ x: leaderTo.x, y: corridorY }
			].filter(
				(point, index, points) =>
					(index === 0
						? point.x !== leaderFrom.x || point.y !== leaderFrom.y
						: point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y) &&
					(point.x !== leaderTo.x || point.y !== leaderTo.y)
			),
			leaderTo
		});
	}
	for (const corridorX of verticalCorridors) {
		const leaderTo =
			corridorX <= box.x
				? { x: box.x, y: box.y + box.height / 2 }
				: corridorX >= box.x + box.width
					? { x: box.x + box.width, y: box.y + box.height / 2 }
					: null;
		if (!leaderTo) continue;
		routes.push({
			leaderFrom,
			leaderWaypoints: [
				{ x: corridorX, y: leaderFrom.y },
				{ x: corridorX, y: leaderTo.y }
			].filter(
				(point, index, points) =>
					(index === 0
						? point.x !== leaderFrom.x || point.y !== leaderFrom.y
						: point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y) &&
					(point.x !== leaderTo.x || point.y !== leaderTo.y)
			),
			leaderTo
		});
	}
	return routes;
}

function routeNormalizedAnnotationLeader(
	annotation: ChartEditorialAnnotationLayout,
	targetMarks: readonly ChartNormalizedMarkGeometry[],
	allMarks: readonly ChartNormalizedMarkGeometry[],
	safeBounds: ChartPixelRect,
	calloutBoxes: readonly ChartPixelRect[]
): ChartEditorialAnnotationLayout | null {
	const targetMarkIds = new Set(targetMarks.map((mark) => mark.id));
	const nonTargetMarks = allMarks.filter((mark) => !targetMarkIds.has(mark.id));
	const candidates = normalizedLeaderCandidates(targetMarks, annotation.box)
		.flatMap((candidate) =>
			normalizedOrthogonalLeaderRoutes(candidate.point, annotation.box, allMarks).map(
				(route, routeIndex) => {
					const points = [route.leaderFrom, ...route.leaderWaypoints, route.leaderTo];
					const distance = points.slice(1).reduce((total, point, index) => {
						const previous = points[index];
						return previous
							? total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
							: total;
					}, 0);
					return { ...candidate, route, routeIndex, points, distance };
				}
			)
		)
		.sort(
			(a, b) =>
				a.distance - b.distance ||
				a.route.leaderWaypoints.length - b.route.leaderWaypoints.length ||
				a.declarationIndex - b.declarationIndex ||
				a.routeIndex - b.routeIndex
		);
	const leaderClearance = 18;
	const selected = candidates.find((candidate) => {
		const withinSafeBounds = candidate.points.every(
			(point) =>
				point.x >= safeBounds.x &&
				point.x <= safeBounds.x + safeBounds.width &&
				point.y >= safeBounds.y &&
				point.y <= safeBounds.y + safeBounds.height
		);
		if (!withinSafeBounds) return false;
		const segmentsAvoid = (rect: ChartPixelRect): boolean =>
			candidate.points.slice(1).every((point, index) => {
				const previous = candidate.points[index];
				return previous ? !segmentIntersectsRectInterior(previous, point, rect) : true;
			});
		if (!calloutBoxes.every(segmentsAvoid)) return false;
		return nonTargetMarks.every((mark) =>
			segmentsAvoid({
				x: mark.bounds.x - leaderClearance,
				y: mark.bounds.y - leaderClearance,
				width: mark.bounds.width + leaderClearance * 2,
				height: mark.bounds.height + leaderClearance * 2
			})
		);
	});
	return selected ? { ...annotation, ...selected.route } : null;
}

function resolveNormalizedGrid(
	bounds: ChartPixelRect,
	unitCount: number,
	orientation: VideoOrientation
): { columns: number; rows: number; cellSize: number; markSize: number; x: number; y: number } {
	let best: {
		columns: number;
		rows: number;
		cellSize: number;
		empty: number;
		aspectError: number;
	} | null = null;
	const targetAspect = bounds.width / bounds.height;
	for (let columns = 1; columns <= unitCount; columns += 1) {
		const rows = Math.ceil(unitCount / columns);
		const cellSize = Math.min(bounds.width / columns, bounds.height / rows);
		const empty = columns * rows - unitCount;
		const aspectError = Math.abs(columns / rows - targetAspect);
		if (
			best === null ||
			cellSize > best.cellSize + 1e-9 ||
			(Math.abs(cellSize - best.cellSize) <= 1e-9 &&
				(empty < best.empty ||
					(empty === best.empty &&
						(aspectError < best.aspectError - 1e-9 ||
							(Math.abs(aspectError - best.aspectError) <= 1e-9 &&
								(orientation === 'horizontal'
									? columns > best.columns
									: columns < best.columns))))))
		) {
			best = { columns, rows, cellSize, empty, aspectError };
		}
	}
	if (!best || !Number.isFinite(best.cellSize) || best.cellSize <= 0) {
		throw new RangeError('Normalized chart grid requires positive finite plot bounds.');
	}
	const gridWidth = best.columns * best.cellSize;
	const gridHeight = best.rows * best.cellSize;
	return {
		columns: best.columns,
		rows: best.rows,
		cellSize: best.cellSize,
		markSize: best.cellSize * NORMALIZED_MARK_SIZE_FRACTION,
		x: bounds.x + (bounds.width - gridWidth) / 2,
		y: bounds.y + (bounds.height - gridHeight) / 2
	};
}

export function resolveChartNormalizedGeometry(input: {
	block: ChartNormalizedBlock;
	layout: ChartFrameLayout;
	orientation: VideoOrientation;
	measureText: ChartTextMeasurer;
}): ChartNormalizedGeometry {
	const { block, layout, orientation, measureText } = input;
	const allocation = allocateChartNormalizedUnits(block);
	const allocations = allocation.categories;
	const allocatedTotal = allocation.unitCategoryIndexes.length;
	if (allocatedTotal !== block.normalization.unitCount) {
		throw new RangeError('Normalized chart allocation must equal the declared unit count.');
	}
	const grid = resolveNormalizedGrid(layout.plotBounds, block.normalization.unitCount, orientation);
	const series = block.data.series[0];
	const highlightedCategoryIds = new Set<string>();
	for (const highlight of block.highlights ?? []) {
		const resolvedHighlight = resolveChartDataTarget(block, highlight.target);
		for (const identity of resolvedHighlight.data) {
			highlightedCategoryIds.add(identity.categoryId);
		}
	}
	const marks: ChartNormalizedMarkGeometry[] = [];
	let unitIndex = 0;
	for (const allocation of allocations) {
		for (
			let categoryUnitIndex = 0;
			categoryUnitIndex < allocation.allocatedUnits;
			categoryUnitIndex += 1
		) {
			const column =
				orientation === 'horizontal' ? unitIndex % grid.columns : Math.floor(unitIndex / grid.rows);
			const row =
				orientation === 'horizontal' ? Math.floor(unitIndex / grid.columns) : unitIndex % grid.rows;
			const bounds = {
				x: grid.x + column * grid.cellSize + (grid.cellSize - grid.markSize) / 2,
				y: grid.y + row * grid.cellSize + (grid.cellSize - grid.markSize) / 2,
				width: grid.markSize,
				height: grid.markSize
			};
			const identity = { seriesId: series.id, categoryId: allocation.categoryId };
			const roundedAdjustment =
				allocation.receivedLargestRemainderUnit &&
				categoryUnitIndex === allocation.allocatedUnits - 1;
			marks.push({
				id: `${block.id}:unit:${unitIndex}`,
				identity,
				...identity,
				categoryIndex: allocation.categoryIndex,
				unitIndex,
				categoryUnitIndex,
				fillVoiceIndex: allocation.categoryIndex,
				bounds,
				calloutAnchor: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
				cornerRadius: block.type === 'dot-field-chart' ? grid.markSize / 2 : grid.markSize * 0.16,
				isHighlighted: highlightedCategoryIds.has(allocation.categoryId),
				revealDirection: 'forward',
				allocationKind: roundedAdjustment ? 'largest-remainder' : 'base'
			});
			unitIndex += 1;
		}
	}
	const datumGeometry: ChartDatumGeometry[] = allocations.map((allocation) => {
		const categoryMarks = marks.filter((mark) => mark.categoryId === allocation.categoryId);
		const identity = { seriesId: series.id, categoryId: allocation.categoryId };
		if (categoryMarks.length === 0) {
			const fallbackIndex = Math.min(allocation.unitStart, block.normalization.unitCount - 1);
			const column =
				orientation === 'horizontal'
					? fallbackIndex % grid.columns
					: Math.floor(fallbackIndex / grid.rows);
			const row =
				orientation === 'horizontal'
					? Math.floor(fallbackIndex / grid.columns)
					: fallbackIndex % grid.rows;
			const x = grid.x + column * grid.cellSize + grid.cellSize / 2;
			const y = grid.y + row * grid.cellSize + grid.cellSize / 2;
			return { identity, bounds: { x, y, width: 0, height: 0 }, calloutAnchor: { x, y } };
		}
		const minX = Math.min(...categoryMarks.map((mark) => mark.bounds.x));
		const minY = Math.min(...categoryMarks.map((mark) => mark.bounds.y));
		const maxX = Math.max(...categoryMarks.map((mark) => mark.bounds.x + mark.bounds.width));
		const maxY = Math.max(...categoryMarks.map((mark) => mark.bounds.y + mark.bounds.height));
		return {
			identity,
			bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
			calloutAnchor: {
				x:
					categoryMarks.reduce((sum, mark) => sum + mark.bounds.x + mark.bounds.width / 2, 0) /
					categoryMarks.length,
				y:
					categoryMarks.reduce((sum, mark) => sum + mark.bounds.y + mark.bounds.height / 2, 0) /
					categoryMarks.length
			}
		};
	});
	const legendSwatches = layout.chrome.legendItems.map((legend, fillVoiceIndex) => ({
		categoryId: legend.itemId,
		fillVoiceIndex,
		bounds: legend.swatch,
		cornerRadius:
			block.type === 'dot-field-chart'
				? Math.min(legend.swatch.width, legend.swatch.height) / 2
				: Math.min(8, Math.min(legend.swatch.width, legend.swatch.height) * 0.18)
	}));
	const overflow: ChartLayoutOverflow[] = [];
	if (grid.markSize < NORMALIZED_MIN_MARK_SIZE) {
		overflow.push({
			code: 'mark-too-small',
			message: `Normalized chart marks are smaller than ${NORMALIZED_MIN_MARK_SIZE} native pixels.`,
			itemId: block.id
		});
	}
	const annotationTargetMarks = new Map<string, readonly ChartNormalizedMarkGeometry[]>();
	const annotationInputs = (block.callouts ?? []).map((callout, declarationIndex) => {
		const id = `${block.id}:callout:${declarationIndex}`;
		const resolved = resolveChartDataTarget(block, callout.target);
		const targetGeometry = resolveChartTargetGeometry(resolved, datumGeometry);
		const targetIdentities = new Set(
			resolved.data.map((identity) => `${identity.seriesId}:${identity.categoryId}`)
		);
		annotationTargetMarks.set(
			id,
			marks.filter((mark) => targetIdentities.has(`${mark.seriesId}:${mark.categoryId}`))
		);
		const text = formatChartValueLabel(resolved, callout.valueLabel);
		return {
			id,
			declarationIndex,
			anchor: targetGeometry.anchor,
			text,
			measured: measureText({ text, role: 'callout' as const })
		};
	});
	const readableChrome = [
		layout.chrome.title,
		...layout.chrome.legendItems.map((item) => item.labelLayout),
		...(layout.chrome.sourceNote ? [layout.chrome.sourceNote] : [])
	].map((text) => ({
		x: text.origin.x,
		y: text.origin.y,
		width: text.measurement.width,
		height: text.measurement.height
	}));
	const annotationPlacement =
		annotationInputs.length === 0
			? { layouts: [], overflow: [] }
			: placeChartEditorialAnnotations({
					annotations: annotationInputs,
					safeBounds: layout.safeBounds,
					plotBounds: layout.plotBounds,
					occupied: [...marks.map((mark) => mark.bounds), ...readableChrome],
					orientation
				});
	const annotationRoutingOverflow: ChartLayoutOverflow[] = [];
	const annotations = annotationPlacement.layouts.flatMap((annotation) => {
		const targetMarks = annotationTargetMarks.get(annotation.id) ?? [];
		if (targetMarks.length === 0) return [annotation];
		const routed = routeNormalizedAnnotationLeader(
			annotation,
			targetMarks,
			marks,
			layout.safeBounds,
			annotationPlacement.layouts.map((layout) => layout.box)
		);
		if (routed) return [routed];
		annotationRoutingOverflow.push({
			code: 'annotation-no-space',
			message: `Chart annotation "${annotation.id}" has no mark-safe leader route.`,
			itemId: block.id
		});
		return [];
	});
	return {
		allocations,
		marks,
		datumGeometry,
		legendSwatches,
		valueLabels: [],
		annotations,
		overflow: [...overflow, ...annotationPlacement.overflow, ...annotationRoutingOverflow],
		allocationSignature: allocation.allocationSignature,
		grid: {
			columns: grid.columns,
			rows: grid.rows,
			cellSize: grid.cellSize,
			markSize: grid.markSize
		}
	};
}
