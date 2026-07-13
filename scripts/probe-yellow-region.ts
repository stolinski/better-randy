import { getProbeBounds, loadProbePng, parseProbeArgs } from './_probe-image.ts';

// Sample the yellow-highlight pixels in a region, return count & average RGB.
// Used by the Critic to verify marks-coupling: highlight saturation should
// be measurably lower while the body alpha is still ramping.

const { pngPath, region } = parseProbeArgs({
	region: 'required',
	usage: 'usage: probe-yellow-region.ts <png> --region x,y,w,h'
});
const png = await loadProbePng(pngPath);
const { x0, y0, x1, y1 } = getProbeBounds(png, region);

// Yellow #ffd642 = R=255 G=214 B=66. Allow softened pixels.
// Match: R>=180, G in [120, 255], B<=160, R>=G, G>=B+30
let yellowCount = 0;
let sumR = 0,
	sumG = 0,
	sumB = 0;
let totalPixels = 0;
let maxY_G = 0;
for (let y = y0; y < y1; y++) {
	for (let x = x0; x < x1; x++) {
		const i = (y * png.width + x) * 4;
		const r = png.data[i],
			g = png.data[i + 1],
			b = png.data[i + 2];
		totalPixels++;
		if (r >= 180 && g >= 120 && b <= 160 && r >= g && g >= b + 30) {
			yellowCount++;
			sumR += r;
			sumG += g;
			sumB += b;
			if (g > maxY_G) maxY_G = g;
		}
	}
}

console.log(
	JSON.stringify({
		region: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
		totalPixels,
		yellowCount,
		yellowFraction: yellowCount / Math.max(1, totalPixels),
		avgRGB:
			yellowCount > 0
				? [
						Math.round(sumR / yellowCount),
						Math.round(sumG / yellowCount),
						Math.round(sumB / yellowCount)
					]
				: null,
		maxGreen: maxY_G
	})
);
