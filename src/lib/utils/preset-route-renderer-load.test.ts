import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { isCurrentPresetRouteRendererLoad } from './preset-route-renderer-load';

describe('isCurrentPresetRouteRendererLoad', () => {
	it('accepts only the active generation for the active route', () => {
		assert.equal(
			isCurrentPresetRouteRendererLoad(4, 4, '["new","builtin"]', '["new","builtin"]'),
			true
		);
	});

	it('rejects a completion superseded by a newer navigation generation', () => {
		assert.equal(
			isCurrentPresetRouteRendererLoad(3, 4, '["old","builtin"]', '["new","builtin"]'),
			false
		);
	});

	it('rejects stale route data even when generation tokens match', () => {
		assert.equal(
			isCurrentPresetRouteRendererLoad(4, 4, '["old","builtin"]', '["new","builtin"]'),
			false
		);
	});
});
