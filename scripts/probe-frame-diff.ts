import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Verifies a rendered/exported frame sequence — built for the export stale-DOM
// fix (Workspace `renderFrame` now re-captures the DOM per frame). Point it at
// PNG frames captured from the export path at several timestamps, in timeline
// order. It asserts:
//   (a) ANIMATION — consecutive frames differ above a small threshold, so
//       DOM-driven content (split-text kinetic typography, the surface
//       enter/exit slide) is NOT frozen between timestamps.
//   (b) ALPHA — at least one frame carries transparent pixels, honoring the
//       transparent-output contract. (A screenshot composited over a page
//       background reads as fully opaque and will fail this clause — feed it
//       real export PNGs / canvas.toDataURL frames, which retain alpha.)
//
// Output per frame: alpha { min, max, pct_transparent, pct_opaque }.
// Output per consecutive pair: mean_delta (0..1 mean per-channel RGBA L1
// distance) and `changed`. Exits 1 if any pair is unchanged (frozen) or no
// frame carries alpha.

const CHANGED_THRESHOLD = 0.002; // mean per-channel delta above which a pair "moved"
const ALPHA_PRESENT_PCT = 1; // a frame "carries alpha" if ≥1% of pixels are < 255 alpha

interface FrameStat {
	path: string;
	width: number;
	height: number;
	alpha: { min: number; max: number; pct_transparent: number; pct_opaque: number };
}

interface DiffStat {
	from: string;
	to: string;
	mean_delta: number;
	changed: boolean;
	size_mismatch?: boolean;
}

function parseArgs(): string[] {
	const paths = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
	if (paths.length < 2) {
		console.error('usage: probe-frame-diff.ts <png> <png> [<png> ...]  (≥2 frames, timeline order)');
		process.exit(2);
	}
	return paths.map((part) => resolve(process.cwd(), part));
}

const paths = parseArgs();
const loaded = await Promise.all(
	paths.map(async (path) => ({ path, png: PNG.sync.read(await readFile(path)) }))
);

const frames: FrameStat[] = loaded.map(({ path, png }) => {
	const total = png.width * png.height;
	let min = 255;
	let max = 0;
	let transparent = 0;
	let opaque = 0;
	for (let i = 3; i < png.data.length; i += 4) {
		const alpha = png.data[i];
		if (alpha < min) min = alpha;
		if (alpha > max) max = alpha;
		if (alpha < 255) transparent++;
		else opaque++;
	}
	return {
		path,
		width: png.width,
		height: png.height,
		alpha: {
			min,
			max,
			pct_transparent: Number(((transparent / total) * 100).toFixed(2)),
			pct_opaque: Number(((opaque / total) * 100).toFixed(2))
		}
	};
});

const diffs: DiffStat[] = [];
for (let k = 1; k < loaded.length; k++) {
	const a = loaded[k - 1].png;
	const b = loaded[k].png;
	const label = { from: loaded[k - 1].path, to: loaded[k].path };
	if (a.width !== b.width || a.height !== b.height) {
		diffs.push({ ...label, mean_delta: 1, changed: true, size_mismatch: true });
		continue;
	}
	let sum = 0;
	for (let i = 0; i < a.data.length; i++) {
		sum += Math.abs(a.data[i] - b.data[i]);
	}
	const meanDelta = sum / a.data.length / 255;
	diffs.push({
		...label,
		mean_delta: Number(meanDelta.toFixed(5)),
		changed: meanDelta > CHANGED_THRESHOLD
	});
}

const frozenPairs = diffs.filter((diff) => !diff.changed).length;
const hasAlpha = frames.some((frame) => frame.alpha.pct_transparent >= ALPHA_PRESENT_PCT);

const failures: string[] = [];
if (frozenPairs > 0) {
	failures.push(`${frozenPairs} consecutive frame pair(s) unchanged — content frozen between timestamps`);
}
if (!hasAlpha) {
	failures.push(
		`no frame carries alpha (≥${ALPHA_PRESENT_PCT}% transparent) — transparent-output contract not observed (or frames lack an alpha channel)`
	);
}

console.log(
	JSON.stringify(
		{
			frames,
			diffs,
			frozen_pairs: frozenPairs,
			has_alpha: hasAlpha,
			verdict: failures.length === 0 ? 'pass' : 'fail',
			reason: failures.length === 0 ? 'frames animate and carry alpha' : failures.join('; ')
		},
		null,
		2
	)
);

if (failures.length > 0) {
	process.exit(1);
}
