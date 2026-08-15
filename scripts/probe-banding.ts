import { pathToFileURL } from 'node:url';

import { parseChannelFlag, resolveChannel } from './_probe-channel.ts';
import {
	getProbeBounds,
	loadProbePng,
	parseProbeArgs,
	type ProbeBounds,
	type ProbeRegion
} from './_probe-image.ts';

/** Two 8-bit levels is the fixed engine readback noise floor. */
export const SHADOW_DYNAMIC_RANGE_NOISE_FLOOR = 2 / 255;

export interface BandingFalloffMeasurement {
	maxStep: number;
	bandCount: number;
	transitionSpanPixels: number | null;
	transitionSampleCount: number;
	observedPeak: number | null;
	baseline: number | null;
	dynamicRange: number;
}

interface RelativeFalloffRun {
	baseline: number;
	observedPeak: number;
	dynamicRange: number;
	transition: readonly number[];
	span: number;
}

function contains(bounds: ProbeBounds | null, x: number, y: number): boolean {
	return Boolean(bounds && x >= bounds.x0 && x < bounds.x1 && y >= bounds.y0 && y < bounds.y1);
}

function endpointBaseline(values: readonly number[]): number {
	const endpointCount = Math.max(1, Math.min(4, Math.floor(values.length / 4)));
	const endpoints = [...values.slice(0, endpointCount), ...values.slice(-endpointCount)].sort(
		(left, right) => left - right
	);
	return endpoints[Math.floor(endpoints.length / 2)] / 255;
}

function resolveRelativeFalloff(values: readonly number[]): RelativeFalloffRun | null {
	if (values.length < 3) return null;
	const baseline = endpointBaseline(values);
	let peakIndex = 0;
	let dynamicRange = 0;
	for (let index = 0; index < values.length; index += 1) {
		const distance = Math.abs(values[index] / 255 - baseline);
		if (distance > dynamicRange) {
			dynamicRange = distance;
			peakIndex = index;
		}
	}
	if (dynamicRange < SHADOW_DYNAMIC_RANGE_NOISE_FLOOR) return null;
	const normalized = values.map((value) => Math.abs(value / 255 - baseline) / dynamicRange);
	const directions = [
		{ start: peakIndex, step: -1 },
		{ start: peakIndex, step: 1 }
	] as const;
	const candidates: RelativeFalloffRun[] = [];
	for (const direction of directions) {
		let highIndex = -1;
		let lowIndex = -1;
		for (
			let index = direction.start;
			index >= 0 && index < normalized.length;
			index += direction.step
		) {
			if (highIndex < 0 && normalized[index] >= 0.9) highIndex = index;
			if (highIndex >= 0 && normalized[index] <= 0.1) {
				lowIndex = index;
				break;
			}
		}
		if (highIndex < 0 || lowIndex < 0 || highIndex === lowIndex) continue;
		const from = Math.min(highIndex, lowIndex);
		const to = Math.max(highIndex, lowIndex);
		candidates.push({
			baseline,
			observedPeak: values[peakIndex] / 255,
			dynamicRange,
			transition: normalized.slice(from, to + 1),
			span: to - from
		});
	}
	return candidates.sort((left, right) => right.span - left.span)[0] ?? null;
}

/**
 * Measure shadow falloff relative to each scan's observed peak. Element-body
 * pixels and exterior peak/baseline flats are excluded from every statistic.
 */
export function measureBandingFalloff(
	bounds: ProbeBounds,
	sample: (x: number, y: number) => number,
	excludedBounds: ProbeBounds | null = null
): BandingFalloffMeasurement {
	let maximumRelativeStep = 0;
	let totalBands = 0;
	const runs: RelativeFalloffRun[] = [];

	function measureRun(values: readonly number[]): void {
		const run = resolveRelativeFalloff(values);
		if (!run) return;
		runs.push(run);
		for (let index = 1; index < run.transition.length; index += 1) {
			maximumRelativeStep = Math.max(
				maximumRelativeStep,
				Math.abs(run.transition[index] - run.transition[index - 1])
			);
		}
		const interior = run.transition.filter((value) => value > 0.1 && value < 0.9);
		let plateauLength = 1;
		for (let index = 1; index < interior.length; index += 1) {
			const step = Math.abs(interior[index] - interior[index - 1]);
			if (step <= 1 / 255) plateauLength += 1;
			else {
				if (plateauLength >= 3) totalBands += 1;
				plateauLength = 1;
			}
		}
		if (interior.length > 0 && plateauLength >= 3) totalBands += 1;
	}

	for (let y = bounds.y0; y < bounds.y1; y += 1) {
		let run: number[] = [];
		for (let x = bounds.x0; x < bounds.x1; x += 1) {
			if (contains(excludedBounds, x, y)) {
				measureRun(run);
				run = [];
			} else run.push(sample(x, y));
		}
		measureRun(run);
	}
	for (let x = bounds.x0; x < bounds.x1; x += 1) {
		let run: number[] = [];
		for (let y = bounds.y0; y < bounds.y1; y += 1) {
			if (contains(excludedBounds, x, y)) {
				measureRun(run);
				run = [];
			} else run.push(sample(x, y));
		}
		measureRun(run);
	}
	const average = (select: (run: RelativeFalloffRun) => number): number | null =>
		runs.length > 0 ? runs.reduce((sum, run) => sum + select(run), 0) / runs.length : null;
	return {
		maxStep: maximumRelativeStep,
		bandCount: runs.length > 0 ? totalBands / runs.length : 0,
		transitionSpanPixels: average((run) => run.span),
		transitionSampleCount: runs.length,
		observedPeak: average((run) => run.observedPeak),
		baseline: average((run) => run.baseline),
		dynamicRange: average((run) => run.dynamicRange) ?? 0
	};
}

function parseOptionalRegion(flag: string): ProbeRegion | null {
	const index = process.argv.indexOf(flag);
	if (index < 0) return null;
	const value = process.argv[index + 1];
	const [x, y, w, h] = (value ?? '').split(',').map(Number);
	if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
		throw new TypeError(`${flag} requires x,y,w,h`);
	}
	return { x, y, w, h };
}

async function main(): Promise<void> {
	const { pngPath, region } = parseProbeArgs({
		region: 'required',
		usage: 'usage: probe-banding.ts <png> --region x,y,w,h [--exclude-region x,y,w,h]'
	});
	const png = await loadProbePng(pngPath);
	const bounds = getProbeBounds(png, region);
	const excludedRegion = parseOptionalRegion('--exclude-region');
	const excludedBounds = excludedRegion ? getProbeBounds(png, excludedRegion) : null;
	const { channel, sample } = resolveChannel(png, bounds, parseChannelFlag(process.argv));
	const measurement = measureBandingFalloff(bounds, sample, excludedBounds);
	console.log(
		JSON.stringify({
			channel,
			observed_peak:
				measurement.observedPeak === null ? null : Number(measurement.observedPeak.toFixed(4)),
			baseline: measurement.baseline === null ? null : Number(measurement.baseline.toFixed(4)),
			dynamic_range: Number(measurement.dynamicRange.toFixed(4)),
			max_relative_step: Number(measurement.maxStep.toFixed(4)),
			band_count: Number(measurement.bandCount.toFixed(2)),
			transition_span_px:
				measurement.transitionSpanPixels === null
					? null
					: Number(measurement.transitionSpanPixels.toFixed(1)),
			transition_sample_count: measurement.transitionSampleCount
		})
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
