import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { assertSourceVideoCoverage, sourceVideoTimestampAt } from './source-video-timing';

describe('Source video timing', () => {
	it('maps media-relative offsets onto absolute presentation timestamps', () => {
		assert.equal(
			sourceVideoTimestampAt({
				firstTimestamp: 10.25,
				sourceOffsetSeconds: 3.5,
				compositionTimestamp: (299 * 1001) / 30000
			}),
			10.25 + 3.5 + (299 * 1001) / 30000
		);
	});

	it('requires the selected source range to cover the composition', () => {
		assert.doesNotThrow(() =>
			assertSourceVideoCoverage({
				sourceDurationSeconds: 20,
				sourceOffsetSeconds: 5,
				compositionDurationSeconds: 15
			})
		);
		assert.throws(
			() =>
				assertSourceVideoCoverage({
					sourceDurationSeconds: 20,
					sourceOffsetSeconds: 5,
					compositionDurationSeconds: 15.01
				}),
			/15\.000s available.*15\.010s/
		);
	});
});
