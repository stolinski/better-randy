import assert from 'node:assert/strict';

import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { PresetSchema, type Preset } from './engine-schema';
import { presetToWireFormat } from './preset-pure';
import { userCompositionStore } from './user-composition-store';

const blankPreset: Preset = PresetSchema.parse(blankPresetJson);
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(value: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { 'content-type': 'application/json' },
		...init
	});
}

function requestBodyAt(index: number): unknown {
	const requestInit = fetchMock.mock.calls[index]?.[1];
	const body = requestInit?.body;
	if (typeof body !== 'string') {
		throw new TypeError(`Expected request ${index} to carry a string body`);
	}
	return JSON.parse(body);
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('userCompositionStore', () => {
	it('lists User compositions with the collection GET and parses metadata', async () => {
		const metadata = [
			{
				slug: 'blank-copy',
				name: 'Blank copy',
				forkedFrom: 'blank',
				savedAt: '2026-07-21T12:00:00.000Z'
			}
		];
		fetchMock.mockResolvedValueOnce(jsonResponse(metadata));

		const result = await userCompositionStore.listUserCompositions();

		assert.deepEqual(result, metadata);
		assert.deepEqual(fetchMock.mock.calls[0], ['/api/user-compositions']);
	});

	it('loads an encoded User composition slug and preserves null as the no-fork response', async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse(presetToWireFormat(blankPreset)))
			.mockResolvedValueOnce(jsonResponse(null));

		const loaded = await userCompositionStore.loadUserComposition('blank copy');
		const missing = await userCompositionStore.loadUserComposition('missing');

		assert.deepEqual(loaded, blankPreset);
		assert.equal(missing, null);
		assert.deepEqual(fetchMock.mock.calls[0], ['/api/user-compositions/blank%20copy']);
		assert.deepEqual(fetchMock.mock.calls[1], ['/api/user-compositions/missing']);
	});

	it('forks with POST and serializes the standalone Preset to the existing wire format', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ slug: 'blank-copy' }, { status: 201 }));

		await userCompositionStore.forkUserComposition('blank-copy', blankPreset, 'blank');

		const [url, requestInit] = fetchMock.mock.calls[0];
		assert.equal(url, '/api/user-compositions');
		assert.equal(requestInit?.method, 'POST');
		assert.deepEqual(requestInit?.headers, { 'Content-Type': 'application/json' });
		const body = requestBodyAt(0) as {
			slug: unknown;
			preset: { state: { surface: { content: { body: unknown } } } };
			forkedFrom: unknown;
		};
		assert.equal(body.slug, 'blank-copy');
		assert.equal(body.forkedFrom, 'blank');
		assert.equal(body.preset.state.surface.content.body, '');
	});

	it('maps save and delete to the slug PUT and DELETE routes', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await userCompositionStore.saveUserComposition('blank copy', blankPreset);
		await userCompositionStore.deleteUserComposition('blank copy');

		assert.equal(fetchMock.mock.calls[0]?.[0], '/api/user-compositions/blank%20copy');
		assert.equal(fetchMock.mock.calls[0]?.[1]?.method, 'PUT');
		const savedPreset = requestBodyAt(0) as {
			state: { surface: { content: { body: unknown } } };
		};
		assert.equal(savedPreset.state.surface.content.body, '');
		assert.deepEqual(fetchMock.mock.calls[1], [
			'/api/user-compositions/blank%20copy',
			{ method: 'DELETE' }
		]);
	});

	it('includes the operation, slug, status, and status text in HTTP failures', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(null, { status: 503, statusText: 'Store unavailable' })
		);

		await assert.rejects(
			userCompositionStore.loadUserComposition('blank-copy'),
			/Failed to load User composition "blank-copy": 503 Store unavailable/
		);
	});

	it('includes an actionable API error message in HTTP failures', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ message: 'Invalid preset: state.surface is required' }, { status: 400 })
		);

		await assert.rejects(
			userCompositionStore.saveUserComposition('blank-copy', blankPreset),
			/400: Invalid preset: state\.surface is required/
		);
	});

	it('rejects malformed list, load, and JSON responses with parsing context', async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse([{ slug: 'missing-fields' }]))
			.mockResolvedValueOnce(jsonResponse({ schema: 'not-supers', state: {} }))
			.mockResolvedValueOnce(new Response('{broken json'));

		await assert.rejects(
			userCompositionStore.listUserCompositions(),
			/Failed to list User compositions: invalid entry at index 0/
		);
		await assert.rejects(
			userCompositionStore.loadUserComposition('invalid'),
			/Failed to load User composition "invalid": invalid response/
		);
		await assert.rejects(
			userCompositionStore.listUserCompositions(),
			/Failed to list User compositions: invalid JSON response/
		);
	});
});
