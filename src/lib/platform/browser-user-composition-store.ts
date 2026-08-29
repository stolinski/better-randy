/**
 * The browser-scoped composition store a Public demo session runs on
 * ([ADR-0053](../../../docs/adr/0053-gfx-namespace-and-legacy-supers-compatibility.md),
 * [ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md)).
 *
 * Every record lives in the visitor's own browser under one configured storage
 * identity. Nothing here is ever sent to the origin, associated with an account,
 * or written to origin disk: a reload continues the same session because the
 * browser still holds it, and clearing the browser's storage ends it with
 * nothing surviving on our side.
 *
 * Synchronous local storage is the backing store on purpose. A composition is a
 * small JSON document, the whole session is a handful of them, and a store the
 * session can measure exactly is what makes quota accounting real — browsers
 * report neither the ceiling nor the usage of this area, so the session accounts
 * for itself against the ratified limits instead of discovering the browser's
 * own limit as a thrown write in the middle of an autosave.
 *
 * Storage is a trust boundary even though this process wrote it: another tab, an
 * older release, or a person with devtools open can leave a record behind. Reads
 * therefore parse through the same ingress every other document crosses and drop
 * what does not survive it, rather than trusting the shape they find.
 *
 * That same ingress is what makes an older release's record recoverable rather
 * than lost. A record left behind in a Legacy Supers shape (ADR-0053) still
 * opens, and reading it rewrites it in its current form once, so the session
 * stops carrying an upgrade it has already performed.
 */
import { posterKeyForPreset } from './posters';
import { parsePresetIngress, readCompositionLegacyUpgrades } from './preset-ingress';
import { presetToWireFormat } from './preset-pure';
import { validatePresetSemantics } from './preset-validation';
import { COMPOSITION_SESSION_SLUG_PATTERN } from '../utils/composition-session-slug';

import type { Preset } from './engine-schema';
import type { PublicCompositionSessionStorageLimits } from './public-runtime-contract';
import type {
	CompositionSessionStorage,
	UserCompositionMeta,
	UserCompositionStore
} from './user-composition-store';

/** Why a browser-scoped store refused, in the operation contract's own codes. */
export type CompositionSessionStorageFailureCode =
	| 'storage_unavailable'
	| 'quota_exceeded'
	| 'limit_exceeded';

/**
 * A refusal the session store raises about its own storage, carrying the
 * corrective code an operation reports rather than collapsing every storage
 * problem into "the store did not respond".
 */
export class CompositionSessionStorageError extends Error {
	readonly code: CompositionSessionStorageFailureCode;

	constructor(code: CompositionSessionStorageFailureCode, message: string) {
		super(message);
		this.name = 'CompositionSessionStorageError';
		this.code = code;
	}
}

export function isCompositionSessionStorageError(
	value: unknown
): value is CompositionSessionStorageError {
	return value instanceof CompositionSessionStorageError;
}

/**
 * The stored envelope: the composition's wire format plus the provenance the
 * Preset itself does not carry. Same split as the development store's disk
 * format, so a composition means the same thing in either one.
 */
interface StoredBrowserUserComposition {
	forkedFrom: string | null;
	savedAt: string;
	preset: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredBrowserUserComposition(value: unknown): value is StoredBrowserUserComposition {
	if (!isRecord(value)) return false;
	return (
		(value.forkedFrom === null || typeof value.forkedFrom === 'string') &&
		typeof value.savedAt === 'string' &&
		isRecord(value.preset)
	);
}

export interface BrowserUserCompositionStoreOptions {
	/**
	 * Resolves the backing area at each call rather than at construction, so a
	 * store built during server-side rendering still works once the browser that
	 * actually holds the session runs it.
	 */
	resolveStorage: () => Storage | null;
	storageIdentity: string;
	limits: PublicCompositionSessionStorageLimits;
}

/** One composition parsed out of storage. */
interface BrowserSessionRecord {
	slug: string;
	forkedFrom: string | null;
	savedAt: string;
	preset: Preset;
}

/**
 * Bytes one key and its value occupy. Local storage holds UTF-16, and browsers
 * charge two bytes per code unit against the origin's allowance, so this is the
 * same unit the browser's own ceiling is expressed in.
 */
function storedRecordBytes(key: string, value: string): number {
	return (key.length + value.length) * 2;
}

export function createBrowserUserCompositionStore(
	options: BrowserUserCompositionStoreOptions
): UserCompositionStore {
	const keyPrefix = `${options.storageIdentity}:`;

	function requireStorage(): Storage {
		const storage = options.resolveStorage();
		if (!storage) {
			throw new CompositionSessionStorageError(
				'storage_unavailable',
				'This browser exposes no local storage, so a composition has nowhere to live. Leave private browsing or allow site data, then reload.'
			);
		}
		return storage;
	}

	function storageKeyForSlug(slug: string): string {
		return `${keyPrefix}${slug}`;
	}

	function requireStorableSlug(slug: string): string {
		if (!COMPOSITION_SESSION_SLUG_PATTERN.test(slug)) {
			throw new TypeError(
				`"${slug}" is not a composition slug this session can store; use lowercase letters, digits, hyphens, and underscores.`
			);
		}
		return slug;
	}

	function readRecordAt(storage: Storage, key: string): BrowserSessionRecord | null {
		if (!key.startsWith(keyPrefix)) return null;
		const slug = key.slice(keyPrefix.length);
		if (!COMPOSITION_SESSION_SLUG_PATTERN.test(slug)) return null;

		const raw = storage.getItem(key);
		if (raw === null || raw.trim().length === 0) return null;

		let stored: unknown;
		try {
			stored = JSON.parse(raw);
		} catch {
			return null;
		}
		if (!isStoredBrowserUserComposition(stored)) return null;

		let preset: Preset;
		try {
			preset = parsePresetIngress(stored.preset);
		} catch {
			return null;
		}
		if (validatePresetSemantics(preset).length > 0) return null;

		if (readCompositionLegacyUpgrades(stored.preset).length > 0) {
			migrateStoredRecord(storage, key, stored, preset);
		}

		return { slug, forkedFrom: stored.forkedFrom, savedAt: stored.savedAt, preset };
	}

	/**
	 * Rewrite a record an older release left in a Legacy Supers shape as the
	 * document this release writes, keeping its provenance and its save time so a
	 * migration never looks like an edit.
	 *
	 * Best effort on purpose. The upgraded body can be larger than the one it
	 * replaces, and a browser already at its own ceiling may refuse the write; the
	 * record then stays legacy, still opens through ingress, and is offered the
	 * same migration on the next read. A refused rewrite must never turn reading a
	 * composition into a failure.
	 */
	function migrateStoredRecord(
		storage: Storage,
		key: string,
		stored: StoredBrowserUserComposition,
		preset: Preset
	): void {
		try {
			storage.setItem(key, JSON.stringify({ ...stored, preset: presetToWireFormat(preset) }));
		} catch {
			// The legacy record is intact and still readable; leaving it is the safe answer.
		}
	}

	function readAllRecords(storage: Storage): BrowserSessionRecord[] {
		const records: BrowserSessionRecord[] = [];
		for (const key of sessionKeys(storage)) {
			const record = readRecordAt(storage, key);
			if (record) records.push(record);
		}
		return records.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
	}

	function sessionKeys(storage: Storage): string[] {
		const keys: string[] = [];
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (key !== null && key.startsWith(keyPrefix)) keys.push(key);
		}
		return keys;
	}

	/**
	 * What this session occupies, by weight rather than by content. Accounting
	 * never parses: a record too corrupt to open still holds its bytes, and an
	 * autosave asks this on every keystroke it settles.
	 */
	function occupiedStorageBytes(storage: Storage, exceptKey?: string): number {
		let total = 0;
		for (const key of sessionKeys(storage)) {
			if (key === exceptKey) continue;
			total += storedRecordBytes(key, storage.getItem(key) ?? '');
		}
		return total;
	}

	/**
	 * Write one record, having first proved the session can hold it. The
	 * composition ceiling is per document and the session ceiling is the whole
	 * store minus whatever this slug already occupies, because a save replaces its
	 * own record rather than adding to it.
	 */
	function writeRecord(
		storage: Storage,
		slug: string,
		record: StoredBrowserUserComposition
	): void {
		const key = storageKeyForSlug(slug);
		const serialized = JSON.stringify(record);
		const bytes = storedRecordBytes(key, serialized);

		if (bytes > options.limits.maxCompositionBytes) {
			throw new CompositionSessionStorageError(
				'limit_exceeded',
				`"${slug}" is ${bytes} bytes and one composition may occupy ${options.limits.maxCompositionBytes}; remove content or media references before saving it.`
			);
		}

		const occupiedBytes = occupiedStorageBytes(storage, key);
		if (occupiedBytes + bytes > options.limits.maxStorageBytes) {
			throw new CompositionSessionStorageError(
				'quota_exceeded',
				`This browser session holds ${occupiedBytes} of ${options.limits.maxStorageBytes} bytes and "${slug}" needs ${bytes} more; delete a composition it no longer needs first.`
			);
		}

		try {
			storage.setItem(key, serialized);
		} catch (cause) {
			// The browser's own ceiling can still be lower than the ratified one. A
			// refused write leaves the record that was already there untouched, so
			// this reports the refusal rather than repairing anything.
			throw new CompositionSessionStorageError(
				'quota_exceeded',
				`This browser refused to store "${slug}": ${cause instanceof Error ? cause.message : 'its own storage limit was reached'}.`
			);
		}
	}

	function metaForRecord(record: BrowserSessionRecord): UserCompositionMeta {
		return {
			slug: record.slug,
			name: record.preset.name,
			forkedFrom: record.forkedFrom,
			savedAt: record.savedAt,
			posterKey: posterKeyForPreset(record.preset),
			durationSeconds: record.preset.state.transport.durationSeconds,
			surfaceType: record.preset.state.surface.type,
			media: record.preset.state.media,
			// `missing` and `undecodable` describe an asset the origin was asked for
			// and could not serve. A browser-scoped session asks the origin for
			// nothing, so there is no such answer to report here; a media asset this
			// session cannot decode surfaces where it is decoded, at render time.
			mediaStatus: 'ready'
		};
	}

	return {
		async listUserCompositions(): Promise<UserCompositionMeta[]> {
			return readAllRecords(requireStorage()).map(metaForRecord);
		},

		async loadUserComposition(slug: string): Promise<Preset | null> {
			const storage = requireStorage();
			return readRecordAt(storage, storageKeyForSlug(slug))?.preset ?? null;
		},

		async forkUserComposition(
			slug: string,
			preset: Preset,
			corpusSlug: string | null
		): Promise<void> {
			const storage = requireStorage();
			writeRecord(storage, requireStorableSlug(slug), {
				forkedFrom: corpusSlug,
				savedAt: new Date().toISOString(),
				preset: presetToWireFormat(preset)
			});
		},

		async saveUserComposition(slug: string, preset: Preset): Promise<void> {
			const storage = requireStorage();
			const existing = readRecordAt(storage, storageKeyForSlug(slug));
			writeRecord(storage, requireStorableSlug(slug), {
				// A save keeps the Starter this composition was cut from; only a fork
				// decides that, and it decided it once.
				forkedFrom: existing?.forkedFrom ?? null,
				savedAt: new Date().toISOString(),
				preset: presetToWireFormat(preset)
			});
		},

		async deleteUserComposition(slug: string): Promise<void> {
			const storage = requireStorage();
			const key = storageKeyForSlug(slug);
			if (storage.getItem(key) === null) {
				throw new Error(`Failed to delete User composition "${slug}": this session holds none.`);
			}
			storage.removeItem(key);
		},

		async inspectStorage(): Promise<CompositionSessionStorage> {
			const storage = options.resolveStorage();
			if (!storage) return { available: false, usedBytes: null, quotaBytes: null };
			return {
				available: true,
				usedBytes: occupiedStorageBytes(storage),
				quotaBytes: options.limits.maxStorageBytes
			};
		}
	};
}
