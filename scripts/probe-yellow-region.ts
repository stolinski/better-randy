import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Sample the yellow-highlight pixels in a region, return count & average RGB.
// Used by the Critic to verify marks-coupling: highlight saturation should
// be measurably lower while the body alpha is still ramping.

interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
}

function parseArgs(): { png: string; region: Region } {
	const [, , inputPath, ...rest] = process.argv;
	if (!inputPath) {
		console.error('usage: probe-yellow-region.ts <png> --region x,y,w,h');
		process.exit(2);
	}
	let region: Region | null = null;
	for (let i = 0; i < rest.length; i++) {
		if (rest[i] === '--region') {
			const value = rest[i + 1];
			if (!value) {
				console.error('--region requires x,y,w,h');
				process.exit(2);
			}
			const [x, y, w, h] = value.split(',').map((part) => Number(part));
			if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
				console.error(`invalid region "${value}"`);
				process.exit(2);
			}
			region = { x, y, w, h };
			i++;
		}
	}
	if (!region) {
		console.error('--region required');
		process.exit(2);
	}
	return { png: resolve(process.cwd(), inputPath), region };
}

const { png: pngPath, region } = parseArgs();
const bytes = await readFile(pngPath);
const png = PNG.sync.read(bytes);

const x0 = Math.max(0, region.x);
const y0 = Math.max(0, region.y);
const x1 = Math.min(png.width, region.x + region.w);
const y1 = Math.min(png.height, region.y + region.h);

// Yellow #ffd642 = R=255 G=214 B=66. Allow softened pixels.
// Match: R>=180, G in [120, 255], B<=160, R>=G, G>=B+30
let yellowCount = 0;
let sumR = 0,
	sumG = 0,
	sumB = 0;
let totalPixels = 0;
let maxY_G = 0;
for (let y = y0; y < y1; y++) {
	for (let x = x0; x < x1; x++) {
		const i = (y * png.width + x) * 4;
		const r = png.data[i],
			g = png.data[i + 1],
			b = png.data[i + 2];
		totalPixels++;
		if (r >= 180 && g >= 120 && b <= 160 && r >= g && g >= b + 30) {
			yellowCount++;
			sumR += r;
			sumG += g;
			sumB += b;
			if (g > maxY_G) maxY_G = g;
		}
	}
}

console.log(
	JSON.stringify({
		region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
		totalPixels,
		yellowCount,
		yellowFraction: yellowCount / Math.max(1, totalPixels),
		avgRGB: yellowCount > 0 ? [Math.round(sumR / yellowCount), Math.round(sumG / yellowCount), Math.round(sumB / yellowCount)] : null,
		maxGreen: maxY_G,
	})
);
