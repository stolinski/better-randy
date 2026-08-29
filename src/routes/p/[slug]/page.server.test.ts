import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { load } from './+page.server';

function createLoadEvent(slug: string, source: string | null = null): Parameters<typeof load>[0] {
	const url = new URL(`http://localhost/p/${slug}`);
	if (source !== null) url.searchParams.set('source', source);

	return { params: { slug }, url } as unknown as Parameters<typeof load>[0];
}

describe('/p/[slug] server load', () => {
	it('resolves the corpus Starter this build ships', async () => {
		const result = await load(createLoadEvent('blank'));

		assert.equal(result.slug, 'blank');
		assert.equal(result.source, null);
		assert.equal(result.corpusPreset?.name, blankPresetJson.name);
	});

	it('carries source=builtin so the page skips the session composition shadowing it', async () => {
		const result = await load(createLoadEvent('blank', 'builtin'));

		assert.equal(result.source, 'builtin');
	});

	it('reads any other source value as absent rather than passing it through', async () => {
		const result = await load(createLoadEvent('blank', 'user'));

		assert.equal(result.source, null);
	});

	it('reports no corpus Preset for a slug only a session can hold', async () => {
		const result = await load(createLoadEvent('untitled-2'));

		assert.deepEqual(result, { slug: 'untitled-2', source: null, corpusPreset: null });
	});
});
