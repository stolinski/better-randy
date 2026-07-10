// Phase map: auto-locate the SEASON TWO kicker per frame (bright-pixel bbox in
// a search band), then run the dilated-mask avg-ink method with jitter and
// report worst-of-jitter per frame.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const B = '.tmp-baselines/show-open-in-focus-crt';
const FRAMES = [
	'p0.35',
	'p0.40',
	'p0.45',
	'p0.50',
	'p0.55',
	'p0.60',
	'p0.65',
	'p0.70',
	'p0.75',
	'p0.80',
	'p0.83'
];
// Search band around the kicker across the whole push drift.
const SEARCH = { x: 250, y: 1030, w: 700, h: 130 };
const LUMA_SEED = 90;
const JITTER = [
	[0, 0],
	[6, 0],
	[-6, 0],
	[0, 5],
	[0, -5]
];

for (const frame of FRAMES) {
	const img = PNG.sync.read(readFileSync(`${B}/${frame}.png`));
	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity;
	for (let y = SEARCH.y; y < SEARCH.y + SEARCH.h; y++)
		for (let x = SEARCH.x; x < SEARCH.x + SEARCH.w; x++) {
			const i = (y * img.width + x) * 4;
			const L = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
			if (L > LUMA_SEED) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	if (!isFinite(minX)) {
		console.log(`${frame}: no text found in band`);
		continue;
	}
	// Pad the bbox by 6px so ground surrounds the caps row symmetrically.
	const x = minX - 6,
		y = minY - 6,
		w = maxX - minX + 12,
		h = maxY - minY + 12;
	const ratios = [];
	let worst = null;
	for (const [dx, dy] of JITTER) {
		const out = execFileSync('node', [
			'.tmp-baselines/avg-ink-contrast.mjs',
			`${B}/${frame}.png`,
			String(x + dx),
			String(y + dy),
			String(w),
			String(h)
		]);
		const r = JSON.parse(out.toString());
		ratios.push(r.ratio);
		if (!worst || r.ratio < worst.ratio) worst = { ...r, dx, dy };
	}
	console.log(
		`${frame}: bbox=(${x},${y},${w},${h}) ratios=[${ratios.join(', ')}] worst=${worst.ratio} ink=${worst.avgInkRelLum} ground=${worst.groundRelLum}`
	);
}
