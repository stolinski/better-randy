import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
	DEFAULT_REFRACTIVE_LENS_REGION,
	NormalizedOpticalRegionSchema,
	getOpticalShapeCode,
	packNormalizedOpticalRegion
} from './optical-geometry';

describe('optical geometry', () => {
	it('rejects normalized regions that extend beyond the frame', () => {
		assert.equal(
			NormalizedOpticalRegionSchema.safeParse({ x: 0.8, y: 0, width: 0.4, height: 1 }).success,
			false
		);
	});

	it('packs partial runtime regions with explicit fallbacks', () => {
		assert.deepEqual(
			packNormalizedOpticalRegion({ x: 0.1, width: 0.7 }, DEFAULT_REFRACTIVE_LENS_REGION),
			[0.1, 0.25, 0.7, 0.5]
		);
	});

	it('uses stable shader codes for optical shapes', () => {
		assert.equal(getOpticalShapeCode('circle'), 0);
		assert.equal(getOpticalShapeCode('rounded-rect'), 1);
	});
});
