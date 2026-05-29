import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Reports banding metrics for a region of a PNG. Used by the Critic for
// R3 (shadow falloff) and R5 (tonal banding).
//   max_step          — largest alpha delta between horizontally-adjacent
//                       pixels in the region (0..1). Low = continuous gaussian;
//                       high = visible steps or hard rim.
//   band_count        — number of distinct alpha plateaus (≥3-pixel runs of
//                       the same alpha bucket) along scan lines.
//   transition_span_px — average pixel distance from alpha 0.9 → 0.1 across
//                       scan lines. Larger span = softer falloff.

interface Args {
	png: string;
	region: { x: number; y: number; w: number; h: number };
}

function parseArgs(): Args {
	const [, , pngPath, regionFlag, regionValue] = process.argv;
	if (!pngPath || regionFlag !== '--region' || !regionValue) {
		console.error('usage: probe-banding.ts <png> --region x,y,w,h');
		process.exit(2);
	}
	const [x, y, w, h] = regionValue.split(',').map((part) => Number(part));
	if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
		console.error(`invalid region "${regionValue}"`);
		process.exit(2);
	}
	return { png: resolve(process.cwd(), pngPath), region: { x, y, w, h } };
}

const { png: pngPath, region } = parseArgs();
const bytes = await readFile(pngPath);
const png = PNG.sync.read(bytes);

const x0 = Math.max(0, region.x);
const y0 = Math.max(0, region.y);
const x1 = Math.min(png.width, region.x + region.w);
const y1 = Math.min(png.height, region.y + region.h);

let maxStep = 0;
let totalPlateaus = 0;
const transitionSpans: number[] = [];

const bucket = (a: number): number => Math.round((a / 255) * 32); // 32 buckets

for (let y = y0; y < y1; y++) {
	let runBucket = -1;
	let runLength = 0;
	let plateausInRow = 0;
	let highX = -1;
	let lowX = -1;
	let lastAlpha = -1;

	for (let x = x0; x < x1; x++) {
		const idx = (y * png.width + x) * 4 + 3;
		const alpha = png.data[idx];
		const b = bucket(alpha);

		if (lastAlpha >= 0) {
			const step = Math.abs(alpha - lastAlpha) / 255;
			if (step > maxStep) maxStep = step;
		}
		lastAlpha = alpha;

		if (b === runBucket) {
			runLength++;
		} else {
			if (runLength >= 3) plateausInRow++;
			runBucket = b;
			runLength = 1;
		}

		const alphaNorm = alpha / 255;
		if (highX < 0 && alphaNorm <= 0.9) highX = x;
		if (highX >= 0 && lowX < 0 && alphaNorm <= 0.1) lowX = x;
	}
	if (runLength >= 3) plateausInRow++;
	totalPlateaus += plateausInRow;

	if (highX >= 0 && lowX >= 0) transitionSpans.push(lowX - highX);
}

const rowCount = Math.max(1, y1 - y0);
const avgPlateaus = totalPlateaus / rowCount;
const avgSpan =
	transitionSpans.length > 0
		? transitionSpans.reduce((s, v) => s + v, 0) / transitionSpans.length
		: null;

console.log(
	JSON.stringify({
		max_step: Number(maxStep.toFixed(4)),
		band_count: Number(avgPlateaus.toFixed(2)),
		transition_span_px: avgSpan === null ? null : Number(avgSpan.toFixed(1))
	})
);
