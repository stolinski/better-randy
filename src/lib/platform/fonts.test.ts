import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { PACK_REGISTRY } from './packs/registry.ts';
import { registerRuntimeUserPack, unregisterRuntimeUserPack } from './user-pack-runtime.svelte.ts';

const loadedSpecs: string[] = [];
const fakeFontSet = {
	load: vi.fn(async (spec: string) => {
		loadedSpecs.push(spec);
		return [];
	}),
	ready: Promise.resolve(),
	add: vi.fn()
};

let fontsReady: typeof import('./fonts.ts').fontsReady;

beforeAll(async () => {
	vi.stubGlobal('document', { fonts: fakeFontSet });
	({ fontsReady } = await import('./fonts.ts'));
});

afterAll(() => {
	vi.unstubAllGlobals();
});

const BUILTIN_SPEC_COUNT = Object.values(PACK_REGISTRY)
	.flatMap((pack) => pack.fonts ?? [])
	.reduce((count, font) => count + (font.weights ?? [400]).length, 0);

describe('fontsReady', () => {
	it('sweeps every built-in Pack face once', async () => {
		await fontsReady();
		assert.equal(loadedSpecs.length, BUILTIN_SPEC_COUNT);
		assert.ok(loadedSpecs.includes('normal 400 1em "JetBrains Mono"'));
	});

	it('gates on a User Pack loaded into the runtime without repeating the built-in sweep', async () => {
		loadedSpecs.length = 0;
		registerRuntimeUserPack({
			...PACK_REGISTRY['clean-light'],
			slug: 'my-brand',
			fonts: [{ family: 'My Brand Face', weights: [500, 700] }]
		});
		await fontsReady();
		assert.deepEqual(loadedSpecs, [
			'normal 500 1em "My Brand Face"',
			'normal 700 1em "My Brand Face"'
		]);
	});

	it('re-arms on every call as packs load and unload', async () => {
		loadedSpecs.length = 0;
		registerRuntimeUserPack({
			...PACK_REGISTRY['clean-light'],
			slug: 'other-brand',
			fonts: [{ family: 'Another Face', style: 'italic' }]
		});
		await fontsReady();
		assert.deepEqual(loadedSpecs, [
			'normal 500 1em "My Brand Face"',
			'normal 700 1em "My Brand Face"',
			'italic 400 1em "Another Face"'
		]);

		loadedSpecs.length = 0;
		unregisterRuntimeUserPack('my-brand');
		unregisterRuntimeUserPack('other-brand');
		await fontsReady();
		assert.deepEqual(loadedSpecs, []);
	});
});
