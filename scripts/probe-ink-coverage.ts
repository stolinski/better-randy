import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Reports the fraction of the frame occupied by non-transparent content.
// Used by the Critic for Q9 (≥ 30% of every frame is visually quiet, so
// ink_ratio must be ≤ 0.70).
//   ink_ratio    — pixels with alpha > 10% divided by total pixels.
//   quiet_ratio  — 1 - ink_ratio.
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
		console.error('usage: probe-ink-coverage.ts <png> [--region x,y,w,h]');
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

const x0 = region ? Math.max(0, region.x) : 0;
const y0 = region ? Math.max(0, region.y) : 0;
const x1 = region ? Math.min(png.width, region.x + region.w) : png.width;
const y1 = region ? Math.min(png.height, region.y + region.h) : png.height;

let inkPixels = 0;
let totalPixels = 0;
for (let y = y0; y < y1; y++) {
	for (let x = x0; x < x1; x++) {
		const idx = (y * png.width + x) * 4 + 3;
		if (png.data[idx] > 25) inkPixels++;
		totalPixels++;
	}
}

const inkRatio = totalPixels > 0 ? inkPixels / totalPixels : 0;
console.log(
	JSON.stringify({
		ink_ratio: Number(inkRatio.toFixed(4)),
		quiet_ratio: Number((1 - inkRatio).toFixed(4))
	})
);
