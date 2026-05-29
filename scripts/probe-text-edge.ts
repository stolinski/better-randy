import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Reports text-edge sharpness metrics for a region of a PNG. Used by the
// Critic for R1 (text sharpness) and R2 (resampled content sharpness).
//   max_step       — largest single-pixel brightness delta in the region (0..1).
//                    High = crisp stroke edges. < 0.3 = fuzzy.
//   fringing_px    — average horizontal pixel separation between R/G/B
//                    high-contrast transitions. > 1 = visible chromatic
//                    fringing.
//   transition_count — number of high-contrast transitions detected (sanity
//                    check that the region actually contained text edges).

interface Args {
	png: string;
	region: { x: number; y: number; w: number; h: number };
}

function parseArgs(): Args {
	const [, , pngPath, regionFlag, regionValue] = process.argv;
	if (!pngPath || regionFlag !== '--region' || !regionValue) {
		console.error('usage: probe-text-edge.ts <png> --region x,y,w,h');
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

const luma = (r: number, g: number, b: number): number =>
	(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const STEP_THRESHOLD = 0.35;
const fringingSamples: number[] = [];
let maxStep = 0;
let transitionCount = 0;

for (let y = y0; y < y1; y++) {
	let lastLuma = -1;
	let lastTransitionX = -Infinity;
	for (let x = x0; x < x1; x++) {
		const idx = (y * png.width + x) * 4;
		const r = png.data[idx];
		const g = png.data[idx + 1];
		const b = png.data[idx + 2];
		const l = luma(r, g, b);

		if (lastLuma >= 0) {
			const step = Math.abs(l - lastLuma);
			if (step > maxStep) maxStep = step;

			if (step > STEP_THRESHOLD && x - lastTransitionX > 2) {
				transitionCount++;
				lastTransitionX = x;

				// Sniff RGB transition alignment by inspecting the prior and
				// current 5-px window per channel.
				const window = 5;
				const xStart = Math.max(x0, x - window);
				const xEnd = Math.min(x1 - 1, x + window);
				const rChange = findChannelTransition(xStart, xEnd, y, 0);
				const gChange = findChannelTransition(xStart, xEnd, y, 1);
				const bChange = findChannelTransition(xStart, xEnd, y, 2);
				if (rChange >= 0 && gChange >= 0 && bChange >= 0) {
					const spread =
						Math.max(rChange, gChange, bChange) -
						Math.min(rChange, gChange, bChange);
					fringingSamples.push(spread);
				}
			}
		}
		lastLuma = l;
	}
}

function findChannelTransition(
	xStart: number,
	xEnd: number,
	y: number,
	channel: 0 | 1 | 2
): number {
	let bestDelta = 0;
	let bestX = -1;
	for (let x = xStart + 1; x <= xEnd; x++) {
		const idxPrev = (y * png.width + (x - 1)) * 4 + channel;
		const idxCurr = (y * png.width + x) * 4 + channel;
		const delta = Math.abs(png.data[idxCurr] - png.data[idxPrev]);
		if (delta > bestDelta) {
			bestDelta = delta;
			bestX = x;
		}
	}
	return bestX;
}

const avgFringing =
	fringingSamples.length > 0
		? fringingSamples.reduce((s, v) => s + v, 0) / fringingSamples.length
		: 0;

console.log(
	JSON.stringify({
		max_step: Number(maxStep.toFixed(4)),
		fringing_px: Number(avgFringing.toFixed(2)),
		transition_count: transitionCount
	})
);
