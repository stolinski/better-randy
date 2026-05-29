// One-off probe: measure the average darkness of ink pixels in a region.
// Used by the Critic to estimate body alpha (the ink color is #1a1a1a;
// against paper #fafaf7, the rendered ink luma is roughly the fade-through alpha).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
}

const [, , inputPath, regionFlag, regionValue] = process.argv;
if (!inputPath || regionFlag !== '--region' || !regionValue) {
	console.error('usage: probe-ink-darkness.ts <png> --region x,y,w,h');
	process.exit(2);
}

const [x, y, w, h] = regionValue.split(',').map((part) => Number(part));
const region: Region = { x, y, w, h };

const bytes = await readFile(resolve(process.cwd(), inputPath));
const png = PNG.sync.read(bytes);

const x0 = Math.max(0, region.x);
const y0 = Math.max(0, region.y);
const x1 = Math.min(png.width, region.x + region.w);
const y1 = Math.min(png.height, region.y + region.h);

// Find pixels that are dark ink (luma < 100) and average their luma.
// Also count total pixels and find darkest pixel.
let inkCount = 0;
let inkLumaSum = 0;
let darkest = 255;
let totalLuma = 0;
let totalPx = 0;
for (let yy = y0; yy < y1; yy++) {
	for (let xx = x0; xx < x1; xx++) {
		const i = (yy * png.width + xx) * 4;
		const r = png.data[i],
			g = png.data[i + 1],
			b = png.data[i + 2];
		const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		totalLuma += luma;
		totalPx++;
		if (luma < 130) {
			inkCount++;
			inkLumaSum += luma;
			if (luma < darkest) darkest = luma;
		}
	}
}
console.log(
	JSON.stringify({
		region,
		totalPx,
		inkCount,
		inkFraction: inkCount / Math.max(1, totalPx),
		avgInkLuma: inkCount > 0 ? Math.round(inkLumaSum / inkCount) : null,
		darkestLuma: darkest,
		avgAllLuma: Math.round(totalLuma / Math.max(1, totalPx)),
	})
);
