import { alphaAt, lumaAt, modalLuma, parseChannelFlag } from './_probe-channel.ts';
import { getProbeBounds, loadProbePng, parseProbeArgs } from './_probe-image.ts';

// Reports the fraction of the frame occupied by non-transparent content.
// Used by the Critic for Q9 (≥ 30% of every frame is visually quiet, so
// ink_ratio must be ≤ 0.70).
//   ink_ratio    — pixels with alpha > 10% divided by total pixels.
//   quiet_ratio  — 1 - ink_ratio.
// Pass `--region x,y,w,h` to restrict to a sub-rect (e.g. the canvas
// area within a viewport screenshot that includes workspace UI chrome).

const { pngPath, region } = parseProbeArgs({
	region: 'optional',
	usage: 'usage: probe-ink-coverage.ts <png> [--region x,y,w,h]'
});
const png = await loadProbePng(pngPath);
const { x0, y0, x1, y1 } = getProbeBounds(png, region);

// "Ink" on a transparent overlay is non-transparent content (alpha). On an
// opaque piece (backgroundFill / flattened capture) alpha is useless, so "ink"
// is content that DEVIATES from the field's modal luma — works whether content
// is brighter (bumpers) or darker (paper) than its background. Auto-detected
// unless `--channel` forces it.
const bounds = { x0, y0, x1, y1 };
const requested = parseChannelFlag(process.argv);
let channel: 'alpha' | 'luma' = requested ?? 'alpha';
if (!requested) {
	let opaque = true;
	detect: for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			if (alphaAt(png, x, y) !== 255) {
				opaque = false;
				break detect;
			}
		}
	}
	channel = opaque ? 'luma' : 'alpha';
}

const LUMA_INK_DELTA = 24; // 0..255 deviation from the field that counts as ink
const fieldLuma = channel === 'luma' ? modalLuma(png, bounds) : 0;

let inkPixels = 0;
let totalPixels = 0;
for (let y = y0; y < y1; y++) {
	for (let x = x0; x < x1; x++) {
		const isInk =
			channel === 'luma'
				? Math.abs(lumaAt(png, x, y) - fieldLuma) > LUMA_INK_DELTA
				: alphaAt(png, x, y) > 25;
		if (isInk) inkPixels++;
		totalPixels++;
	}
}

const inkRatio = totalPixels > 0 ? inkPixels / totalPixels : 0;
console.log(
	JSON.stringify({
		channel,
		ink_ratio: Number(inkRatio.toFixed(4)),
		quiet_ratio: Number((1 - inkRatio).toFixed(4))
	})
);
