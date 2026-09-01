import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { PACK_REGISTRY } from './packs/registry.ts';

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
let setActivePackFontDeclarations: typeof import('./fonts.ts').setActivePackFontDeclarations;

beforeAll(async () => {
	vi.stubGlobal('document', { fonts: fakeFontSet });
	({ fontsReady, setActivePackFontDeclarations } = await import('./fonts.ts'));
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

	it('gates on a dynamically declared active pack face without repeating the built-in sweep', async () => {
		loadedSpecs.length = 0;
		setActivePackFontDeclarations([{ family: 'My Brand Face', weights: [500, 700] }]);
		await fontsReady();
		assert.deepEqual(loadedSpecs, [
			'normal 500 1em "My Brand Face"',
			'normal 700 1em "My Brand Face"'
		]);
	});

	it('re-arms on every call as the active pack changes', async () => {
		loadedSpecs.length = 0;
		setActivePackFontDeclarations([{ family: 'Another Face', style: 'italic' }]);
		await fontsReady();
		assert.deepEqual(loadedSpecs, ['italic 400 1em "Another Face"']);

		loadedSpecs.length = 0;
		setActivePackFontDeclarations([]);
		await fontsReady();
		assert.deepEqual(loadedSpecs, []);
	});
});
