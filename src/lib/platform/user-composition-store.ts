/**
 * The User composition store: one contract, two backends, and the configured
 * choice between them
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md),
 * [ADR-0053](../../../docs/adr/0053-gfx-namespace-and-legacy-supers-compatibility.md)).
 *
 * `origin` is the disk-backed development store this file implements: a typed
 * transport over `/api/user-compositions`, where composition JSON crosses the
 * network and lands on local disk. `browser` is the Public demo session's
 * browser-scoped store in `browser-user-composition-store`, where it never does.
 * `PUBLIC_GFX_COMPOSITION_STORE` picks one, and every caller — the GUI routes,
 * the WebMCP operation families, the preconditions — goes through the choice
 * made here, which is what makes the GUI and an agent share one store.
 *
 * Developing against the origin store is never permission to persist a
 * visitor's work on the public origin; a public host configures `browser`, and
 * the origin composition routes refuse when it does.
 */
import { env } from '$env/dynamic/public';
import { z } from 'zod';

import { createBrowserUserCompositionStore } from './browser-user-composition-store';
import { MediaSchema, SurfaceTypeSchema, type Preset } from './engine-schema';
import { parsePreset } from './preset-parser';
import { presetToWireFormat } from './preset-pure';
import {
	parseCompositionSessionStoreConfig,
	PUBLIC_COMPOSITION_SESSION_STORAGE_LIMITS
} from './public-runtime-contract';
import { UserCompositionNotHeldError } from './user-composition-store-errors';

const UserCompositionMediaStatusSchema = z.enum(['ready', 'missing', 'undecodable']);
const UserCompositionMediaIssueSchema = z.strictObject({
	assetIds: z.array(z.string().min(1)),
	assetUrl: z.string().min(1),
	status: z.enum(['missing', 'undecodable']),
	message: z.string().min(1)
});
const UserCompositionMetaSchema = z.strictObject({
	slug: z.string(),
	name: z.string(),
	forkedFrom: z.string().nullable(),
	savedAt: z.string(),
	posterKey: z.string().nullable(),
	durationSeconds: z.number().positive(),
	surfaceType: SurfaceTypeSchema,
	media: MediaSchema,
	mediaStatus: UserCompositionMediaStatusSchema,
	mediaIssues: z.array(UserCompositionMediaIssueSchema).optional()
});

export type UserCompositionMediaStatus = z.infer<typeof UserCompositionMediaStatusSchema>;
export type UserCompositionMediaIssue = z.infer<typeof UserCompositionMediaIssueSchema>;
export type UserCompositionMeta = z.infer<typeof UserCompositionMetaSchema>;

/**
 * What a store can say about its own capacity. The disk-backed development
 * store reports no ceiling — the origin's disk is not the visitor's allowance —
 * while the browser-scoped store measures both, which is what makes the session
 * catalog's numbers real.
 */
export interface CompositionSessionStorage {
	available: boolean;
	usedBytes: number | null;
	quotaBytes: number | null;
}

export interface UserCompositionStore {
	listUserCompositions(): Promise<UserCompositionMeta[]>;
	/** Resolve a slug to its stored User composition; null means no fork exists. */
	loadUserComposition(slug: string, requestFetch?: typeof fetch): Promise<Preset | null>;
	/** Create a User composition, optionally noting which corpus Preset it came from. */
	forkUserComposition(slug: string, preset: Preset, corpusSlug: string | null): Promise<void>;
	saveUserComposition(slug: string, preset: Preset): Promise<void>;
	deleteUserComposition(slug: string): Promise<void>;
	/** How much room this store has left, as far as it can measure it. */
	inspectStorage(): Promise<CompositionSessionStorage>;
}

const USER_COMPOSITION_API_BASE = '/api/user-compositions';

async function userCompositionFailureContext(response: Response): Promise<string> {
	const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
	try {
		const value: unknown = await response.json();
		if (isRecord(value) && typeof value.message === 'string' && value.message.length > 0) {
			return `${status}: ${value.message}`;
		}
	} catch {
		// A status without a response body is still actionable.
	}
	return status;
}

async function readUserCompositionResponseJson(
	response: Response,
	operation: string
): Promise<unknown> {
	try {
		return await response.json();
	} catch (cause) {
		throw new Error(`${operation}: invalid JSON response`, { cause });
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUserCompositionMetaList(value: unknown): UserCompositionMeta[] {
	if (!Array.isArray(value)) {
		throw new TypeError('Failed to list User compositions: response must be an array');
	}

	return value.map((entry, index) => {
		const result = UserCompositionMetaSchema.safeParse(entry);
		if (!result.success) {
			throw new TypeError(`Failed to list User compositions: invalid entry at index ${index}`);
		}
		return result.data;
	});
}

function parseUserComposition(value: unknown, slug: string): Preset | null {
	if (value === null) return null;
	try {
		return parsePreset(value);
	} catch (cause) {
		throw new TypeError(`Failed to load User composition "${slug}": invalid response`, { cause });
	}
}

/**
 * The disk-backed development store. Every call is a request to this origin, so
 * composition JSON leaves the browser — which is exactly why a public host does
 * not configure it.
 */
export const originUserCompositionStore: UserCompositionStore = {
	async listUserCompositions(): Promise<UserCompositionMeta[]> {
		const response = await fetch(USER_COMPOSITION_API_BASE);
		if (!response.ok) {
			throw new Error(
				`Failed to list User compositions: ${await userCompositionFailureContext(response)}`
			);
		}
		const value = await readUserCompositionResponseJson(
			response,
			'Failed to list User compositions'
		);
		return parseUserCompositionMetaList(value);
	},

	async loadUserComposition(slug: string, requestFetch = fetch): Promise<Preset | null> {
		const response = await requestFetch(`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`);
		if (!response.ok) {
			throw new Error(
				`Failed to load User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
		const value = await readUserCompositionResponseJson(
			response,
			`Failed to load User composition "${slug}"`
		);
		return parseUserComposition(value, slug);
	},

	async forkUserComposition(
		slug: string,
		preset: Preset,
		corpusSlug: string | null
	): Promise<void> {
		const response = await fetch(USER_COMPOSITION_API_BASE, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, preset: presetToWireFormat(preset), forkedFrom: corpusSlug })
		});
		if (!response.ok) {
			throw new Error(
				`Failed to fork User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
	},

	async saveUserComposition(slug: string, preset: Preset): Promise<void> {
		const response = await fetch(`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(presetToWireFormat(preset))
		});
		if (!response.ok) {
			throw new Error(
				`Failed to save User composition "${slug}": ${await userCompositionFailureContext(response)}`
			);
		}
	},

	async deleteUserComposition(slug: string): Promise<void> {
		const response = await fetch(`${USER_COMPOSITION_API_BASE}/${encodeURIComponent(slug)}`, {
			method: 'DELETE'
		});
		if (response.ok) return;
		const message = `Failed to delete User composition "${slug}": ${await userCompositionFailureContext(response)}`;
		// An origin holding nothing at this slug is a different answer from an
		// origin that would not answer, and reverting a fork depends on the
		// difference — see UserCompositionNotHeldError.
		if (response.status === 404) throw new UserCompositionNotHeldError(slug, message);
		throw new Error(message);
	},

	async inspectStorage(): Promise<CompositionSessionStorage> {
		return { available: true, usedBytes: null, quotaBytes: null };
	}
};

/**
 * Local storage, when this runtime has it. Resolved per call rather than once,
 * so a store constructed while rendering on the server still works in the
 * browser that actually holds the session. A browser with site data disabled
 * throws on the property itself, which is a storage refusal, not a crash.
 */
function resolveBrowserSessionStorage(): Storage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

const compositionSessionStoreConfig = parseCompositionSessionStoreConfig(env);

/**
 * The store this build serves. One object, shared by the GUI and by every
 * WebMCP operation, so both act on the same session across a reload.
 */
export const userCompositionStore: UserCompositionStore =
	compositionSessionStoreConfig.kind === 'browser'
		? createBrowserUserCompositionStore({
				resolveStorage: resolveBrowserSessionStorage,
				storageIdentity: compositionSessionStoreConfig.storageIdentity,
				limits: PUBLIC_COMPOSITION_SESSION_STORAGE_LIMITS
			})
		: originUserCompositionStore;
