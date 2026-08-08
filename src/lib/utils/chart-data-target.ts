import type { ChartBlock, ChartDataTarget } from '../platform/engine-schema.ts';
import type { ChartPixelPoint, ChartPixelRect } from './chart-layout.ts';

export interface ChartDatumIdentity {
	seriesId: string;
	categoryId: string;
}

export interface ChartResolvedDataTarget {
	seriesId: string;
	data: readonly ChartDatumIdentity[];
	value: number;
	seriesTotal: number;
}

export interface ChartDatumGeometry {
	identity: ChartDatumIdentity;
	bounds: ChartPixelRect;
	calloutAnchor: ChartPixelPoint;
}

export interface ChartResolvedTargetGeometry {
	bounds: ChartPixelRect;
	anchor: ChartPixelPoint;
}

export class ChartDataTargetInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChartDataTargetInvariantError';
	}
}

/** Encodes both components without delimiter ambiguity, including delimiter-like IDs. */
export function createChartDatumIdentityKey(identity: ChartDatumIdentity): string {
	return `${identity.seriesId.length}:${identity.seriesId}${identity.categoryId.length}:${identity.categoryId}`;
}

function throwChartDataTargetInvariant(message: string): never {
	throw new ChartDataTargetInvariantError(message);
}

export function resolveChartDataTarget(
	block: ChartBlock,
	target: ChartDataTarget
): ChartResolvedDataTarget {
	const series = block.data.series.find((candidate) => candidate.id === target.seriesId);
	if (!series) {
		return throwChartDataTargetInvariant(`Unknown chart series "${target.seriesId}".`);
	}

	const declaredCategoryIds = new Set<string>();
	for (const category of block.data.categories) {
		if (declaredCategoryIds.has(category.id)) {
			return throwChartDataTargetInvariant(`Duplicate chart category "${category.id}".`);
		}
		declaredCategoryIds.add(category.id);
	}
	const datumByCategoryId = new Map<string, (typeof series.values)[number]>();
	let seriesTotal = 0;
	for (const datum of series.values) {
		if (!declaredCategoryIds.has(datum.categoryId)) {
			return throwChartDataTargetInvariant(`Unknown chart category "${datum.categoryId}".`);
		}
		if (datumByCategoryId.has(datum.categoryId)) {
			return throwChartDataTargetInvariant(
				`Chart series "${series.id}" repeats category "${datum.categoryId}".`
			);
		}
		datumByCategoryId.set(datum.categoryId, datum);
		seriesTotal += datum.value;
	}
	for (const category of block.data.categories) {
		if (!datumByCategoryId.has(category.id)) {
			return throwChartDataTargetInvariant(
				`Chart series "${series.id}" has no value for category "${category.id}".`
			);
		}
	}

	const targetCategoryIds =
		target.kind === 'series-total'
			? series.values.map((datum) => datum.categoryId)
			: target.kind === 'datum'
				? [target.categoryId]
				: target.categoryIds;
	const selectedCategoryIds = new Set(targetCategoryIds);
	if (selectedCategoryIds.size !== targetCategoryIds.length) {
		return throwChartDataTargetInvariant(
			'Chart category-set target contains duplicate categories.'
		);
	}
	let value = 0;
	for (const categoryId of targetCategoryIds) {
		const datum = datumByCategoryId.get(categoryId);
		if (!datum) return throwChartDataTargetInvariant(`Unknown chart category "${categoryId}".`);
		value += datum.value;
	}
	const data = block.data.categories
		.filter((category) => selectedCategoryIds.has(category.id))
		.map((category) => ({ seriesId: series.id, categoryId: category.id }));
	if (!Number.isFinite(value) || !Number.isFinite(seriesTotal)) {
		return throwChartDataTargetInvariant('Resolved chart target value must be finite.');
	}
	return { seriesId: series.id, data, value, seriesTotal };
}
export function resolveChartTargetGeometry(
	target: ChartResolvedDataTarget,
	datumGeometry: readonly ChartDatumGeometry[]
): ChartResolvedTargetGeometry {
	if (target.data.length === 0) {
		return throwChartDataTargetInvariant('Resolved chart target must contain at least one datum.');
	}

	const targetIdentityKeys = new Set<string>();
	for (const identity of target.data) {
		if (identity.seriesId !== target.seriesId) {
			return throwChartDataTargetInvariant(
				`Resolved chart datum series "${identity.seriesId}" does not match target series "${target.seriesId}".`
			);
		}
		const key = createChartDatumIdentityKey(identity);
		if (targetIdentityKeys.has(key)) {
			return throwChartDataTargetInvariant(
				`Resolved chart target repeats datum "${identity.seriesId}" / "${identity.categoryId}".`
			);
		}
		targetIdentityKeys.add(key);
	}

	const geometryByIdentity = new Map<string, ChartDatumGeometry>();
	for (const geometry of datumGeometry) {
		const coordinates = [
			geometry.bounds.x,
			geometry.bounds.y,
			geometry.bounds.width,
			geometry.bounds.height,
			geometry.calloutAnchor.x,
			geometry.calloutAnchor.y
		];
		if (
			coordinates.some((coordinate) => !Number.isFinite(coordinate)) ||
			geometry.bounds.width < 0 ||
			geometry.bounds.height < 0
		) {
			return throwChartDataTargetInvariant(
				`Renderer geometry for chart datum "${geometry.identity.seriesId}" / "${geometry.identity.categoryId}" must be finite with non-negative bounds.`
			);
		}
		const key = createChartDatumIdentityKey(geometry.identity);
		if (geometryByIdentity.has(key)) {
			return throwChartDataTargetInvariant(
				`Duplicate renderer geometry for chart datum "${geometry.identity.seriesId}" / "${geometry.identity.categoryId}".`
			);
		}
		geometryByIdentity.set(key, geometry);
	}

	const resolvedGeometry = target.data.map((identity) => {
		const geometry = geometryByIdentity.get(createChartDatumIdentityKey(identity));
		if (!geometry) {
			return throwChartDataTargetInvariant(
				`Missing renderer geometry for chart datum "${identity.seriesId}" / "${identity.categoryId}".`
			);
		}
		return geometry;
	});

	if (resolvedGeometry.length === 1) {
		return {
			bounds: { ...resolvedGeometry[0].bounds },
			anchor: { ...resolvedGeometry[0].calloutAnchor }
		};
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let anchorX = 0;
	let anchorY = 0;
	for (let index = 0; index < resolvedGeometry.length; index += 1) {
		const geometry = resolvedGeometry[index];
		const right = geometry.bounds.x + geometry.bounds.width;
		const bottom = geometry.bounds.y + geometry.bounds.height;
		if (!Number.isFinite(right) || !Number.isFinite(bottom)) {
			return throwChartDataTargetInvariant('Resolved chart target bounds must remain finite.');
		}
		minX = Math.min(minX, geometry.bounds.x);
		minY = Math.min(minY, geometry.bounds.y);
		maxX = Math.max(maxX, right);
		maxY = Math.max(maxY, bottom);
		anchorX = anchorX * (index / (index + 1)) + geometry.calloutAnchor.x / (index + 1);
		anchorY = anchorY * (index / (index + 1)) + geometry.calloutAnchor.y / (index + 1);
	}
	const width = maxX - minX;
	const height = maxY - minY;
	if (![width, height, anchorX, anchorY].every(Number.isFinite)) {
		return throwChartDataTargetInvariant('Resolved chart target geometry must remain finite.');
	}

	return {
		bounds: { x: minX, y: minY, width, height },
		anchor: { x: anchorX, y: anchorY }
	};
}
