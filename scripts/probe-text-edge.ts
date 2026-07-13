import { getProbeBounds, loadProbePng, parseProbeArgs } from './_probe-image.ts';

// Reports text-edge sharpness metrics for a region of a PNG. Used by the
// Critic for R1 (text sharpness) and R2 (resampled content sharpness).
//   luma_range     — the region's actual ink-to-ground luma span (max − min,
//                    0..1) — the contrast the edge had to work with.
//   max_step       — largest single-pixel luma delta in the region (0..1).
//   max_step_normalized — max_step / luma_range (0..1). THIS is the crispness
//                    verdict, not max_step: a crisp edge crosses most of the
//                    available range in one pixel however dim the ink is.
//                    < 0.3 = fuzzy. (Absolute max_step under-reads crisp-but-dim
//                    text — a low-contrast kicker can cross its full range in
//                    ~2px yet score max_step ≈ 0.30 and read false-fuzzy.)
//   fringing_px    — average horizontal pixel separation between R/G/B
//                    high-contrast transitions. > 1 = visible chromatic fringing.
//   transition_count — number of transitions detected (sanity check that the
//                    region contained text edges); the detection threshold is
//                    range-relative so dim edges still register.

const { pngPath, region } = parseProbeArgs({
	region: 'required',
	usage: 'usage: probe-text-edge.ts <png> --region x,y,w,h'
});
const png = await loadProbePng(pngPath);
const { x0, y0, x1, y1 } = getProbeBounds(png, region);

const luma = (r: number, g: number, b: number): number =>
	(0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// First pass: the region's actual luma span. A DIM stroke (low ink-to-ground
// contrast) can be perfectly crisp yet never produce a large ABSOLUTE step, so
// both the transition threshold and the crispness verdict normalize against this
// range instead of a fixed 0.35 (which read false-fuzzy on dim ink).
let lumaMin = 1;
let lumaMax = 0;
for (let y = y0; y < y1; y++) {
	for (let x = x0; x < x1; x++) {
		const idx = (y * png.width + x) * 4;
		const l = luma(png.data[idx], png.data[idx + 1], png.data[idx + 2]);
		if (l < lumaMin) lumaMin = l;
		if (l > lumaMax) lumaMax = l;
	}
}
const lumaRange = Math.max(0, lumaMax - lumaMin);

// A transition is a per-pixel step crossing ≥ STEP_FRAC of the available range,
// floored so a near-flat region (no real edge) doesn't trip on sensor noise. On
// full-contrast text (range ≈ 1) this floors back to the historical 0.35.
const STEP_FRAC = 0.35;
const ABS_STEP_FLOOR = 0.06;
const STEP_THRESHOLD = Math.max(ABS_STEP_FLOOR, STEP_FRAC * lumaRange);
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
					const spread = Math.max(rChange, gChange, bChange) - Math.min(rChange, gChange, bChange);
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

const maxStepNormalized = lumaRange > 0 ? Math.min(1, maxStep / lumaRange) : 0;

console.log(
	JSON.stringify({
		luma_range: Number(lumaRange.toFixed(4)),
		max_step: Number(maxStep.toFixed(4)),
		max_step_normalized: Number(maxStepNormalized.toFixed(4)),
		fringing_px: Number(avgFringing.toFixed(2)),
		transition_count: transitionCount
	})
);
