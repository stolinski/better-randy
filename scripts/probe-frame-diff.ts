import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

// Verifies a rendered/exported frame sequence — built for the export stale-DOM
// fix (Workspace `renderFrame` now re-captures the DOM per frame). Point it at
// PNG frames captured from the export path at several timestamps, in timeline
// order. It asserts:
//   (a) ANIMATION — at least one sampled pair differs above a small threshold.
//       Intentional hold frames may be identical; a sequence with no changed
//       pair is frozen.
//   (b) ALPHA — transparent mode requires transparent pixels; `--opaque`
//       requires every decoded pixel to be fully opaque.
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
	alpha: {
		min: number;
		max: number;
		pct_transparent: number;
		pct_opaque: number;
		pct_partial: number;
		transparent_rgb_max: number;
	};
}

interface DiffStat {
	from: string;
	to: string;
	mean_delta: number;
	changed: boolean;
	size_mismatch?: boolean;
}

function parseArgs(): { paths: string[]; opaque: boolean } {
	const opaque = process.argv.includes('--opaque');
	const paths = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
	if (paths.length < 2) {
		console.error(
			'usage: probe-frame-diff.ts <png> <png> [<png> ...] [--opaque]  (≥2 frames, timeline order)'
		);
		process.exit(2);
	}
	return { paths: paths.map((part) => resolve(process.cwd(), part)), opaque };
}

const { paths, opaque } = parseArgs();
const vp9Alpha = process.argv.includes('--vp9-alpha');
const loaded = await Promise.all(
	paths.map(async (path) => ({ path, png: PNG.sync.read(await readFile(path)) }))
);

const frames: FrameStat[] = loaded.map(({ path, png }) => {
	const total = png.width * png.height;
	let min = 255;
	let max = 0;
	let transparent = 0;
	let opaque = 0;
	let partial = 0;
	let transparentRgbMax = 0;
	for (let i = 0; i < png.data.length; i += 4) {
		const alpha = png.data[i + 3];
		if (alpha < min) min = alpha;
		if (alpha > max) max = alpha;
		if (alpha < 255) transparent++;
		else opaque++;
		if (alpha > 0 && alpha < 255) partial++;
		if (alpha === 0) {
			transparentRgbMax = Math.max(
				transparentRgbMax,
				png.data[i],
				png.data[i + 1],
				png.data[i + 2]
			);
		}
	}
	return {
		path,
		width: png.width,
		height: png.height,
		alpha: {
			min,
			max,
			pct_transparent: Number(((transparent / total) * 100).toFixed(2)),
			pct_opaque: Number(((opaque / total) * 100).toFixed(2)),
			pct_partial: Number(((partial / total) * 100).toFixed(4)),
			transparent_rgb_max: transparentRgbMax
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
const changedPairs = diffs.length - frozenPairs;
const hasAlpha = frames.some((frame) => frame.alpha.pct_transparent >= ALPHA_PRESENT_PCT);
const isOpaque = frames.every((frame) => frame.alpha.min === 255 && frame.alpha.max === 255);
const activeTransparentFrames = frames.filter((frame) => frame.alpha.max > 0 && frame.alpha.min < 255);

const failures: string[] = [];
if (changedPairs === 0) {
	failures.push('no sampled frame pair changed — content frozen across the decoded sequence');
}
if (opaque && !isOpaque) {
	failures.push('one or more decoded frames contain non-opaque pixels');
} else if (!opaque && !hasAlpha) {
	failures.push(
		`no frame carries alpha (≥${ALPHA_PRESENT_PCT}% transparent) — transparent-output contract not observed (or frames lack an alpha channel)`
	);
}
if (!opaque && activeTransparentFrames.some((frame) => frame.alpha.pct_partial === 0)) {
	failures.push('an active transparent frame has no partially covered alpha-edge pixels');
}
// VP9 stores color and alpha separately, so YUV chroma reconstruction can
// leave bounded hidden color under alpha zero. Direct PNG/ProRes stays strict.
const transparentRgbTolerance = vp9Alpha ? 24 : 4;
if (!opaque && frames.some((frame) => frame.alpha.transparent_rgb_max > transparentRgbTolerance)) {
	failures.push('fully transparent pixels retain RGB above the clean-edge tolerance');
}

console.log(
	JSON.stringify(
		{
			frames,
			diffs,
			frozen_pairs: frozenPairs,
			changed_pairs: changedPairs,
			has_alpha: hasAlpha,
			is_opaque: isOpaque,
			verdict: failures.length === 0 ? 'pass' : 'fail',
			reason:
				failures.length === 0
					? `frames animate and are ${opaque ? 'opaque' : 'transparent'}`
					: failures.join('; ')
		},
		null,
		2
	)
);

if (failures.length > 0) {
	process.exit(1);
}
