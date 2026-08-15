import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { PresetSchema, type Preset } from '$lib/platform/engine-schema';
import { getPresetBySlug } from '$lib/platform/preset';
import * as userCompositionFileIndex from '$lib/platform/user-composition-file-index.server';
import { userCompositionStore } from '$lib/platform/user-composition-store';
import blankPresetJson from '$lib/presets/blank.json';

import { load } from './+page.server';

const blankPreset = PresetSchema.parse(blankPresetJson);
const userPreset: Preset = PresetSchema.parse({ ...blankPresetJson, name: 'User blank' });

function createLoadEvent(
	slug: string,
	source: string | null = null,
	requestFetch = vi.fn<typeof fetch>()
): Parameters<typeof load>[0] {
	const url = new URL(`http://localhost/p/${slug}`);
	if (source !== null) url.searchParams.set('source', source);

	return {
		params: { slug },
		url,
		fetch: requestFetch
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	vi.spyOn(userCompositionFileIndex, 'userCompositionFileExists').mockResolvedValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('/p/[slug] server load', () => {
	it('returns a User composition without consulting the corpus', async () => {
		const requestFetch = vi.fn<typeof fetch>();
		const loadUserComposition = vi
			.spyOn(userCompositionStore, 'loadUserComposition')
			.mockImplementationOnce(async (_slug, suppliedFetch) => {
				assert.equal(suppliedFetch, requestFetch);
				return userPreset;
			});

		const result = await load(createLoadEvent('user-only', null, requestFetch));

		assert.deepEqual(result, {
			status: 'ready',
			slug: 'user-only',
			source: null,
			provenance: 'user',
			preset: userPreset
		});
		assert.equal(loadUserComposition.mock.calls.length, 1);
	});

	it('falls back to the corpus only when the User store returns null', async () => {
		vi.spyOn(userCompositionStore, 'loadUserComposition').mockResolvedValueOnce(null);

		const result = await load(createLoadEvent('blank'));

		assert.deepEqual(result, {
			status: 'ready',
			slug: 'blank',
			source: null,
			provenance: 'builtin',
			preset: blankPreset
		});
	});

	it('bypasses the User store for source=builtin', async () => {
		const loadUserComposition = vi.spyOn(userCompositionStore, 'loadUserComposition');

		const result = await load(createLoadEvent('blank', 'builtin'));

		assert.deepEqual(result, {
			status: 'ready',
			slug: 'blank',
			source: 'builtin',
			provenance: 'builtin',
			preset: getPresetBySlug('blank')
		});
		assert.equal(loadUserComposition.mock.calls.length, 0);
	});

	it('returns missing when neither User nor corpus composition exists', async () => {
		vi.spyOn(userCompositionStore, 'loadUserComposition').mockResolvedValueOnce(null);

		const result = await load(createLoadEvent('not-a-real-preset'));

		assert.deepEqual(result, {
			status: 'missing',
			slug: 'not-a-real-preset',
			source: null,
			provenance: null,
			preset: null
		});
	});

	it('logs and falls back to a built-in Preset when its optional User override fails', async () => {
		const cause = new Error('Store unavailable');
		vi.spyOn(userCompositionStore, 'loadUserComposition').mockRejectedValueOnce(cause);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const result = await load(createLoadEvent('blank'));

		assert.deepEqual(result, {
			status: 'ready',
			slug: 'blank',
			source: null,
			provenance: 'builtin',
			preset: blankPreset
		});
		assert.deepEqual(consoleError.mock.calls[0], [
			'Failed to load User composition; using built-in preset.',
			{ slug: 'blank', cause }
		]);
	});

	it('returns an error when a User-only composition fails to load', async () => {
		const cause = new Error('Store unavailable');
		vi.spyOn(userCompositionStore, 'loadUserComposition').mockRejectedValueOnce(cause);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const result = await load(createLoadEvent('user-only'));

		assert.deepEqual(result, {
			status: 'error',
			slug: 'user-only',
			source: null,
			provenance: null,
			preset: null
		});
		assert.deepEqual(consoleError.mock.calls[0], [
			'Failed to load composition route.',
			{ slug: 'user-only', source: null, cause }
		]);
	});
});
