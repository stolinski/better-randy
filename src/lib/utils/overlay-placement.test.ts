import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { OverlayPosition } from '$lib/platform/engine-schema';

import { cloneOverlayPlacement, resolveOverlayPlacement } from './overlay-placement';

describe('resolveOverlayPlacement', () => {
	const position: OverlayPosition = {
		anchor: 'bottom-left',
		offset: { x: 0.06, y: 0.08 },
		scale: 1,
		orientationOverrides: {
			vertical: {
				anchor: 'bottom-center',
				offset: { x: 0, y: 0.2 },
				scale: 0.9,
				rotation: 2
			}
		}
	};

	it('uses shared placement when the target has no override', () => {
		assert.equal(resolveOverlayPlacement(position, 'horizontal'), position);
	});

	it('uses the complete target-specific snapshot when present', () => {
		assert.deepEqual(resolveOverlayPlacement(position, 'vertical'), {
			anchor: 'bottom-center',
			offset: { x: 0, y: 0.2 },
			scale: 0.9,
			rotation: 2
		});
	});

	it('clones placement geometry without carrying nested overrides', () => {
		const clone = cloneOverlayPlacement(position);

		assert.deepEqual(clone, {
			anchor: 'bottom-left',
			offset: { x: 0.06, y: 0.08 },
			scale: 1,
			rotation: undefined,
			rect: undefined
		});
		assert.notEqual(clone.offset, position.offset);
		assert.equal('orientationOverrides' in clone, false);
	});
});
