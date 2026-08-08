import { d } from 'typegpu';

import type { ResolvedChartMarkFill } from '$lib/platform/packs/resolve';

export interface ChartMarkFillPoint {
	x: number;
	y: number;
}

export interface ChartMarkFillSampleInput {
	localUv: ChartMarkFillPoint;
	localPx: ChartMarkFillPoint;
	canvasWidth: number;
	canvasHeight: number;
	maskAlpha: number;
	terminalCoverage: number;
	emphasisProgress: number;
	seriesIndex: number;
}

export type ChartPremultipliedRgba = readonly [number, number, number, number];

export const ChartMarkFillUniforms = d.struct({
	baseColorA: d.vec4f,
	baseColorB: d.vec4f,
	emphasisColorA: d.vec4f,
	emphasisColorB: d.vec4f,
	canvasSize: d.vec2f,
	baseMode: d.u32,
	baseGradientAxis: d.u32,
	baseMatrixBits: d.u32,
	baseCellPx: d.f32,
	emphasisMode: d.u32,
	emphasisGradientAxis: d.u32,
	emphasisMatrixBits: d.u32,
	emphasisCellPx: d.f32
});

const CHART_FILL_MODE_INDEX: Record<ResolvedChartMarkFill['mode'], number> = {
	solid: 0,
	gradient: 1,
	'ordered-dither': 2
};

const CHART_GRADIENT_AXIS_INDEX: Record<ResolvedChartMarkFill['gradientAxis'], number> = {
	inline: 0,
	block: 1
};

const CHART_MATRIX_BITS: Record<ResolvedChartMarkFill['matrix'], number> = {
	'2x2': 1,
	'4x4': 2,
	'8x8': 3
};

export interface PackedChartMarkFillUniforms {
	baseColorA: ReturnType<typeof d.vec4f>;
	baseColorB: ReturnType<typeof d.vec4f>;
	emphasisColorA: ReturnType<typeof d.vec4f>;
	emphasisColorB: ReturnType<typeof d.vec4f>;
	canvasSize: ReturnType<typeof d.vec2f>;
	baseMode: number;
	baseGradientAxis: number;
	baseMatrixBits: number;
	baseCellPx: number;
	emphasisMode: number;
	emphasisGradientAxis: number;
	emphasisMatrixBits: number;
	emphasisCellPx: number;
}

export function packChartMarkFillUniforms(
	base: ResolvedChartMarkFill,
	emphasis: ResolvedChartMarkFill,
	canvasWidth: number,
	canvasHeight: number
): PackedChartMarkFillUniforms {
	if (
		!(canvasWidth > 0) ||
		!(canvasHeight > 0) ||
		!Number.isFinite(canvasWidth) ||
		!Number.isFinite(canvasHeight)
	) {
		throw new RangeError(
			'packChartMarkFillUniforms: canvas dimensions must be positive and finite.'
		);
	}
	return {
		baseColorA: d.vec4f(...base.colorA),
		baseColorB: d.vec4f(...base.colorB),
		emphasisColorA: d.vec4f(...emphasis.colorA),
		emphasisColorB: d.vec4f(...emphasis.colorB),
		canvasSize: d.vec2f(canvasWidth, canvasHeight),
		baseMode: CHART_FILL_MODE_INDEX[base.mode],
		baseGradientAxis: CHART_GRADIENT_AXIS_INDEX[base.gradientAxis],
		baseMatrixBits: CHART_MATRIX_BITS[base.matrix],
		baseCellPx: base.cellPx,
		emphasisMode: CHART_FILL_MODE_INDEX[emphasis.mode],
		emphasisGradientAxis: CHART_GRADIENT_AXIS_INDEX[emphasis.gradientAxis],
		emphasisMatrixBits: CHART_MATRIX_BITS[emphasis.matrix],
		emphasisCellPx: emphasis.cellPx
	};
}

function requireUnitInterval(value: number, name: string): number {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`requireUnitInterval: ${name} must be finite and inside [0, 1].`);
	}
	return value;
}

function requireFinitePoint(point: ChartMarkFillPoint, name: string): void {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
		throw new RangeError(`requireFinitePoint: ${name} must contain finite coordinates.`);
	}
}

function chartMatrixSize(matrix: ResolvedChartMarkFill['matrix']): number {
	return 1 << CHART_MATRIX_BITS[matrix];
}

/** Classic ordered Bayer rank, locally phased only by the deterministic series index. */
export function chartOrderedDitherRank(
	matrix: ResolvedChartMarkFill['matrix'],
	cellX: number,
	cellY: number,
	seriesIndex: number
): number {
	if (![cellX, cellY, seriesIndex].every(Number.isSafeInteger) || seriesIndex < 0) {
		throw new RangeError(
			'chartOrderedDitherRank: coordinates and series index must be safe integers.'
		);
	}
	const bits = CHART_MATRIX_BITS[matrix];
	const size = 1 << bits;
	const wrappedX = (((cellX + seriesIndex) % size) + size) % size;
	const wrappedY = (((cellY + seriesIndex * 3) % size) + size) % size;
	let rank = 0;
	for (let bit = 0; bit < bits; bit += 1) {
		const x = (wrappedX >> bit) & 1;
		const y = (wrappedY >> bit) & 1;
		rank = (rank << 2) | (2 * (x ^ y) + y);
	}
	return rank;
}

function mixNumber(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function toPremultiplied(color: readonly [number, number, number, number]): ChartPremultipliedRgba {
	return [color[0] * color[3], color[1] * color[3], color[2] * color[3], color[3]];
}

function samplePremultipliedTreatment(
	treatment: ResolvedChartMarkFill,
	input: ChartMarkFillSampleInput
): ChartPremultipliedRgba {
	const colorA = toPremultiplied(treatment.colorA);
	const colorB = toPremultiplied(treatment.colorB);
	if (treatment.mode === 'solid') return colorA;
	if (treatment.mode === 'gradient') {
		const coordinate = treatment.gradientAxis === 'inline' ? input.localUv.x : input.localUv.y;
		const progress = Math.max(0, Math.min(coordinate, 1));
		return [
			mixNumber(colorA[0], colorB[0], progress),
			mixNumber(colorA[1], colorB[1], progress),
			mixNumber(colorA[2], colorB[2], progress),
			mixNumber(colorA[3], colorB[3], progress)
		];
	}
	const referenceScale = Math.min(input.canvasWidth, input.canvasHeight) / 2160;
	const cellSize = treatment.cellPx * referenceScale;
	const cellX = Math.floor(input.localPx.x / cellSize);
	const cellY = Math.floor(input.localPx.y / cellSize);
	const size = chartMatrixSize(treatment.matrix);
	const threshold =
		(chartOrderedDitherRank(treatment.matrix, cellX, cellY, input.seriesIndex) + 0.5) /
		(size * size);
	return threshold < 0.5 ? colorA : colorB;
}
function terminalCoverageGate(
	base: ResolvedChartMarkFill,
	input: ChartMarkFillSampleInput
): number {
	if (input.terminalCoverage === 1) return 1;
	if (input.terminalCoverage === 0) return 0;
	const referenceScale = Math.min(input.canvasWidth, input.canvasHeight) / 2160;
	const cellSize = base.cellPx * referenceScale;
	const cellX = Math.floor(input.localPx.x / cellSize);
	const cellY = Math.floor(input.localPx.y / cellSize);
	const size = chartMatrixSize(base.matrix);
	const threshold =
		(chartOrderedDitherRank(base.matrix, cellX, cellY, input.seriesIndex) + 0.5) / (size * size);
	return threshold < input.terminalCoverage ? 1 : 0;
}

export function sampleChartMarkFillReference(
	base: ResolvedChartMarkFill,
	emphasis: ResolvedChartMarkFill,
	input: ChartMarkFillSampleInput
): ChartPremultipliedRgba {
	requireFinitePoint(input.localUv, 'Chart mark local UV');
	requireFinitePoint(input.localPx, 'Chart mark local pixel coordinate');
	if (
		!(input.canvasWidth > 0) ||
		!(input.canvasHeight > 0) ||
		!Number.isFinite(input.canvasWidth) ||
		!Number.isFinite(input.canvasHeight)
	) {
		throw new RangeError(
			'sampleChartMarkFillReference: canvas dimensions must be positive and finite.'
		);
	}
	if (!Number.isSafeInteger(input.seriesIndex) || input.seriesIndex < 0) {
		throw new RangeError(
			'sampleChartMarkFillReference: series index must be a non-negative safe integer.'
		);
	}
	const maskAlpha = requireUnitInterval(input.maskAlpha, 'Chart mark mask alpha');
	const terminalCoverage = requireUnitInterval(input.terminalCoverage, 'Chart terminal coverage');
	const emphasisProgress = requireUnitInterval(input.emphasisProgress, 'Chart emphasis progress');
	const normalizedInput = { ...input, maskAlpha, terminalCoverage, emphasisProgress };
	const basePremultiplied = samplePremultipliedTreatment(base, normalizedInput);
	const emphasisPremultiplied = samplePremultipliedTreatment(emphasis, normalizedInput);
	const coverage = maskAlpha * terminalCoverageGate(base, normalizedInput);
	return [
		mixNumber(basePremultiplied[0], emphasisPremultiplied[0], emphasisProgress) * coverage,
		mixNumber(basePremultiplied[1], emphasisPremultiplied[1], emphasisProgress) * coverage,
		mixNumber(basePremultiplied[2], emphasisPremultiplied[2], emphasisProgress) * coverage,
		mixNumber(basePremultiplied[3], emphasisPremultiplied[3], emphasisProgress) * coverage
	];
}

/**
 * Reusable mark-local WGSL functions. Later chart renderers provide local UV/pixels and their
 * analytic mark mask; this module never samples or transforms flattened chart/chrome pixels.
 */
export function createChartMarkFillWgsl(): string {
	return /* wgsl */ `
fn chartMarkBayerRank(bits: u32, rawCell: vec2i, seriesIndex: u32) -> u32 {
	let size = 1u << bits;
	let phase = vec2i(i32(seriesIndex), i32(seriesIndex * 3u));
	let cell = vec2u((rawCell + phase) & vec2i(i32(size - 1u)));
	var rank = 0u;
	for (var bit = 0u; bit < bits; bit = bit + 1u) {
		let x = (cell.x >> bit) & 1u;
		let y = (cell.y >> bit) & 1u;
		rank = (rank << 2u) | (2u * (x ^ y) + y);
	}
	return rank;
}

fn chartMarkTreatment(
	mode: u32,
	colorA: vec4f,
	colorB: vec4f,
	gradientAxis: u32,
	matrixBits: u32,
	cellPx: f32,
	localUv: vec2f,
	localPx: vec2f,
	canvasSize: vec2f,
	seriesIndex: u32
) -> vec4f {
	let premultipliedA = vec4f(colorA.rgb * colorA.a, colorA.a);
	let premultipliedB = vec4f(colorB.rgb * colorB.a, colorB.a);
	var premultiplied = premultipliedA;
	if (mode == 1u) {
		let axisProgress = select(localUv.x, localUv.y, gradientAxis == 1u);
		premultiplied = mix(premultipliedA, premultipliedB, clamp(axisProgress, 0.0, 1.0));
	} else if (mode == 2u) {
		let referenceScale = min(canvasSize.x, canvasSize.y) / 2160.0;
		let cell = vec2i(floor(localPx / (cellPx * referenceScale)));
		let size = 1u << matrixBits;
		let threshold = (f32(chartMarkBayerRank(matrixBits, cell, seriesIndex)) + 0.5) / f32(size * size);
		premultiplied = select(premultipliedB, premultipliedA, threshold < 0.5);
	}
	return premultiplied;
}

fn sampleChartMarkFill(
	base: vec4f,
	emphasis: vec4f,
	baseMatrixBits: u32,
	baseCellPx: f32,
	localPx: vec2f,
	canvasSize: vec2f,
	seriesIndex: u32,
	maskAlpha: f32,
	terminalCoverage: f32,
	emphasisProgress: f32
) -> vec4f {
	let referenceScale = min(canvasSize.x, canvasSize.y) / 2160.0;
	let cell = vec2i(floor(localPx / (baseCellPx * referenceScale)));
	let size = 1u << baseMatrixBits;
	let threshold = (f32(chartMarkBayerRank(baseMatrixBits, cell, seriesIndex)) + 0.5) / f32(size * size);
	let terminalGate = select(0.0, 1.0, threshold < clamp(terminalCoverage, 0.0, 1.0));
	let covered = clamp(maskAlpha, 0.0, 1.0) * terminalGate;
	return mix(base, emphasis, clamp(emphasisProgress, 0.0, 1.0)) * covered;
}

fn resolveChartMarkFillSample(
	baseMode: u32,
	baseColorA: vec4f,
	baseColorB: vec4f,
	baseGradientAxis: u32,
	baseMatrixBits: u32,
	baseCellPx: f32,
	emphasisMode: u32,
	emphasisColorA: vec4f,
	emphasisColorB: vec4f,
	emphasisGradientAxis: u32,
	emphasisMatrixBits: u32,
	emphasisCellPx: f32,
	localUv: vec2f,
	localPx: vec2f,
	canvasSize: vec2f,
	seriesIndex: u32,
	maskAlpha: f32,
	terminalCoverage: f32,
	emphasisProgress: f32
) -> vec4f {
	let base = chartMarkTreatment(
		baseMode, baseColorA, baseColorB, baseGradientAxis, baseMatrixBits,
		baseCellPx, localUv, localPx, canvasSize, seriesIndex
	);
	let emphasis = chartMarkTreatment(
		emphasisMode, emphasisColorA, emphasisColorB, emphasisGradientAxis,
		emphasisMatrixBits, emphasisCellPx, localUv, localPx, canvasSize, seriesIndex
	);
	return sampleChartMarkFill(
		base, emphasis, baseMatrixBits, baseCellPx, localPx, canvasSize,
		seriesIndex, maskAlpha, terminalCoverage, emphasisProgress
	);
}
`;
}
