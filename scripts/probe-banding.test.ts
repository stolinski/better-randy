import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measureBandingFalloff } from './probe-banding.ts';

function measure(values: readonly number[], excludedStart?: number) {
	return measureBandingFalloff(
		{ x0: 0, y0: 0, x1: values.length, y1: 1 },
		(x) => values[x],
		excludedStart === undefined ? null : { x0: excludedStart, y0: 0, x1: values.length, y1: 1 }
	);
}

function gaussianFalloff(peak: number): number[] {
	return Array.from({ length: 33 }, (_, index) =>
		Math.round(peak * Math.exp(-((index - 4) ** 2) / (2 * 7 ** 2)))
	);
}

describe('relative shadow falloff signal', () => {
	it('measures ordinary 50% and 85% opacity gaussian shadows relative to their peaks', () => {
		for (const peak of [128, 217]) {
			const measurement = measure(gaussianFalloff(peak));
			assert.ok(measurement.transitionSampleCount > 0);
			assert.ok((measurement.transitionSpanPixels ?? 0) > 0);
			assert.ok(measurement.dynamicRange > 0.4);
			assert.equal(measurement.bandCount, 0);
		}
	});

	it('supports inverse-polarity shadows on opaque content', () => {
		const values = gaussianFalloff(180).map((value) => 255 - value);
		const measurement = measure(values);
		assert.ok(measurement.transitionSampleCount > 0);
		assert.ok((measurement.observedPeak ?? 255) < (measurement.baseline ?? 0));
	});

	it('reports a hard rim as a maximum relative one-pixel step', () => {
		const measurement = measure([0, 0, 0, 128, 128, 128, 128, 0, 0, 0]);
		assert.ok(measurement.maxStep > 0.9);
	});

	it('counts stepped bands only inside the relative transition', () => {
		const measurement = measure([0, 0, 12, 12, 12, 40, 40, 40, 80, 80, 80, 128, 128]);
		assert.ok(measurement.bandCount > 0);
	});

	it('ignores a long transparent exterior flat', () => {
		const values = [...gaussianFalloff(128), ...Array.from({ length: 80 }, () => 0)];
		const measurement = measure(values);
		assert.equal(measurement.bandCount, 0);
		assert.ok(measurement.transitionSampleCount > 0);
	});

	it('returns no transition for a flat region', () => {
		const measurement = measure(Array.from({ length: 20 }, () => 0));
		assert.equal(measurement.transitionSampleCount, 0);
		assert.equal(measurement.transitionSpanPixels, null);
	});

	it('does not use excluded element-body pixels to manufacture signal', () => {
		const measurement = measure([0, 0, 0, 255, 255, 255, 255], 3);
		assert.equal(measurement.transitionSampleCount, 0);
	});
});
