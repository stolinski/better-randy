import { parseChannelFlag, resolveChannel } from './_probe-channel.ts';
import { getProbeBounds, loadProbePng, parseProbeArgs } from './_probe-image.ts';

// Reports banding metrics for a region of a PNG. Used by the Critic for
// R3 (shadow falloff) and R5 (tonal banding).
//   max_step          — largest alpha delta between horizontally-adjacent
//                       pixels in the region (0..1). Low = continuous gaussian;
//                       high = visible steps or hard rim.
//   band_count        — number of distinct alpha plateaus (≥3-pixel runs of
//                       the same alpha bucket) along scan lines.
//   transition_span_px — average pixel distance from alpha 0.9 → 0.1 across
//                       scan lines. Larger span = softer falloff.

const { pngPath, region } = parseProbeArgs({
	region: 'required',
	usage: 'usage: probe-banding.ts <png> --region x,y,w,h'
});
const png = await loadProbePng(pngPath);
const { x0, y0, x1, y1 } = getProbeBounds(png, region);

// Measure on alpha (transparent overlays) or luma (opaque pieces / flattened
// captures); auto-detected unless `--channel` forces it. See _probe-channel.ts.
const { channel, sample } = resolveChannel(png, { x0, y0, x1, y1 }, parseChannelFlag(process.argv));

let maxStep = 0;
let totalPlateaus = 0;
const transitionSpans: number[] = [];

const bucket = (a: number): number => Math.round((a / 255) * 32); // 32 buckets

for (let y = y0; y < y1; y++) {
	let runBucket = -1;
	let runLength = 0;
	let plateausInRow = 0;
	let highX = -1;
	let lowX = -1;
	let lastValue = -1;

	for (let x = x0; x < x1; x++) {
		const value = sample(x, y);
		const b = bucket(value);

		if (lastValue >= 0) {
			const step = Math.abs(value - lastValue) / 255;
			if (step > maxStep) maxStep = step;
		}
		lastValue = value;

		if (b === runBucket) {
			runLength++;
		} else {
			if (runLength >= 3) plateausInRow++;
			runBucket = b;
			runLength = 1;
		}

		const valueNorm = value / 255;
		if (highX < 0 && valueNorm <= 0.9) highX = x;
		if (highX >= 0 && lowX < 0 && valueNorm <= 0.1) lowX = x;
	}
	if (runLength >= 3) plateausInRow++;
	totalPlateaus += plateausInRow;

	if (highX >= 0 && lowX >= 0) transitionSpans.push(lowX - highX);
}

const rowCount = Math.max(1, y1 - y0);
const avgPlateaus = totalPlateaus / rowCount;
const avgSpan =
	transitionSpans.length > 0
		? transitionSpans.reduce((s, v) => s + v, 0) / transitionSpans.length
		: null;

console.log(
	JSON.stringify({
		channel,
		max_step: Number(maxStep.toFixed(4)),
		band_count: Number(avgPlateaus.toFixed(2)),
		transition_span_px: avgSpan === null ? null : Number(avgSpan.toFixed(1))
	})
);
