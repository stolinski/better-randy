import { resolveChartDataTarget } from '$lib/utils/chart-data-target';
import { CHART_MOTION_PHASE_NAMES, CHART_TIMING_EPSILON } from '$lib/utils/chart-motion';
import {
	CHART_CALLOUT_LIMIT,
	CHART_CATEGORY_LIMIT,
	CHART_HIGHLIGHT_LIMIT,
	CHART_SERIES_LIMIT,
	type ChartBlock,
	type ChartDataTarget,
	type ChartMotion,
	type ChartSeries,
	type SurfaceState
} from './engine-schema';

export type ChartBlockType = ChartBlock['type'];
export type ChartTargetKind = ChartDataTarget['kind'];
type BarColumnChartBlock = Extract<ChartBlock, { type: 'bar-chart' | 'column-chart' }>;
type ChartDomain = NonNullable<BarColumnChartBlock['domain']>;
type ChartLayoutMode = BarColumnChartBlock['layout']['mode'];

const CHART_SINGLE_MOTION: ChartMotion = {
	entry: { start: 0.05, duration: 0.08 },
	reveal: { start: 0.13, duration: 0.18 },
	emphasis: { start: 0.31, duration: 0.08 },
	annotation: { start: 0.39, duration: 0.1 },
	exit: { start: 0.84, duration: 0.1 }
};

function cloneChartMotion(motion: ChartMotion): ChartMotion {
	return {
		entry: { ...motion.entry },
		reveal: { ...motion.reveal },
		emphasis: { ...motion.emphasis },
		annotation: { ...motion.annotation },
		exit: { ...motion.exit }
	};
}

function nextChartAuthoringId(prefix: string, existing: readonly { id: string }[]): string {
	const used = new Set(existing.map((entry) => entry.id));
	let suffix = 1;
	while (used.has(`${prefix}-${suffix}`)) suffix += 1;
	return `${prefix}-${suffix}`;
}

function chartSequenceMotion(index: number): ChartMotion {
	const start = index * 0.25 + 0.01;
	return {
		entry: { start, duration: 0.03 },
		reveal: { start: start + 0.03, duration: 0.07 },
		emphasis: { start: start + 0.1, duration: 0.04 },
		annotation: { start: start + 0.14, duration: 0.04 },
		exit: { start: start + 0.2, duration: 0.03 }
	};
}

function retimeChartGroup(items: ChartBlock[]): void {
	if (items.length === 1) {
		items[0].motion = cloneChartMotion(CHART_SINGLE_MOTION);
		return;
	}
	items.forEach((item, index) => {
		item.motion = chartSequenceMotion(index);
	});
}

export function createDefaultChartBlock(type: ChartBlockType, id: string): ChartBlock {
	const data = {
		categories: [
			{ id: 'category-1', label: 'Category A' },
			{ id: 'category-2', label: 'Category B' }
		],
		series: [
			{
				id: 'series-1',
				label: 'Series A',
				values: [
					{ categoryId: 'category-1', value: 40 },
					{ categoryId: 'category-2', value: 60 }
				]
			}
		]
	};
	const common = {
		id,
		title: 'Chart title',
		data,
		labels: { categories: true, values: true, legend: false },
		fill: { role: 'default' as const },
		motion: cloneChartMotion(CHART_SINGLE_MOTION)
	};
	return type === 'bar-chart' || type === 'column-chart'
		? { ...common, type, layout: { mode: 'single' }, domain: { min: 0, max: 100 } }
		: { ...common, type, normalization: { total: 100, unitCount: 100 } };
}

export function appendChartBlock(surface: SurfaceState, type: ChartBlockType): string | null {
	if (surface.type !== 'plain' && surface.type !== 'paper') return null;
	const items = surface.chart?.items ?? [];
	if (items.length >= 4) return null;
	const id = nextChartAuthoringId(type, [...items, ...(surface.diagram ?? [])]);
	const next = createDefaultChartBlock(type, id);
	if (!surface.chart) {
		surface.chart = { mode: 'single', items: [next] };
		return id;
	}
	surface.chart.items.push(next);
	surface.chart.mode = 'sequence';
	retimeChartGroup(surface.chart.items);
	return id;
}

export function removeChartBlock(surface: SurfaceState, id: string): void {
	const chart = surface.chart;
	if (!chart) return;
	const index = chart.items.findIndex((item) => item.id === id);
	if (index < 0) return;
	chart.items.splice(index, 1);
	if (chart.items.length === 0) {
		surface.chart = undefined;
		return;
	}
	chart.mode = chart.items.length === 1 ? 'single' : 'sequence';
	retimeChartGroup(chart.items);
}

function chartCommonFields(
	block: ChartBlock
): Pick<
	ChartBlock,
	'id' | 'title' | 'data' | 'labels' | 'highlights' | 'callouts' | 'sourceNote' | 'fill' | 'motion'
> {
	return {
		id: block.id,
		title: block.title,
		data: block.data,
		labels: block.labels,
		highlights: block.highlights,
		callouts: block.callouts,
		sourceNote: block.sourceNote,
		fill: block.fill,
		motion: block.motion
	};
}

export function replaceChartBlockType(
	surface: SurfaceState,
	id: string,
	nextType: ChartBlockType
): boolean {
	const items = surface.chart?.items;
	const index = items?.findIndex((item) => item.id === id) ?? -1;
	if (!items || index < 0) return false;
	const current = items[index];
	if (current.type === nextType) return true;
	const common = chartCommonFields(current);
	if (
		(current.type === 'bar-chart' || current.type === 'column-chart') &&
		(nextType === 'bar-chart' || nextType === 'column-chart')
	) {
		items[index] = {
			...common,
			type: nextType,
			layout: { ...current.layout },
			domain: current.domain ? { ...current.domain } : undefined
		};
		return true;
	}
	if (nextType === 'unit-grid-chart' || nextType === 'dot-field-chart') {
		if (current.data.series.length !== 1) return false;
		const values = current.data.series[0].values.map((datum) => datum.value);
		if (values.some((value) => value < 0)) return false;
		const total = values.reduce((sum, value) => sum + value, 0);
		if (!Number.isFinite(total) || total <= 0) return false;
		items[index] = {
			...common,
			type: nextType,
			normalization: {
				total,
				unitCount:
					current.type === 'unit-grid-chart' || current.type === 'dot-field-chart'
						? current.normalization.unitCount
						: 100
			}
		};
		return true;
	}
	const values = current.data.series.flatMap((series) => series.values.map((datum) => datum.value));
	const minimum = Math.min(0, ...values);
	const maximum = Math.max(1, ...values);
	items[index] = {
		...common,
		type: nextType,
		layout: {
			mode:
				current.type === 'bar-chart' || current.type === 'column-chart'
					? current.layout.mode
					: 'single'
		},
		domain: { min: minimum, max: maximum }
	};
	return true;
}

function removeTargetsMatching(
	block: ChartBlock,
	matches: (target: ChartDataTarget) => boolean
): void {
	block.highlights = block.highlights?.filter((entry) => !matches(entry.target));
	block.callouts = block.callouts?.filter((entry) => !matches(entry.target));
}

function recomputeNormalizedTotal(block: ChartBlock): boolean {
	if (block.type !== 'unit-grid-chart' && block.type !== 'dot-field-chart') return true;
	const total = block.data.series[0].values.reduce((sum, datum) => sum + datum.value, 0);
	if (!Number.isFinite(total) || total <= 0) return false;
	block.normalization.total = total;
	return true;
}

export function renameChartCategory(
	block: ChartBlock,
	previousId: string,
	nextId: string
): boolean {
	const normalizedId = nextId.trim();
	if (
		normalizedId.length === 0 ||
		block.data.categories.some(
			(category) => category.id === normalizedId && category.id !== previousId
		)
	)
		return false;
	const category = block.data.categories.find((entry) => entry.id === previousId);
	if (!category) return false;
	category.id = normalizedId;
	for (const series of block.data.series) {
		const datum = series.values.find((entry) => entry.categoryId === previousId);
		if (datum) datum.categoryId = normalizedId;
	}
	for (const entry of [...(block.highlights ?? []), ...(block.callouts ?? [])]) {
		if (entry.target.kind === 'datum' && entry.target.categoryId === previousId) {
			entry.target.categoryId = normalizedId;
		} else if (entry.target.kind === 'category-set') {
			entry.target.categoryIds = entry.target.categoryIds.map((id) =>
				id === previousId ? normalizedId : id
			);
		}
	}
	return true;
}

export function renameChartSeries(block: ChartBlock, previousId: string, nextId: string): boolean {
	const normalizedId = nextId.trim();
	if (
		normalizedId.length === 0 ||
		block.data.series.some((series) => series.id === normalizedId && series.id !== previousId)
	)
		return false;
	const series = block.data.series.find((entry) => entry.id === previousId);
	if (!series) return false;
	series.id = normalizedId;
	for (const entry of [...(block.highlights ?? []), ...(block.callouts ?? [])]) {
		if (entry.target.seriesId === previousId) entry.target.seriesId = normalizedId;
	}
	return true;
}

export function appendChartCategory(block: ChartBlock): string | null {
	if (block.data.categories.length >= CHART_CATEGORY_LIMIT) return null;
	const id = nextChartAuthoringId('category', block.data.categories);
	block.data.categories.push({ id, label: `Category ${block.data.categories.length + 1}` });
	for (const series of block.data.series) series.values.push({ categoryId: id, value: 0 });
	return id;
}

export function removeChartCategory(block: ChartBlock, categoryId: string): boolean {
	if (block.data.categories.length <= 1) return false;
	const categoryIndex = block.data.categories.findIndex((category) => category.id === categoryId);
	if (categoryIndex < 0) return false;
	if (block.type === 'unit-grid-chart' || block.type === 'dot-field-chart') {
		const remainingTotal = block.data.series[0].values
			.filter((datum) => datum.categoryId !== categoryId)
			.reduce((sum, datum) => sum + datum.value, 0);
		if (!Number.isFinite(remainingTotal) || remainingTotal <= 0) return false;
	}
	block.data.categories.splice(categoryIndex, 1);
	for (const series of block.data.series) {
		const valueIndex = series.values.findIndex((datum) => datum.categoryId === categoryId);
		if (valueIndex >= 0) series.values.splice(valueIndex, 1);
	}
	removeTargetsMatching(block, (target) => {
		if (target.kind === 'datum') return target.categoryId === categoryId;
		if (target.kind !== 'category-set') return false;
		target.categoryIds = target.categoryIds.filter((id) => id !== categoryId);
		return target.categoryIds.length < 2;
	});
	const accepted = recomputeNormalizedTotal(block);
	if (accepted) repairChartCalloutFormatters(block);
	return accepted;
}

export function appendChartSeries(block: ChartBlock): string | null {
	if (
		block.type === 'unit-grid-chart' ||
		block.type === 'dot-field-chart' ||
		block.data.series.length >= CHART_SERIES_LIMIT
	)
		return null;
	const id = nextChartAuthoringId('series', block.data.series);
	const series: ChartSeries = {
		id,
		label: `Series ${block.data.series.length + 1}`,
		values: block.data.categories.map((category) => ({ categoryId: category.id, value: 0 }))
	};
	block.data.series.push(series);
	if (block.layout.mode === 'single') block.layout.mode = 'grouped';
	return id;
}

export function removeChartSeries(block: ChartBlock, seriesId: string): boolean {
	if (block.data.series.length <= 1) return false;
	const index = block.data.series.findIndex((series) => series.id === seriesId);
	if (index < 0) return false;
	block.data.series.splice(index, 1);
	if (
		(block.type === 'bar-chart' || block.type === 'column-chart') &&
		block.data.series.length === 1
	) {
		block.layout.mode = 'single';
	}
	removeTargetsMatching(block, (target) => target.seriesId === seriesId);
	return true;
}

function chartAuthoringDomainValues(
	block: BarColumnChartBlock,
	layoutMode: ChartLayoutMode
): number[] {
	return layoutMode === 'stacked'
		? block.data.categories.map((category) =>
				block.data.series.reduce(
					(total, series) =>
						total + (series.values.find((datum) => datum.categoryId === category.id)?.value ?? 0),
					0
				)
			)
		: block.data.series.flatMap((series) => series.values.map((datum) => datum.value));
}

export function createChartFactualDomain(
	block: BarColumnChartBlock,
	layoutMode: ChartLayoutMode = block.layout.mode
): ChartDomain {
	const values = chartAuthoringDomainValues(block, layoutMode);
	return { min: Math.min(0, ...values), max: Math.max(1, ...values) };
}

export function chartDomainIncludesFactualValues(
	block: BarColumnChartBlock,
	domain: ChartDomain | undefined,
	layoutMode: ChartLayoutMode = block.layout.mode
): boolean {
	if (!domain) return true;
	if (
		(domain.min !== undefined && (!Number.isFinite(domain.min) || domain.min > 0)) ||
		(domain.max !== undefined && (!Number.isFinite(domain.max) || domain.max < 0)) ||
		(domain.min !== undefined && domain.max !== undefined && domain.min >= domain.max)
	)
		return false;
	return chartAuthoringDomainValues(block, layoutMode).every(
		(value) =>
			Number.isFinite(value) &&
			(domain.min === undefined || value >= domain.min) &&
			(domain.max === undefined || value <= domain.max)
	);
}

function repairChartCalloutFormatters(block: ChartBlock): void {
	for (const callout of block.callouts ?? []) {
		if (callout.valueLabel.kind === 'value') continue;
		const resolved = resolveChartDataTarget(block, callout.target);
		const ratio = resolved.value / resolved.seriesTotal;
		if (
			resolved.seriesTotal <= 0 ||
			(callout.valueLabel.kind === 'approximate-fraction-and-percent' && (ratio <= 0 || ratio > 1))
		) {
			callout.valueLabel = { kind: 'value' };
		}
	}
}

export function setChartLayoutMode(block: ChartBlock, layoutMode: ChartLayoutMode): boolean {
	if (block.type !== 'bar-chart' && block.type !== 'column-chart') return false;
	if (
		(layoutMode === 'single' && block.data.series.length !== 1) ||
		(layoutMode !== 'single' && block.data.series.length < 2) ||
		(layoutMode === 'stacked' &&
			block.data.series.some((series) => series.values.some((datum) => datum.value < 0))) ||
		!chartDomainIncludesFactualValues(block, block.domain, layoutMode)
	)
		return false;
	block.layout.mode = layoutMode;
	return true;
}

export function setChartNormalizationTotal(block: ChartBlock, total: number): boolean {
	if (
		(block.type !== 'unit-grid-chart' && block.type !== 'dot-field-chart') ||
		!Number.isFinite(total) ||
		total <= 0
	)
		return false;
	const factualTotal = block.data.series[0].values.reduce((sum, datum) => sum + datum.value, 0);
	const tolerance = Math.max(1e-9, Math.abs(total) * 1e-9);
	if (!Number.isFinite(factualTotal) || Math.abs(factualTotal - total) > tolerance) return false;
	block.normalization.total = total;
	return true;
}

export function setChartDatumValue(
	block: ChartBlock,
	seriesId: string,
	categoryId: string,
	value: number
): boolean {
	if (!Number.isFinite(value)) return false;
	if (
		(block.type === 'unit-grid-chart' ||
			block.type === 'dot-field-chart' ||
			((block.type === 'bar-chart' || block.type === 'column-chart') &&
				block.layout.mode === 'stacked')) &&
		value < 0
	)
		return false;
	if (
		(block.type === 'bar-chart' || block.type === 'column-chart') &&
		((block.domain?.min !== undefined && value < block.domain.min) ||
			(block.domain?.max !== undefined && value > block.domain.max))
	)
		return false;
	const datum = block.data.series
		.find((series) => series.id === seriesId)
		?.values.find((entry) => entry.categoryId === categoryId);
	if (!datum) return false;
	const previous = datum.value;
	datum.value = value;
	if (
		!recomputeNormalizedTotal(block) ||
		((block.type === 'bar-chart' || block.type === 'column-chart') &&
			!chartDomainIncludesFactualValues(block, block.domain))
	) {
		datum.value = previous;
		if (block.type === 'unit-grid-chart' || block.type === 'dot-field-chart') {
			block.normalization.total = block.data.series[0].values.reduce(
				(sum, entry) => sum + entry.value,
				0
			);
		}
		return false;
	}
	repairChartCalloutFormatters(block);
	return true;
}

export function updateChartMotionPhase(
	surface: SurfaceState,
	blockId: string,
	phaseName: keyof ChartMotion,
	start: number,
	duration: number
): boolean {
	const items = surface.chart?.items;
	const blockIndex = items?.findIndex((item) => item.id === blockId) ?? -1;
	const phaseIndex = CHART_MOTION_PHASE_NAMES.indexOf(phaseName);
	if (!items || blockIndex < 0 || phaseIndex < 0) return false;
	const block = items[blockIndex];
	const previousPhase =
		phaseIndex > 0 ? block.motion[CHART_MOTION_PHASE_NAMES[phaseIndex - 1]] : null;
	const nextPhase =
		phaseIndex < CHART_MOTION_PHASE_NAMES.length - 1
			? block.motion[CHART_MOTION_PHASE_NAMES[phaseIndex + 1]]
			: null;
	const previousItem = blockIndex > 0 ? items[blockIndex - 1] : null;
	const nextItem = blockIndex < items.length - 1 ? items[blockIndex + 1] : null;
	const minimumStart = Math.max(
		0,
		previousPhase ? previousPhase.start + previousPhase.duration : 0,
		phaseIndex === 0 && previousItem
			? previousItem.motion.exit.start + previousItem.motion.exit.duration
			: 0
	);
	const maximumEnd = Math.min(
		1,
		nextPhase ? nextPhase.start : 1,
		phaseName === 'exit' && nextItem ? nextItem.motion.entry.start : 1
	);
	if (
		!Number.isFinite(start) ||
		!Number.isFinite(duration) ||
		duration <= 0 ||
		start + CHART_TIMING_EPSILON < minimumStart ||
		start + duration > maximumEnd + CHART_TIMING_EPSILON
	)
		return false;
	block.motion[phaseName].start = start;
	block.motion[phaseName].duration = duration;
	return true;
}

export function createChartTarget(
	block: ChartBlock,
	kind: ChartTargetKind
): ChartDataTarget | null {
	const seriesId = block.data.series[0]?.id;
	const categoryId = block.data.categories[0]?.id;
	if (!seriesId || !categoryId) return null;
	if (kind === 'series-total') return { kind, seriesId };
	if (kind === 'category-set') {
		const categoryIds = block.data.categories.slice(0, 2).map((category) => category.id);
		return categoryIds.length === 2 ? { kind, seriesId, categoryIds } : null;
	}
	return { kind, seriesId, categoryId };
}

export function appendChartHighlight(block: ChartBlock): boolean {
	if (!block.highlights) block.highlights = [];
	if (block.highlights.length >= CHART_HIGHLIGHT_LIMIT) return false;
	const target = createChartTarget(block, 'datum');
	if (!target) return false;
	block.highlights.push({ target });
	return true;
}

export function appendChartCallout(block: ChartBlock): boolean {
	if (!block.callouts) block.callouts = [];
	if (block.callouts.length >= CHART_CALLOUT_LIMIT) return false;
	const target = createChartTarget(block, 'datum');
	if (!target) return false;
	block.callouts.push({ target, valueLabel: { kind: 'value' } });
	return true;
}
