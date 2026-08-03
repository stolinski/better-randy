import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
	getTransitionEffectRenderer,
	transitionEffectRenderers,
	transitionEffectTypes
} from './transition-registry';

describe('transition Effect registry', () => {
	it('registers unique typed renderers whose defaults validate', () => {
		const renderers = transitionEffectRenderers();
		const types = transitionEffectTypes();

		assert.deepEqual(types, [
			'mask-wipe',
			'particle-dissolve',
			'sheet-peel',
			'seeded-shatter'
		]);
		assert.equal(new Set(types).size, types.length);
		for (const renderer of renderers) {
			assert.equal(renderer.paramsSchema.safeParse(renderer.defaults().params).success, true);
			assert.equal(getTransitionEffectRenderer(renderer.type), renderer);
			assert.match(renderer.pass.fragmentBody, /return/);
		}
	});

	it('rejects invalid family parameters', () => {
		assert.equal(
			getTransitionEffectRenderer('particle-dissolve')?.paramsSchema.safeParse({
				seed: -1,
				density: 2,
				spread: 1,
				direction: 0,
				softness: 0,
				luminanceBias: 0
			}).success,
			false
		);
		assert.equal(
			getTransitionEffectRenderer('seeded-shatter')?.paramsSchema.safeParse({
				seed: 1,
				columns: 100,
				scatter: 0.1,
				rotation: 0.5,
				depth: 0.5,
				shadow: 0.5
			}).success,
			false
		);
	});
});
