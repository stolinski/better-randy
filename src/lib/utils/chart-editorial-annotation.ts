import type { ChartValueLabel } from '$lib/platform/engine-schema';
import type { ChartResolvedDataTarget } from './chart-data-target';
import type {
	ChartLayoutOverflow,
	ChartPixelPoint,
	ChartPixelRect,
	ChartTextMeasurement
} from './chart-layout';
import type { VideoOrientation } from './video-frame';

export type ChartAnnotationLane =
	'local-above' | 'local-right' | 'local-below' | 'local-left' | 'editorial';
export interface ChartEditorialAnnotationInput {
	id: string;
	declarationIndex: number;
	anchor: ChartPixelPoint;
	text: string;
	measured: ChartTextMeasurement;
}
export interface ChartEditorialAnnotationLayout {
	id: string;
	text: string;
	box: ChartPixelRect;
	leaderFrom: ChartPixelPoint;
	leaderTo: ChartPixelPoint;
	lane: ChartAnnotationLane;
}

const ANNOTATION_GUTTER = 24;
const ANNOTATION_PADDING_X = 28;
const ANNOTATION_PADDING_Y = 20;

function canonicalChartNumber(value: number): string {
	if (!Number.isFinite(value))
		throw new RangeError('Chart value labels require a finite resolved value.');
	return Object.is(value, -0) ? '0' : String(value);
}

function formatChartPercent(ratio: number, precision: number): string {
	return `${(ratio * 100).toFixed(precision)}%`;
}

interface ChartExactRational {
	numerator: bigint;
	denominator: bigint;
}

function chartNumberAsExactRational(value: number): ChartExactRational {
	if (!Number.isFinite(value))
		throw new RangeError('Exact chart arithmetic requires finite values.');
	if (value === 0) return { numerator: 0n, denominator: 1n };
	const buffer = new ArrayBuffer(8);
	const view = new DataView(buffer);
	view.setFloat64(0, value, false);
	const bits = view.getBigUint64(0, false);
	const negative = bits >> 63n === 1n;
	const exponentBits = Number((bits >> 52n) & 0x7ffn);
	const fraction = bits & ((1n << 52n) - 1n);
	const significand = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
	const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;
	let numerator = negative ? -significand : significand;
	let denominator = 1n;
	if (exponent >= 0) numerator <<= BigInt(exponent);
	else denominator <<= BigInt(-exponent);
	return { numerator, denominator };
}

function absoluteBigInt(value: bigint): bigint {
	return value < 0n ? -value : value;
}

interface ChartFractionError {
	numerator: bigint;
	denominator: bigint;
}

function chartFractionError(
	value: ChartExactRational,
	total: ChartExactRational,
	numerator: number,
	denominator: number
): ChartFractionError {
	const candidateNumerator = BigInt(numerator);
	const candidateDenominator = BigInt(denominator);
	return {
		numerator: absoluteBigInt(
			value.numerator * total.denominator * candidateDenominator -
				candidateNumerator * value.denominator * total.numerator
		),
		denominator: value.denominator * total.numerator * candidateDenominator
	};
}

function compareChartFractionErrors(a: ChartFractionError, b: ChartFractionError): number {
	const left = a.numerator * b.denominator;
	const right = b.numerator * a.denominator;
	return left < right ? -1 : left > right ? 1 : 0;
}

export function formatChartValueLabel(
	resolved: ChartResolvedDataTarget,
	formatter: ChartValueLabel
): string {
	if (formatter.kind === 'value') return canonicalChartNumber(resolved.value);
	if (!(resolved.seriesTotal > 0))
		throw new RangeError('Chart percent labels require a positive series total.');
	const ratio = resolved.value / resolved.seriesTotal;
	if (!Number.isFinite(ratio)) throw new RangeError('Chart percent labels require a finite ratio.');
	if (formatter.kind === 'percent-of-series-total')
		return formatChartPercent(ratio, formatter.precision);
	if (!(ratio > 0 && ratio <= 1))
		throw new RangeError('Approximate fraction labels require a ratio in (0, 1].');
	const exactValue = chartNumberAsExactRational(resolved.value);
	const exactTotal = chartNumberAsExactRational(resolved.seriesTotal);
	let best = {
		numerator: 1,
		denominator: 1,
		error: chartFractionError(exactValue, exactTotal, 1, 1)
	};
	for (let denominator = 1; denominator <= formatter.maxDenominator; denominator += 1) {
		for (let numerator = 1; numerator <= denominator; numerator += 1) {
			const error = chartFractionError(exactValue, exactTotal, numerator, denominator);
			const comparison = compareChartFractionErrors(error, best.error);
			if (
				comparison < 0 ||
				(comparison === 0 &&
					(denominator < best.denominator ||
						(denominator === best.denominator && numerator < best.numerator)))
			) {
				best = { numerator, denominator, error };
			}
		}
	}
	return `${best.numerator} in ${best.denominator} · ${formatChartPercent(ratio, formatter.precision)}`;
}

function inflate(rect: ChartPixelRect, gutter: number): ChartPixelRect {
	return {
		x: rect.x - gutter,
		y: rect.y - gutter,
		width: rect.width + gutter * 2,
		height: rect.height + gutter * 2
	};
}

function intersects(a: ChartPixelRect, b: ChartPixelRect): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function containedBy(inner: ChartPixelRect, outer: ChartPixelRect): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

function nearestBoxPoint(anchor: ChartPixelPoint, box: ChartPixelRect): ChartPixelPoint {
	return {
		x: Math.max(box.x, Math.min(anchor.x, box.x + box.width)),
		y: Math.max(box.y, Math.min(anchor.y, box.y + box.height))
	};
}

function localCandidates(
	anchor: ChartPixelPoint,
	width: number,
	height: number
): readonly { lane: Exclude<ChartAnnotationLane, 'editorial'>; box: ChartPixelRect }[] {
	return [
		{
			lane: 'local-above',
			box: { x: anchor.x - width / 2, y: anchor.y - ANNOTATION_GUTTER - height, width, height }
		},
		{
			lane: 'local-right',
			box: { x: anchor.x + ANNOTATION_GUTTER, y: anchor.y - height / 2, width, height }
		},
		{
			lane: 'local-below',
			box: { x: anchor.x - width / 2, y: anchor.y + ANNOTATION_GUTTER, width, height }
		},
		{
			lane: 'local-left',
			box: { x: anchor.x - ANNOTATION_GUTTER - width, y: anchor.y - height / 2, width, height }
		}
	];
}

function editorialLaneSlots(input: {
	safeBounds: ChartPixelRect;
	plotBounds: ChartPixelRect;
	orientation: VideoOrientation;
	width: number;
	height: number;
}): readonly ChartPixelRect[] {
	const { safeBounds, plotBounds, orientation, width, height } = input;
	const slotsByLane: ChartPixelRect[][] = [[], [], []];
	const rightX = plotBounds.x + plotBounds.width + ANNOTATION_GUTTER;
	const rightWidth = safeBounds.x + safeBounds.width - rightX;
	if (width <= rightWidth) {
		for (
			let y = plotBounds.y;
			y + height <= safeBounds.y + safeBounds.height;
			y += height + ANNOTATION_GUTTER
		) {
			slotsByLane[0].push({ x: rightX + (rightWidth - width) / 2, y, width, height });
		}
	}
	const horizontalSlots = (y: number): ChartPixelRect[] => {
		const slots: ChartPixelRect[] = [];
		for (
			let x = plotBounds.x;
			x + width <= safeBounds.x + safeBounds.width;
			x += width + ANNOTATION_GUTTER
		) {
			slots.push({ x, y, width, height });
		}
		return slots;
	};
	const bottomY = plotBounds.y + plotBounds.height + ANNOTATION_GUTTER;
	if (bottomY + height <= safeBounds.y + safeBounds.height) {
		slotsByLane[1] = horizontalSlots(bottomY);
	}
	if (safeBounds.y + height + ANNOTATION_GUTTER <= plotBounds.y) {
		slotsByLane[2] = horizontalSlots(safeBounds.y);
	}
	const laneOrder = orientation === 'vertical' ? [0, 1, 2] : [0, 2, 1];
	return laneOrder.flatMap((laneIndex) => slotsByLane[laneIndex]);
}

function isFiniteChartPoint(point: ChartPixelPoint): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteChartRect(rect: ChartPixelRect): boolean {
	return (
		Number.isFinite(rect.x) &&
		Number.isFinite(rect.y) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height) &&
		rect.width >= 0 &&
		rect.height >= 0
	);
}
export function placeChartEditorialAnnotations(input: {
	annotations: readonly ChartEditorialAnnotationInput[];
	safeBounds: ChartPixelRect;
	plotBounds: ChartPixelRect;
	occupied: readonly ChartPixelRect[];
	orientation: VideoOrientation;
}): {
	layouts: readonly ChartEditorialAnnotationLayout[];
	overflow: readonly ChartLayoutOverflow[];
} {
	if (
		!isFiniteChartRect(input.safeBounds) ||
		!isFiniteChartRect(input.plotBounds) ||
		!containedBy(input.plotBounds, input.safeBounds) ||
		input.occupied.some((rect) => !isFiniteChartRect(rect))
	) {
		throw new RangeError(
			'Chart annotation placement requires finite non-negative rectangles and a safe-contained plot.'
		);
	}
	for (const annotation of input.annotations) {
		if (
			!isFiniteChartPoint(annotation.anchor) ||
			!Number.isSafeInteger(annotation.declarationIndex) ||
			annotation.declarationIndex < 0
		) {
			throw new RangeError(
				'Chart annotation anchors and declaration indices must be finite and deterministic.'
			);
		}
	}
	const ordered = [...input.annotations].sort(
		(a, b) => a.declarationIndex - b.declarationIndex || a.id.localeCompare(b.id, 'en')
	);
	const ids = new Set<string>();
	const layouts: ChartEditorialAnnotationLayout[] = [];
	const overflow: ChartLayoutOverflow[] = [];
	const occupied = [...input.occupied];
	for (const annotation of ordered) {
		if (ids.has(annotation.id))
			throw new Error(`Chart editorial annotation id "${annotation.id}" is duplicated.`);
		ids.add(annotation.id);
		if (
			!Number.isFinite(annotation.measured.width) ||
			!Number.isFinite(annotation.measured.height) ||
			annotation.measured.width < 0 ||
			annotation.measured.height <= 0
		) {
			overflow.push({
				code: 'invalid-measurement',
				message:
					'Chart annotation measurement must be finite with non-negative width and positive height.',
				itemId: annotation.id
			});
			continue;
		}
		const width = annotation.measured.width + ANNOTATION_PADDING_X * 2;
		const height = annotation.measured.height + ANNOTATION_PADDING_Y * 2;
		const candidates: readonly { lane: ChartAnnotationLane; box: ChartPixelRect }[] = [
			...localCandidates(annotation.anchor, width, height),
			...editorialLaneSlots({
				safeBounds: input.safeBounds,
				plotBounds: input.plotBounds,
				orientation: input.orientation,
				width,
				height
			}).map((box) => ({ lane: 'editorial' as const, box }))
		];
		const selected = candidates.find(
			({ box }) =>
				containedBy(box, input.safeBounds) &&
				occupied.every((taken) => !intersects(inflate(box, ANNOTATION_GUTTER), taken))
		);
		if (!selected) {
			overflow.push({
				code: 'annotation-no-space',
				message: `No collision-free editorial lane remains for annotation "${annotation.id}".`,
				itemId: annotation.id
			});
			continue;
		}
		const leaderTo = nearestBoxPoint(annotation.anchor, selected.box);
		layouts.push({
			id: annotation.id,
			text: annotation.text,
			box: selected.box,
			leaderFrom: annotation.anchor,
			leaderTo,
			lane: selected.lane
		});
		occupied.push(selected.box);
	}
	return { layouts, overflow };
}
