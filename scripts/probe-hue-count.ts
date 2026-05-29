import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Reports the number of distinct saturated hues in a frame. Used by the
// Critic for Q4 (palette restraint — ≤ 3 saturated hues at once).
//   saturated_hue_count — number of hue bins (12 bins of 30°) carrying
//                         > 0.5% of saturated pixels.
//   clusters            — array of { hue_deg_center, pixel_count } per bin
//                         that crossed the threshold, descending by count.
//
// "Saturated" means HSL saturation > 0.4 AND lightness in [0.15, 0.85]
// (excludes near-black and near-white from the hue count).
// Pass `--region x,y,w,h` to restrict to a sub-rect (e.g. the canvas
// area within a viewport screenshot that includes workspace UI chrome).

interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
}

function parseArgs(): { png: string; region: Region | null } {
	const [, , inputPath, ...rest] = process.argv;
	if (!inputPath) {
		console.error('usage: probe-hue-count.ts <png> [--region x,y,w,h]');
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
	return { png: resolve(process.cwd(), inputPath), region };
}

const { png: pngPath, region } = parseArgs();
const bytes = await readFile(pngPath);
const png = PNG.sync.read(bytes);

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
	else if (max === gn) h = ((bn - rn) / d + 2) * 60;
	else h = ((rn - gn) / d + 4) * 60;
	return { h, s, l };
}

const BIN_COUNT = 12; // 30° per bin
const bins = new Array<number>(BIN_COUNT).fill(0);
let saturatedTotal = 0;

const x0 = region ? Math.max(0, region.x) : 0;
const y0 = region ? Math.max(0, region.y) : 0;
const x1 = region ? Math.min(png.width, region.x + region.w) : png.width;
const y1 = region ? Math.min(png.height, region.y + region.h) : png.height;

for (let y = y0; y < y1; y++) {
	for (let x = x0; x < x1; x++) {
		const i = (y * png.width + x) * 4;
		const a = png.data[i + 3];
		if (a < 32) continue;
		const { h, s, l } = rgbToHsl(png.data[i], png.data[i + 1], png.data[i + 2]);
		if (s < 0.4 || l < 0.15 || l > 0.85) continue;
		const bin = Math.floor((h / 360) * BIN_COUNT) % BIN_COUNT;
		bins[bin]++;
		saturatedTotal++;
	}
}

const threshold = saturatedTotal * 0.005;
const clusters: { hue_deg_center: number; pixel_count: number }[] = [];
for (let i = 0; i < BIN_COUNT; i++) {
	if (bins[i] > threshold) {
		clusters.push({ hue_deg_center: i * 30 + 15, pixel_count: bins[i] });
	}
}
clusters.sort((a, b) => b.pixel_count - a.pixel_count);

console.log(
	JSON.stringify({
		saturated_hue_count: clusters.length,
		clusters
	})
);
