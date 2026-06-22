import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

import { parseChannelFlag, resolveChannel } from './_probe-channel.ts';

// Reports anti-aliasing metrics on diagonal / curved alpha edges. Used by
// the Critic for R4 (no aliasing on non-axis-aligned edges).
//   hard_stairsteps   — count of columns where the alpha transition is a
//                       single-pixel step (no fractional coverage).
//   smooth_pixels     — count of columns where the transition spans 2+ px
//                       with fractional coverage (the desired case).
//   coverage_ratio    — smooth_pixels / (hard_stairsteps + smooth_pixels).
//                       Closer to 1.0 = well anti-aliased.

interface Args {
	png: string;
	region: { x: number; y: number; w: number; h: number };
}

function parseArgs(): Args {
	const [, , pngPath, regionFlag, regionValue] = process.argv;
	if (!pngPath || regionFlag !== '--region' || !regionValue) {
		console.error('usage: probe-edge-aa.ts <png> --region x,y,w,h');
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

// Measure edges on alpha (transparent overlays) or luma (opaque pieces, where
// the edge is a bright glyph/shape on a darker field); auto-detected unless
// `--channel` forces it. LOW/HIGH are coverage thresholds on the chosen channel.
const { channel, sample } = resolveChannel(
	png,
	{ x0, y0, x1, y1 },
	parseChannelFlag(process.argv)
);

const LOW = 32;
const HIGH = 224;

let hardSteps = 0;
let smoothPixels = 0;

for (let x = x0; x < x1; x++) {
	let firstFractional = -1;
	let firstFull = -1;
	let firstEmpty = -1;
	for (let y = y0; y < y1; y++) {
		const a = sample(x, y);
		if (a < LOW && firstEmpty < 0) firstEmpty = y;
		if (a > LOW && a < HIGH && firstFractional < 0) firstFractional = y;
		if (a >= HIGH && firstFull < 0) firstFull = y;
		if (firstEmpty >= 0 && firstFractional >= 0 && firstFull >= 0) break;
	}
	const sawEdge = firstFull >= 0 && firstEmpty >= 0;
	if (!sawEdge) continue;

	if (firstFractional >= 0 && firstFull > firstFractional) {
		smoothPixels++;
	} else if (firstFull >= 0) {
		hardSteps++;
	}
}

const total = hardSteps + smoothPixels;
const ratio = total === 0 ? null : smoothPixels / total;

console.log(
	JSON.stringify({
		channel,
		hard_stairsteps: hardSteps,
		smooth_pixels: smoothPixels,
		coverage_ratio: ratio === null ? null : Number(ratio.toFixed(3))
	})
);
