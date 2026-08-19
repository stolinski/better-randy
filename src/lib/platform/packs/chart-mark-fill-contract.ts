import type { ChartFill } from '../engine-schema';

export type ChartMarkFillMode = 'solid' | 'gradient' | 'ordered-dither';
export type ChartOrderedDitherMatrix = '2x2' | '4x4' | '8x8';
export type ChartMarkGradientAxis = 'inline' | 'block';
export type ChartMarkFillRole = ChartFill['role'];

export const CHART_MARK_FILL_COLOR_ROLES = [
	'chart.mark',
	'chart.series-2',
	'chart.series-3',
	'chart.series-4',
	'chart.annotation',
	'chart.grid',
	'chart.axis',
	'chart.label',
	'accent-treatment',
	'ink-treatment',
	'fill-treatment',
	'field-treatment',
	'field-ink-treatment'
] as const;

export type ChartMarkFillColorRole = (typeof CHART_MARK_FILL_COLOR_ROLES)[number];

export interface ChartMarkFillRecipe {
	mode: ChartMarkFillMode;
	toRole?: ChartMarkFillColorRole;
	axis?: ChartMarkGradientAxis;
	matrix?: ChartOrderedDitherMatrix;
	cellPx?: number;
}

const CHART_MARK_FILL_ROLES = ['default', 'series', 'emphasis'] as const;
const CHART_MARK_FILL_MODES: readonly ChartMarkFillMode[] = ['solid', 'gradient', 'ordered-dither'];
const CHART_MARK_GRADIENT_AXES: readonly ChartMarkGradientAxis[] = ['inline', 'block'];
const CHART_ORDERED_DITHER_MATRICES: readonly ChartOrderedDitherMatrix[] = ['2x2', '4x4', '8x8'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isListedString<T extends string>(value: unknown, list: readonly T[]): value is T {
	return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function parseRecipeEntry(value: unknown): ChartMarkFillRecipe | null {
	if (!isRecord(value) || !isListedString(value.mode, CHART_MARK_FILL_MODES)) return null;
	const allowedKeys =
		value.mode === 'solid'
			? ['mode']
			: value.mode === 'gradient'
				? ['mode', 'toRole', 'axis']
				: ['mode', 'toRole', 'matrix', 'cellPx'];
	if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return null;
	if (value.mode !== 'solid' && !isListedString(value.toRole, CHART_MARK_FILL_COLOR_ROLES))
		return null;
	if (value.toRole !== undefined && !isListedString(value.toRole, CHART_MARK_FILL_COLOR_ROLES))
		return null;
	if (value.axis !== undefined && !isListedString(value.axis, CHART_MARK_GRADIENT_AXES))
		return null;
	if (value.matrix !== undefined && !isListedString(value.matrix, CHART_ORDERED_DITHER_MATRICES))
		return null;
	if (
		value.cellPx !== undefined &&
		(typeof value.cellPx !== 'number' ||
			!Number.isFinite(value.cellPx) ||
			!Number.isInteger(value.cellPx) ||
			value.cellPx < 2 ||
			value.cellPx > 32)
	)
		return null;
	return {
		mode: value.mode,
		toRole: value.toRole,
		axis: value.axis,
		matrix: value.matrix,
		cellPx: value.cellPx
	};
}

/** One strict parser shared by Pack admission and chart runtime resolution. */
export function readChartMarkFillRecipe(
	value: unknown,
	role: ChartMarkFillRole
): ChartMarkFillRecipe | null {
	if (!isRecord(value)) return null;
	const allowedRoot = new Set([...CHART_MARK_FILL_ROLES, 'seriesRoles']);
	if (Object.keys(value).some((key) => !allowedRoot.has(key))) return null;
	const seriesRoles = value.seriesRoles;
	if (
		!Array.isArray(seriesRoles) ||
		seriesRoles.length !== 4 ||
		new Set(seriesRoles).size !== 4 ||
		seriesRoles.some((candidate) => !isListedString(candidate, CHART_MARK_FILL_COLOR_ROLES))
	)
		return null;
	for (const semanticRole of CHART_MARK_FILL_ROLES) {
		const entry = value[semanticRole];
		if (entry !== undefined && parseRecipeEntry(entry) === null) return null;
	}
	const selected = value[role];
	return selected === undefined ? null : parseRecipeEntry(selected);
}

export function isChartMarkFillRoleValue(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		CHART_MARK_FILL_ROLES.every((role) => {
			const entry = value[role];
			return entry === undefined || readChartMarkFillRecipe(value, role) !== null;
		}) && readChartMarkFillRecipe(value, 'default') !== null
	);
}

export function readChartSeriesColorRole(
	value: unknown,
	seriesIndex: number
): ChartMarkFillColorRole | null {
	if (!isChartMarkFillRoleValue(value) || !isRecord(value)) return null;
	const seriesRoles = value.seriesRoles;
	if (!Array.isArray(seriesRoles)) return null;
	const role = seriesRoles[seriesIndex];
	return isListedString(role, CHART_MARK_FILL_COLOR_ROLES) ? role : null;
}
