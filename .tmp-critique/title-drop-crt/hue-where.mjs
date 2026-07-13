// hue-where.mjs <png> <hueLo> <hueHi> — spatial stats of saturated pixels in a hue range.
// Reports count, bbox, centroid, and a 8x4 grid histogram to show clustering.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [src, los, his] = process.argv.slice(2);
const img = PNG.sync.read(readFileSync(src));
const LO = +los, HI = +his;

const toHsl = (r, g, b) => {
	const rn = r / 255, gn = g / 255, bn = b / 255;
	const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return { h: 0, s: 0, l };
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
	else if (max === gn) h = ((bn - rn) / d + 2) * 60;
	else h = ((rn - gn) / d + 4) * 60;
	return { h, s, l };
};

let count = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, cx = 0, cy = 0;
const grid = Array.from({ length: 4 }, () => new Array(8).fill(0));
for (let y = 0; y < img.height; y++)
	for (let x = 0; x < img.width; x++) {
		const i = (y * img.width + x) * 4;
		const { h, s, l } = toHsl(img.data[i], img.data[i + 1], img.data[i + 2]);
		if (s > 0.4 && l >= 0.15 && l <= 0.85 && h >= LO && h < HI) {
			count++;
			cx += x; cy += y;
			if (x < x0) x0 = x; if (x > x1) x1 = x;
			if (y < y0) y0 = y; if (y > y1) y1 = y;
			grid[Math.min(3, Math.floor((y / img.height) * 4))][Math.min(7, Math.floor((x / img.width) * 8))]++;
		}
	}
console.log(JSON.stringify({
	hueRange: [LO, HI], count,
	bbox: count ? { x0, y0, x1, y1 } : null,
	centroid: count ? { x: Math.round(cx / count), y: Math.round(cy / count) } : null,
	grid
}));
