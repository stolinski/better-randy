import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PNG } from 'pngjs';

import { classifyProbeOutputClass } from './_probe-output-class.ts';
import { measureLocalBackgroundContrast } from './probe-local-contrast.ts';
import { measureRenderReplayPngs } from './probe-render-replay.ts';

function png(width = 3, height = 3, alpha = 0): PNG {
	const image = new PNG({ width, height });
	for (let index = 0; index < image.data.length; index += 4) {
		image.data[index] = 20;
		image.data[index + 1] = 30;
		image.data[index + 2] = 40;
		image.data[index + 3] = alpha;
	}
	return image;
}

describe('deterministic render replay', () => {
	it('passes only byte-identical decoded pixels at the same explicit coordinate', () => {
		const first = png();
		const second = png();
		const measurement = measureRenderReplayPngs(first, second, {
			frameIndex: 42,
			timestampMicroseconds: 1_400_000
		});
		assert.ok(measurement);
		assert.equal(measurement.frameIndex, 42);
		assert.equal(measurement.timestampMicroseconds, 1_400_000);
		assert.equal(measurement.changedPixelCount, 0);
		assert.equal(measurement.changedPixelRatio, 0);
		assert.equal(measurement.firstPixelSha256, measurement.secondPixelSha256);
	});

	it('reports one changed pixel without a caller-selected tolerance', () => {
		const first = png();
		const second = png();
		second.data[4] = 21;
		const measurement = measureRenderReplayPngs(first, second, {
			frameIndex: 42,
			timestampMicroseconds: 1_400_000
		});
		assert.ok(measurement);
		assert.equal(measurement.changedPixelCount, 1);
		assert.equal(measurement.changedPixelRatio, 1 / 9);
	});

	it('returns no measurement when required dimensions do not match', () => {
		assert.equal(
			measureRenderReplayPngs(png(), png(4, 3), {
				frameIndex: 0,
				timestampMicroseconds: 0
			}),
			null
		);
	});
});

describe('decoded output classification', () => {
	it('requires every edge pixel to match the declared class', () => {
		assert.equal(classifyProbeOutputClass(png(3, 3, 0)), 'transparent');
		assert.equal(classifyProbeOutputClass(png(3, 3, 255)), 'opaque');
		const mixed = png(3, 3, 0);
		mixed.data[3] = 255;
		assert.equal(classifyProbeOutputClass(mixed), 'mixed');
	});
});

describe('local background contrast', () => {
	it('samples only same-coordinate glyph, stroke, or shadow treatment pixels', () => {
		const background = png(2, 1, 0);
		const treatment = png(2, 1, 0);
		const mask = png(2, 1, 0);
		mask.data[3] = 255;
		treatment.data[0] = 255;
		treatment.data[1] = 255;
		treatment.data[2] = 255;
		treatment.data[3] = 255;
		const measurement = measureLocalBackgroundContrast(background, treatment, mask, {
			x0: 0,
			y0: 0,
			x1: 2,
			y1: 1
		});
		assert.ok(measurement);
		assert.equal(measurement.treatmentSampleCount, 1);
		assert.ok(Math.abs(measurement.measuredRatio - 4.004) < 0.02);
	});

	it('fails closed when captures differ in size or carry no treatment signal', () => {
		assert.equal(
			measureLocalBackgroundContrast(png(), png(), png(), { x0: 0, y0: 0, x1: 3, y1: 3 }),
			null
		);
		assert.equal(
			measureLocalBackgroundContrast(png(), png(4, 3), png(), {
				x0: 0,
				y0: 0,
				x1: 3,
				y1: 3
			}),
			null
		);
		const fringeMask = png();
		fringeMask.data[3] = 1;
		assert.equal(
			measureLocalBackgroundContrast(png(), png(), fringeMask, {
				x0: 0,
				y0: 0,
				x1: 3,
				y1: 3
			}),
			null
		);
	});
});
