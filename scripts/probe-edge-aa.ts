import { parseChannelFlag, resolveChannel } from './_probe-channel.ts';
import { getProbeBounds, loadProbePng, parseProbeArgs } from './_probe-image.ts';

// Reports anti-aliasing metrics on diagonal / curved alpha edges. Used by
// the Critic for R4 (no aliasing on non-axis-aligned edges).
//   hard_stairsteps   — count of columns where the alpha transition is a
//                       single-pixel step (no fractional coverage).
//   smooth_pixels     — count of columns where the transition spans 2+ px
//                       with fractional coverage (the desired case).
//   coverage_ratio    — smooth_pixels / (hard_stairsteps + smooth_pixels).
//                       Closer to 1.0 = well anti-aliased.

const { pngPath, region } = parseProbeArgs({
	region: 'required',
	usage: 'usage: probe-edge-aa.ts <png> --region x,y,w,h'
});
const png = await loadProbePng(pngPath);
const { x0, y0, x1, y1 } = getProbeBounds(png, region);

// Measure edges on alpha (transparent overlays) or luma (opaque pieces, where
// the edge is a bright glyph/shape on a darker field); auto-detected unless
// `--channel` forces it. LOW/HIGH are coverage thresholds on the chosen channel.
const { channel, sample } = resolveChannel(png, { x0, y0, x1, y1 }, parseChannelFlag(process.argv));

const LOW = 32;
const HIGH = 224;

let hardSteps = 0;
let smoothPixels = 0;
let emptyTopColumns = 0;
let fullTopColumns = 0;

for (let x = x0; x < x1; x++) {
	let firstFractional = -1;
	let firstFull = -1;
	let firstEmpty = -1;
	for (let y = y0; y < y1; y++) {
		const a = sample(x, y);
		if (a < LOW && firstEmpty < 0) firstEmpty = y;
		if (a > LOW && a < HIGH && firstFractional < 0) firstFractional = y;
		if (a >= HIGH && firstFull < 0) firstFull = y;
		if (firstEmpty >= 0 && firstFractional >= 0 && firstFull >= 0) break;
	}
	const sawEdge = firstFull >= 0 && firstEmpty >= 0;
	if (!sawEdge) continue;

	// Polarity-agnostic: the column is smoothly anti-aliased if a fractional
	// pixel sits BETWEEN the full block and the empty block, whichever is on top.
	// The old test assumed empty→full only (`firstFull > firstFractional`), so a
	// column whose edge runs full→empty — region placed inside the glyph — misread
	// as a hard stairstep. The same ampersand scored 0.564 or 1.0 by region alone.
	if (firstEmpty < firstFull) emptyTopColumns++;
	else fullTopColumns++;

	const boundaryLo = Math.min(firstFull, firstEmpty);
	const boundaryHi = Math.max(firstFull, firstEmpty);
	if (firstFractional > boundaryLo && firstFractional < boundaryHi) {
		smoothPixels++;
	} else {
		hardSteps++;
	}
}

const total = hardSteps + smoothPixels;
const ratio = total === 0 ? null : smoothPixels / total;

console.log(
	JSON.stringify({
		channel,
		hard_stairsteps: hardSteps,
		smooth_pixels: smoothPixels,
		transition_sample_count: total,
		coverage_ratio: ratio === null ? null : Number(ratio.toFixed(3)),
		polarity: { empty_top: emptyTopColumns, full_top: fullTopColumns }
	})
);
