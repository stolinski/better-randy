import type { DotFieldChartBlock, UnitGridChartBlock } from '$lib/platform/engine-schema';

export type ChartNormalizedBlock = UnitGridChartBlock | DotFieldChartBlock;

export interface ChartNormalizedCategoryAllocation {
	categoryId: string;
	categoryIndex: number;
	authoredValue: number;
	exactUnitQuota: number;
	floorUnits: number;
	fractionalRemainder: number;
	allocatedUnits: number;
	roundingDeltaUnits: number;
	receivedLargestRemainderUnit: boolean;
	unitStart: number;
	unitEnd: number;
}

export interface ChartNormalizedAllocation {
	unitCount: number;
	categories: readonly ChartNormalizedCategoryAllocation[];
	unitCategoryIndexes: readonly number[];
	allocationSignature: string;
}

interface ChartDecimalRational {
	numerator: bigint;
	denominator: bigint;
}

function chartNumberAsDecimalRational(value: number): ChartDecimalRational {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(
			'Normalized chart decimal arithmetic requires a finite non-negative value.'
		);
	}
	const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
	if (!match)
		throw new RangeError('Normalized chart decimal arithmetic could not represent a value.');
	const integerDigits = match[1];
	const fractionDigits = match[2] ?? '';
	const exponent = Number(match[3] ?? '0');
	const digits = BigInt(`${integerDigits}${fractionDigits}`);
	const scale = fractionDigits.length - exponent;
	return scale >= 0
		? { numerator: digits, denominator: 10n ** BigInt(scale) }
		: { numerator: digits * 10n ** BigInt(-scale), denominator: 1n };
}

export function allocateChartNormalizedUnits(
	block: ChartNormalizedBlock
): ChartNormalizedAllocation {
	if (block.data.series.length !== 1) {
		throw new RangeError('Normalized chart allocation requires exactly one series.');
	}
	if (!Number.isFinite(block.normalization.total) || block.normalization.total <= 0) {
		throw new RangeError('Normalized chart allocation requires a finite positive total.');
	}
	if (
		!Number.isSafeInteger(block.normalization.unitCount) ||
		block.normalization.unitCount < 10 ||
		block.normalization.unitCount > 1000
	) {
		throw new RangeError(
			'Normalized chart allocation requires an integer unit count from 10 through 1,000.'
		);
	}
	const series = block.data.series[0];
	if (series.values.length !== block.data.categories.length) {
		throw new RangeError('Normalized chart allocation requires one explicit value per category.');
	}
	const categoryIds = new Set(block.data.categories.map((category) => category.id));
	const valueCategoryIds = new Set(series.values.map((datum) => datum.categoryId));
	if (
		categoryIds.size !== block.data.categories.length ||
		valueCategoryIds.size !== series.values.length ||
		[...valueCategoryIds].some((categoryId) => !categoryIds.has(categoryId))
	) {
		throw new RangeError(
			'Normalized chart allocation requires unique matching category identities.'
		);
	}
	const authoredTotal = series.values.reduce((sum, datum) => sum + datum.value, 0);
	const totalTolerance = Math.max(1e-9, Math.abs(block.normalization.total) * 1e-9);
	if (
		!Number.isFinite(authoredTotal) ||
		Math.abs(authoredTotal - block.normalization.total) > totalTolerance
	) {
		throw new RangeError(
			'Normalized chart values must sum to the declared total before largest-remainder allocation.'
		);
	}
	const totalRational = chartNumberAsDecimalRational(block.normalization.total);
	const provisional = block.data.categories.map((category, categoryIndex) => {
		const datum = series.values.find((candidate) => candidate.categoryId === category.id);
		if (!datum) {
			throw new RangeError(
				`Normalized chart series "${series.id}" has no value for category "${category.id}".`
			);
		}
		if (!Number.isFinite(datum.value) || datum.value < 0) {
			throw new RangeError(
				`Normalized chart category "${category.id}" requires a finite non-negative value.`
			);
		}
		const valueRational = chartNumberAsDecimalRational(datum.value);
		const quotaNumerator =
			valueRational.numerator * BigInt(block.normalization.unitCount) * totalRational.denominator;
		const quotaDenominator = valueRational.denominator * totalRational.numerator;
		const floorUnits = Number(quotaNumerator / quotaDenominator);
		const remainderNumerator = quotaNumerator % quotaDenominator;
		const exactUnitQuota =
			(datum.value / block.normalization.total) * block.normalization.unitCount;
		if (!Number.isFinite(exactUnitQuota) || !Number.isSafeInteger(floorUnits)) {
			throw new RangeError(`Normalized chart category "${category.id}" produced non-finite units.`);
		}
		return {
			categoryId: category.id,
			categoryIndex,
			authoredValue: datum.value,
			exactUnitQuota,
			floorUnits,
			fractionalRemainder: exactUnitQuota - floorUnits,
			remainderNumerator,
			remainderDenominator: quotaDenominator
		};
	});
	const floorTotal = provisional.reduce((sum, category) => sum + category.floorUnits, 0);
	const remaining = block.normalization.unitCount - floorTotal;
	if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > provisional.length) {
		throw new RangeError(
			'Normalized chart values must sum to the declared total before largest-remainder allocation.'
		);
	}
	const recipientIndexes = new Set(
		[...provisional]
			.sort((a, b) => {
				const left = a.remainderNumerator * b.remainderDenominator;
				const right = b.remainderNumerator * a.remainderDenominator;
				return left > right ? -1 : left < right ? 1 : a.categoryIndex - b.categoryIndex;
			})
			.slice(0, remaining)
			.map((category) => category.categoryIndex)
	);
	let unitCursor = 0;
	const categories = provisional.map((category) => {
		const receivedLargestRemainderUnit = recipientIndexes.has(category.categoryIndex);
		const allocatedUnits = category.floorUnits + (receivedLargestRemainderUnit ? 1 : 0);
		const unitStart = unitCursor;
		unitCursor += allocatedUnits;
		return {
			categoryId: category.categoryId,
			categoryIndex: category.categoryIndex,
			authoredValue: category.authoredValue,
			exactUnitQuota: category.exactUnitQuota,
			floorUnits: category.floorUnits,
			fractionalRemainder: category.fractionalRemainder,
			allocatedUnits,
			roundingDeltaUnits: allocatedUnits - category.exactUnitQuota,
			receivedLargestRemainderUnit,
			unitStart,
			unitEnd: unitCursor
		};
	});
	const unitCategoryIndexes = categories.flatMap((category) =>
		Array.from({ length: category.allocatedUnits }, () => category.categoryIndex)
	);
	if (unitCursor !== block.normalization.unitCount || unitCategoryIndexes.length !== unitCursor) {
		throw new RangeError('Normalized chart allocation must equal the declared unit count.');
	}
	return {
		unitCount: block.normalization.unitCount,
		categories,
		unitCategoryIndexes,
		allocationSignature: categories
			.map((category) => `${category.categoryId}:${category.allocatedUnits}`)
			.join(',')
	};
}
