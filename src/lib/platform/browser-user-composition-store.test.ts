import assert from 'node:assert/strict';

import { beforeEach, describe, it, vi } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import {
	createBrowserUserCompositionStore,
	isCompositionSessionStorageError,
	type CompositionSessionStorageFailureCode
} from './browser-user-composition-store';
import { parsePresetIngress } from './preset-ingress';
import { presetToWireFormat } from './preset-pure';

import type { Preset } from './engine-schema';
import type { PublicCompositionSessionStorageLimits } from './public-runtime-contract';
import type { UserCompositionStore } from './user-composition-store';

const STORAGE_IDENTITY = 'gfx-composition-session@1';

/** A synchronous key/value area with the parts of `Storage` this store uses. */
class FakeSessionStorage implements Storage {
	readonly entries = new Map<string, string>();
	/** Set to refuse writes the way a browser at its own ceiling does. */
	refuseWrites = false;

	get length(): number {
		return this.entries.size;
	}

	key(index: number): string | null {
		return [...this.entries.keys()][index] ?? null;
	}

	getItem(key: string): string | null {
		return this.entries.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		if (this.refuseWrites) throw new Error('QuotaExceededError');
		this.entries.set(key, value);
	}

	removeItem(key: string): void {
		this.entries.delete(key);
	}

	clear(): void {
		this.entries.clear();
	}
}

const generousLimits: PublicCompositionSessionStorageLimits = {
	maxStorageBytes: 4 * 1024 * 1024,
	maxCompositionBytes: 1024 * 1024
};

let storage: FakeSessionStorage;
let blankPreset: Preset;

function createStore(
	limits: PublicCompositionSessionStorageLimits = generousLimits,
	resolveStorage: () => Storage | null = () => storage
): UserCompositionStore {
	return createBrowserUserCompositionStore({
		resolveStorage,
		storageIdentity: STORAGE_IDENTITY,
		limits
	});
}

function storageFailureCode(cause: unknown): CompositionSessionStorageFailureCode {
	if (!isCompositionSessionStorageError(cause)) {
		throw new Error(`Expected a session storage refusal but got: ${String(cause)}`);
	}
	return cause.code;
}

function namedPreset(name: string): Preset {
	return parsePresetIngress({ ...blankPresetJson, name });
}

beforeEach(() => {
	storage = new FakeSessionStorage();
	blankPreset = parsePresetIngress(blankPresetJson);
});

describe('browser-scoped composition session store', () => {
	it('keeps a forked composition in the browser, under the configured identity', async () => {
		const store = createStore();

		await store.forkUserComposition('untitled', blankPreset, 'blank');

		assert.deepEqual([...storage.entries.keys()], [`${STORAGE_IDENTITY}:untitled`]);
		assert.deepEqual(await store.loadUserComposition('untitled'), blankPreset);
	});

	it('reads back what an earlier page load wrote, which is what surviving a reload means', async () => {
		await createStore().forkUserComposition('untitled', blankPreset, 'blank');

		const reloaded = createStore();

		assert.deepEqual(await reloaded.loadUserComposition('untitled'), blankPreset);
		const [entry] = await reloaded.listUserCompositions();
		assert.equal(entry?.slug, 'untitled');
		assert.equal(entry?.forkedFrom, 'blank');
	});

	it('answers null for a slug this session never forked', async () => {
		assert.equal(await createStore().loadUserComposition('lower-third'), null);
	});

	it('keeps the Starter a composition was cut from across a save', async () => {
		const store = createStore();
		await store.forkUserComposition('untitled', blankPreset, 'blank');

		await store.saveUserComposition('untitled', namedPreset('Renamed'));

		const [entry] = await store.listUserCompositions();
		assert.equal(entry?.forkedFrom, 'blank');
		assert.equal(entry?.name, 'Renamed');
	});

	it('lists the session most recently saved first', async () => {
		const store = createStore();
		await store.forkUserComposition('first', namedPreset('First'), null);
		await store.forkUserComposition('second', namedPreset('Second'), null);
		// Two forks in the same millisecond would tie; make the order the stored
		// timestamps' order rather than insertion order.
		storage.entries.set(
			`${STORAGE_IDENTITY}:first`,
			JSON.stringify({
				forkedFrom: null,
				savedAt: '2026-08-29T12:00:00.000Z',
				preset: presetToWireFormat(namedPreset('First'))
			})
		);
		storage.entries.set(
			`${STORAGE_IDENTITY}:second`,
			JSON.stringify({
				forkedFrom: null,
				savedAt: '2026-08-29T13:00:00.000Z',
				preset: presetToWireFormat(namedPreset('Second'))
			})
		);

		const entries = await store.listUserCompositions();

		assert.deepEqual(
			entries.map((entry) => entry.slug),
			['second', 'first']
		);
	});

	it('deletes one composition and refuses a slug it does not hold', async () => {
		const store = createStore();
		await store.forkUserComposition('untitled', blankPreset, null);

		await store.deleteUserComposition('untitled');

		assert.deepEqual(await store.listUserCompositions(), []);
		await assert.rejects(store.deleteUserComposition('untitled'), /this session holds none/);
	});

	it('ignores records outside its identity, so another origin key is not a composition', async () => {
		const store = createStore();
		await store.forkUserComposition('untitled', blankPreset, null);
		storage.entries.set('some-other-app:untitled', JSON.stringify({ hello: 'world' }));

		const entries = await store.listUserCompositions();

		assert.deepEqual(
			entries.map((entry) => entry.slug),
			['untitled']
		);
	});

	it('drops a record it cannot parse rather than failing the whole listing', async () => {
		const store = createStore();
		await store.forkUserComposition('untitled', blankPreset, null);
		storage.entries.set(`${STORAGE_IDENTITY}:half-written`, '{"forkedFrom":null,"saved');
		storage.entries.set(
			`${STORAGE_IDENTITY}:not-a-composition`,
			JSON.stringify({ forkedFrom: null, savedAt: '2026-08-29T12:00:00.000Z', preset: { no: 1 } })
		);

		const entries = await store.listUserCompositions();

		assert.deepEqual(
			entries.map((entry) => entry.slug),
			['untitled']
		);
		assert.equal(await store.loadUserComposition('not-a-composition'), null);
	});

	it('refuses a slug that would not be addressable as /p/<slug>', async () => {
		await assert.rejects(
			createStore().forkUserComposition('Not A Slug', blankPreset, null),
			TypeError
		);
		assert.equal(storage.length, 0);
	});

	it('reports what it holds against the ratified ceiling', async () => {
		const store = createStore();
		const empty = await store.inspectStorage();
		assert.deepEqual(empty, {
			available: true,
			usedBytes: 0,
			quotaBytes: generousLimits.maxStorageBytes
		});

		await store.forkUserComposition('untitled', blankPreset, null);

		const used = await store.inspectStorage();
		assert.equal(used.available, true);
		assert.ok((used.usedBytes ?? 0) > 0);
		assert.equal(used.quotaBytes, generousLimits.maxStorageBytes);
	});

	it('refuses one composition larger than a composition may be', async () => {
		const store = createStore({ maxStorageBytes: 4 * 1024 * 1024, maxCompositionBytes: 64 });

		const cause = await store.forkUserComposition('untitled', blankPreset, null).catch((e) => e);

		assert.equal(storageFailureCode(cause), 'limit_exceeded');
		assert.equal(storage.length, 0);
	});

	it('refuses a save the session has no room left for, naming the way out', async () => {
		const store = createStore();
		await store.forkUserComposition('first', namedPreset('First'), null);
		const held = (await store.inspectStorage()).usedBytes ?? 0;
		const tight = createStore({
			maxStorageBytes: held + 64,
			maxCompositionBytes: 1024 * 1024
		});

		const cause = await tight.forkUserComposition('second', namedPreset('Second'), null).catch(
			(e) => e
		);

		assert.equal(storageFailureCode(cause), 'quota_exceeded');
		assert.ok(cause instanceof Error && cause.message.includes('delete a composition'));
		assert.deepEqual(
			(await store.listUserCompositions()).map((entry) => entry.slug),
			['first']
		);
	});

	it('leaves the previous record intact when the browser refuses the write itself', async () => {
		const store = createStore();
		await store.forkUserComposition('untitled', blankPreset, null);
		storage.refuseWrites = true;

		const cause = await store
			.saveUserComposition('untitled', namedPreset('Renamed'))
			.catch((e) => e);

		assert.equal(storageFailureCode(cause), 'quota_exceeded');
		storage.refuseWrites = false;
		assert.equal((await store.loadUserComposition('untitled'))?.name, blankPreset.name);
	});

	it('completes a whole session without reaching the network once', async () => {
		// The point of the browser-scoped session: composition JSON never leaves the
		// browser, so a full create-edit-list-reload-discard cycle makes no request.
		const reachedNetwork = vi.fn<typeof fetch>(() => {
			throw new Error('The browser-scoped session store must never reach the network.');
		});
		vi.stubGlobal('fetch', reachedNetwork);
		try {
			const store = createStore();
			await store.forkUserComposition('untitled', blankPreset, 'blank');
			await store.saveUserComposition('untitled', namedPreset('Edited'));
			await store.listUserCompositions();
			await store.loadUserComposition('untitled');
			await store.inspectStorage();
			await store.deleteUserComposition('untitled');
		} finally {
			vi.unstubAllGlobals();
		}

		assert.equal(reachedNetwork.mock.calls.length, 0);
	});

	it('refuses every operation when this runtime exposes no local storage', async () => {
		const store = createStore(generousLimits, () => null);

		assert.deepEqual(await store.inspectStorage(), {
			available: false,
			usedBytes: null,
			quotaBytes: null
		});
		assert.equal(storageFailureCode(await store.listUserCompositions().catch((e) => e)), 'storage_unavailable');
		assert.equal(
			storageFailureCode(await store.forkUserComposition('untitled', blankPreset, null).catch((e) => e)),
			'storage_unavailable'
		);
	});
});
