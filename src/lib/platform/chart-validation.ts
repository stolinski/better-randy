import { resolveChartDataTarget, ChartDataTargetInvariantError } from '../utils/chart-data-target';
import type {
	ChartBlock,
	ChartDataTarget,
	ChartGroup,
	ChartSeries,
	DiagramPrimitive
} from './engine-schema';

export interface ChartSemanticIssue {
	path: (string | number)[];
	message: string;
}

type ChartTargetResolution = {
	series: ChartSeries;
	value: number;
	seriesTotal: number;
};

const CHART_MOTION_PHASES = ['entry', 'reveal', 'emphasis', 'annotation', 'exit'] as const;

function addChartIssue(
	issues: ChartSemanticIssue[],
	path: (string | number)[],
	message: string
): void {
	issues.push({ path, message });
}

function chartSeriesTotal(series: ChartSeries): number {
	return series.values.reduce((total, datum) => total + datum.value, 0);
}

function resolveChartTargetValue(
	item: ChartBlock,
	target: ChartDataTarget,
	path: (string | number)[],
	issues: ChartSemanticIssue[]
): ChartTargetResolution | null {
	const series = item.data.series.find((candidate) => candidate.id === target.seriesId);
	if (!series) {
		addChartIssue(issues, [...path, 'seriesId'], `Unknown chart series "${target.seriesId}".`);
		return null;
	}

	const categoryIds =
		target.kind === 'series-total'
			? []
			: target.kind === 'datum'
				? [target.categoryId]
				: target.categoryIds;
	let valid = true;
	if (target.kind === 'category-set') {
		const seen = new Set<string>();
		for (let index = 0; index < categoryIds.length; index += 1) {
			if (seen.has(categoryIds[index])) {
				valid = false;
				addChartIssue(
					issues,
					[...path, 'categoryIds', index],
					`Duplicate chart target category "${categoryIds[index]}".`
				);
			}
			seen.add(categoryIds[index]);
		}
	}

	for (let index = 0; index < categoryIds.length; index += 1) {
		const categoryId = categoryIds[index];
		const categoryPath =
			target.kind === 'datum' ? [...path, 'categoryId'] : [...path, 'categoryIds', index];
		if (!item.data.categories.some((category) => category.id === categoryId)) {
			addChartIssue(issues, categoryPath, `Unknown chart category "${categoryId}".`);
			valid = false;
			continue;
		}
		if (!series.values.some((datum) => datum.categoryId === categoryId)) {
			addChartIssue(
				issues,
				categoryPath,
				`Chart series "${series.id}" has no value for category "${categoryId}".`
			);
			valid = false;
		}
	}
	if (!valid) return null;

	try {
		const resolved = resolveChartDataTarget(item, target);
		return { series, value: resolved.value, seriesTotal: resolved.seriesTotal };
	} catch (errorValue) {
		if (!(errorValue instanceof ChartDataTargetInvariantError)) throw errorValue;
		addChartIssue(issues, path, errorValue.message);
		return null;
	}
}
function validateChartDataset(
	item: ChartBlock,
	itemPath: (string | number)[],
	issues: ChartSemanticIssue[]
): void {
	const categoryIds = new Set<string>();
	for (let categoryIndex = 0; categoryIndex < item.data.categories.length; categoryIndex += 1) {
		const category = item.data.categories[categoryIndex];
		if (categoryIds.has(category.id)) {
			addChartIssue(
				issues,
				[...itemPath, 'data', 'categories', categoryIndex, 'id'],
				`Duplicate chart category id "${category.id}".`
			);
		}
		categoryIds.add(category.id);
	}

	const seriesIds = new Set<string>();
	for (let seriesIndex = 0; seriesIndex < item.data.series.length; seriesIndex += 1) {
		const series = item.data.series[seriesIndex];
		if (seriesIds.has(series.id)) {
			addChartIssue(
				issues,
				[...itemPath, 'data', 'series', seriesIndex, 'id'],
				`Duplicate chart series id "${series.id}".`
			);
		}
		seriesIds.add(series.id);

		const seenCategories = new Set<string>();
		for (let valueIndex = 0; valueIndex < series.values.length; valueIndex += 1) {
			const datum = series.values[valueIndex];
			const datumPath = [...itemPath, 'data', 'series', seriesIndex, 'values', valueIndex];
			if (!categoryIds.has(datum.categoryId)) {
				addChartIssue(
					issues,
					[...datumPath, 'categoryId'],
					`Chart datum references unknown category "${datum.categoryId}".`
				);
			}
			if (seenCategories.has(datum.categoryId)) {
				addChartIssue(
					issues,
					[...datumPath, 'categoryId'],
					`Chart series "${series.id}" repeats category "${datum.categoryId}".`
				);
			}
			seenCategories.add(datum.categoryId);
		}
		for (const category of item.data.categories) {
			if (!seenCategories.has(category.id)) {
				addChartIssue(
					issues,
					[...itemPath, 'data', 'series', seriesIndex, 'values'],
					`Chart series "${series.id}" is missing category "${category.id}".`
				);
			}
		}
		if (!Number.isFinite(chartSeriesTotal(series))) {
			addChartIssue(
				issues,
				[...itemPath, 'data', 'series', seriesIndex, 'values'],
				`Chart series "${series.id}" total must be finite.`
			);
		}
	}
}

function validateBarColumnChart(
	item: Extract<ChartBlock, { type: 'bar-chart' | 'column-chart' }>,
	itemPath: (string | number)[],
	issues: ChartSemanticIssue[]
): void {
	const seriesCount = item.data.series.length;
	if (item.layout.mode === 'single' && seriesCount !== 1) {
		addChartIssue(
			issues,
			[...itemPath, 'layout', 'mode'],
			`${item.type} single layout requires exactly one series.`
		);
	}
	if (item.layout.mode !== 'single' && seriesCount < 2) {
		addChartIssue(
			issues,
			[...itemPath, 'layout', 'mode'],
			`${item.type} ${item.layout.mode} layout requires at least two series.`
		);
	}
	if (item.layout.mode === 'stacked') {
		for (let seriesIndex = 0; seriesIndex < item.data.series.length; seriesIndex += 1) {
			for (
				let valueIndex = 0;
				valueIndex < item.data.series[seriesIndex].values.length;
				valueIndex += 1
			) {
				if (item.data.series[seriesIndex].values[valueIndex].value < 0) {
					addChartIssue(
						issues,
						[...itemPath, 'data', 'series', seriesIndex, 'values', valueIndex, 'value'],
						'Stacked chart values must be non-negative.'
					);
				}
			}
		}
	}

	const values =
		item.layout.mode === 'stacked'
			? item.data.categories.map((category) =>
					item.data.series.reduce(
						(total, series) =>
							total + (series.values.find((datum) => datum.categoryId === category.id)?.value ?? 0),
						0
					)
				)
			: item.data.series.flatMap((series) => series.values.map((datum) => datum.value));
	if (item.layout.mode === 'stacked') {
		for (let categoryIndex = 0; categoryIndex < values.length; categoryIndex += 1) {
			if (!Number.isFinite(values[categoryIndex])) {
				addChartIssue(
					issues,
					[...itemPath, 'data', 'series'],
					`Stacked chart total for category "${item.data.categories[categoryIndex].id}" must be finite.`
				);
			}
		}
	}

	if (!item.domain) return;
	if (
		item.domain.min !== undefined &&
		item.domain.max !== undefined &&
		item.domain.min >= item.domain.max
	) {
		addChartIssue(issues, [...itemPath, 'domain'], 'Chart domain min must be less than max.');
	}
	if (item.domain.min !== undefined && item.domain.min > 0) {
		addChartIssue(
			issues,
			[...itemPath, 'domain', 'min'],
			'Bar and column chart domains must include zero.'
		);
	}
	if (item.domain.max !== undefined && item.domain.max < 0) {
		addChartIssue(
			issues,
			[...itemPath, 'domain', 'max'],
			'Bar and column chart domains must include zero.'
		);
	}

	for (const value of values) {
		if (item.domain.min !== undefined && value < item.domain.min) {
			addChartIssue(
				issues,
				[...itemPath, 'domain', 'min'],
				`Chart domain clips value ${value} below min ${item.domain.min}.`
			);
			break;
		}
	}
	for (const value of values) {
		if (item.domain.max !== undefined && value > item.domain.max) {
			addChartIssue(
				issues,
				[...itemPath, 'domain', 'max'],
				`Chart domain clips value ${value} above max ${item.domain.max}.`
			);
			break;
		}
	}
}

function validateNormalizedChart(
	item: Extract<ChartBlock, { type: 'unit-grid-chart' | 'dot-field-chart' }>,
	itemPath: (string | number)[],
	issues: ChartSemanticIssue[]
): void {
	if (item.data.series.length !== 1) {
		addChartIssue(
			issues,
			[...itemPath, 'data', 'series'],
			`${item.type} requires exactly one parts-of-whole series.`
		);
	}
	for (let seriesIndex = 0; seriesIndex < item.data.series.length; seriesIndex += 1) {
		for (
			let valueIndex = 0;
			valueIndex < item.data.series[seriesIndex].values.length;
			valueIndex += 1
		) {
			if (item.data.series[seriesIndex].values[valueIndex].value < 0) {
				addChartIssue(
					issues,
					[...itemPath, 'data', 'series', seriesIndex, 'values', valueIndex, 'value'],
					'Normalized chart parts must be non-negative.'
				);
			}
		}
	}
	if (item.data.series.length !== 1) return;
	const sum = chartSeriesTotal(item.data.series[0]);
	if (!Number.isFinite(sum)) {
		addChartIssue(
			issues,
			[...itemPath, 'data', 'series', 0, 'values'],
			'Normalized chart part sum must be finite.'
		);
		return;
	}
	const tolerance = Math.max(1e-9, Math.abs(item.normalization.total) * 1e-9);
	if (Math.abs(sum - item.normalization.total) > tolerance) {
		addChartIssue(
			issues,
			[...itemPath, 'normalization', 'total'],
			`Normalized chart parts sum to ${sum}, not declared total ${item.normalization.total} within tolerance ${tolerance}.`
		);
	}
}

function validateChartTargets(
	item: ChartBlock,
	itemPath: (string | number)[],
	issues: ChartSemanticIssue[]
): void {
	if (item.fill.role === 'emphasis' && (item.highlights?.length ?? 0) > 0) {
		addChartIssue(
			issues,
			[...itemPath, 'fill', 'role'],
			'Charts with highlights cannot use emphasis as the base fill role.'
		);
	}
	for (let index = 0; index < (item.highlights?.length ?? 0); index += 1) {
		resolveChartTargetValue(
			item,
			item.highlights![index].target,
			[...itemPath, 'highlights', index, 'target'],
			issues
		);
	}
	for (let index = 0; index < (item.callouts?.length ?? 0); index += 1) {
		const callout = item.callouts![index];
		const calloutPath = [...itemPath, 'callouts', index];
		const resolution = resolveChartTargetValue(
			item,
			callout.target,
			[...calloutPath, 'target'],
			issues
		);
		if (!resolution || callout.valueLabel.kind === 'value') continue;
		const { seriesTotal } = resolution;
		if (seriesTotal <= 0) {
			addChartIssue(
				issues,
				[...calloutPath, 'valueLabel'],
				'Percent chart callouts require a positive series total.'
			);
			continue;
		}
		if (callout.valueLabel.kind === 'approximate-fraction-and-percent') {
			const ratio = resolution.value / seriesTotal;
			if (ratio <= 0 || ratio > 1) {
				addChartIssue(
					issues,
					[...calloutPath, 'valueLabel'],
					`Approximate-fraction chart callouts require a target ratio in (0, 1]; received ${ratio}.`
				);
			}
		}
	}
}

function validateChartMotion(
	item: ChartBlock,
	itemPath: (string | number)[],
	issues: ChartSemanticIssue[]
): void {
	let previousEnd = 0;
	for (let index = 0; index < CHART_MOTION_PHASES.length; index += 1) {
		const phaseName = CHART_MOTION_PHASES[index];
		const phase = item.motion[phaseName];
		const phasePath = [...itemPath, 'motion', phaseName];
		const end = phase.start + phase.duration;
		if (end > 1 + 1e-12) {
			addChartIssue(issues, [...phasePath, 'duration'], `Chart ${phaseName} phase ends after 1.`);
		}
		if (index > 0 && phase.start + 1e-12 < previousEnd) {
			addChartIssue(
				issues,
				[...phasePath, 'start'],
				`Chart ${phaseName} phase starts before the previous phase ends at ${previousEnd}.`
			);
		}
		previousEnd = end;
	}
}

export function validateChartGroupSemantics(
	chart: ChartGroup | undefined,
	diagram: readonly DiagramPrimitive[]
): readonly ChartSemanticIssue[] {
	if (!chart) return [];
	const issues: ChartSemanticIssue[] = [];
	if (chart.mode === 'single' && chart.items.length !== 1) {
		addChartIssue(issues, ['chart', 'items'], 'Chart single mode requires exactly one item.');
	}
	if (chart.mode === 'sequence' && (chart.items.length < 2 || chart.items.length > 4)) {
		addChartIssue(
			issues,
			['chart', 'items'],
			'Chart sequence mode requires two through four items.'
		);
	}

	const diagramIds = new Set(diagram.map((primitive) => primitive.id));
	const chartIds = new Set<string>();
	let previousVisibilityEnd = 0;
	for (let itemIndex = 0; itemIndex < chart.items.length; itemIndex += 1) {
		const item = chart.items[itemIndex];
		const itemPath = ['chart', 'items', itemIndex] as (string | number)[];
		if (chartIds.has(item.id)) {
			addChartIssue(issues, [...itemPath, 'id'], `Duplicate chart Block id "${item.id}".`);
		}
		if (diagramIds.has(item.id)) {
			addChartIssue(
				issues,
				[...itemPath, 'id'],
				`Chart Block id "${item.id}" duplicates a surface.diagram[] Block id.`
			);
		}
		chartIds.add(item.id);

		validateChartDataset(item, itemPath, issues);
		if (item.type === 'bar-chart' || item.type === 'column-chart') {
			validateBarColumnChart(item, itemPath, issues);
		} else {
			validateNormalizedChart(item, itemPath, issues);
		}
		validateChartTargets(item, itemPath, issues);
		validateChartMotion(item, itemPath, issues);

		if (chart.mode === 'sequence') {
			const visibilityStart = item.motion.entry.start;
			const visibilityEnd = item.motion.exit.start + item.motion.exit.duration;
			if (itemIndex > 0 && visibilityStart + 1e-12 < previousVisibilityEnd) {
				addChartIssue(
					issues,
					[...itemPath, 'motion', 'entry', 'start'],
					`Chart sequence item starts at ${visibilityStart} before the previous item exits at ${previousVisibilityEnd}.`
				);
			}
			previousVisibilityEnd = visibilityEnd;
		}
	}
	return issues;
}
