import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Temporal energy-coherence probe (8ged0rsd item 6). The stills-only R-protocol
// samples frames independently, so it cannot see a focal feature that BLINKS OUT
// at one instant and pops back at the next — an optical transition (rack focus,
// a feature resolving into focus, a lift settling) must resolve CONTINUOUSLY.
//
// Feed it the frames of a transition window in timeline order (≥3) and a region
// over the focal feature. It tracks the region's integrated, alpha-weighted
// luminance per frame ("energy") and fails a non-monotonic DIP — an interior
// frame whose energy falls below BOTH neighbours by more than DIP_FRAC of the
// settled value. A smooth resolve in either direction (brightening into focus,
// dimming out of focus) passes; only an excursion away from the trajectory fails.
//
// usage: probe-temporal-energy.ts <png> <png> <png> [...] [--region x,y,w,h]
//        (≥3 frames, timeline order; --region defaults to the whole frame)
// exit:  0 pass, 1 fail, 2 usage.

const DIP_FRAC = 0.25; // a dip deeper than 25% of the settled energy fails
const SETTLED_FLOOR = 0.02; // below this, use peak energy as the reference instead

interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
}

function parseArgs(): { paths: string[]; region: Region | null } {
	const argv = process.argv.slice(2);
	const paths: string[] = [];
	let region: Region | null = null;
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--region') {
			const value = argv[i + 1];
			i++;
			const [x, y, w, h] = (value ?? '').split(',').map((part) => Number(part));
			if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
				console.error(`invalid region "${value}"`);
				process.exit(2);
			}
			region = { x, y, w, h };
		} else if (!argv[i].startsWith('--')) {
			paths.push(resolve(process.cwd(), argv[i]));
		}
	}
	if (paths.length < 3) {
		console.error(
			'usage: probe-temporal-energy.ts <png> <png> <png> [...] [--region x,y,w,h]  (≥3 frames, timeline order)'
		);
		process.exit(2);
	}
	return { paths, region };
}

function regionEnergy(png: PNG, region: Region | null): number {
	const x0 = Math.max(0, region ? region.x : 0);
	const y0 = Math.max(0, region ? region.y : 0);
	const x1 = Math.min(png.width, region ? region.x + region.w : png.width);
	const y1 = Math.min(png.height, region ? region.y + region.h : png.height);
	let sum = 0;
	let count = 0;
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const idx = (y * png.width + x) * 4;
			const luma = (0.2126 * png.data[idx] + 0.7152 * png.data[idx + 1] + 0.0722 * png.data[idx + 2]) / 255;
			const alpha = png.data[idx + 3] / 255;
			sum += luma * alpha;
			count++;
		}
	}
	return count > 0 ? sum / count : 0;
}

const { paths, region } = parseArgs();
const energies: { path: string; energy: number }[] = [];
for (const path of paths) {
	const png = PNG.sync.read(await readFile(path));
	energies.push({ path, energy: Number(regionEnergy(png, region).toFixed(5)) });
}

const settled = energies[energies.length - 1].energy;
const peak = Math.max(...energies.map((f) => f.energy));
// A feature that resolves to a dark endpoint has no meaningful "settled"
// brightness to measure a dip against — fall back to the window's peak.
const reference = settled >= SETTLED_FLOOR ? settled : peak;
const dipLimit = DIP_FRAC * reference;

let worst: { at_frame: number; depth: number } | null = null;
for (let i = 1; i < energies.length - 1; i++) {
	const depth = Math.min(energies[i - 1].energy, energies[i + 1].energy) - energies[i].energy;
	if (depth > 0 && (worst === null || depth > worst.depth)) {
		worst = { at_frame: i, depth: Number(depth.toFixed(5)) };
	}
}

const failed = worst !== null && worst.depth > dipLimit;

console.log(
	JSON.stringify(
		{
			region,
			frames: energies,
			settled,
			reference,
			reference_source: settled >= SETTLED_FLOOR ? 'settled' : 'peak',
			max_dip:
				worst === null
					? null
					: {
							at_frame: worst.at_frame,
							depth: worst.depth,
							pct_of_reference: Number(((worst.depth / reference) * 100).toFixed(1))
						},
			dip_limit_pct: DIP_FRAC * 100,
			verdict: failed ? 'fail' : 'pass',
			reason: failed
				? `focal feature dips ${((worst!.depth / reference) * 100).toFixed(1)}% of settled energy at frame ${worst!.at_frame} — the optical transition blinks out instead of resolving continuously`
				: 'focal energy resolves continuously (no non-monotonic dip beyond tolerance)'
		},
		null,
		2
	)
);

if (failed) {
	process.exit(1);
}
