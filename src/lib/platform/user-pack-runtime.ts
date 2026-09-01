/**
 * Loading a User Pack from the store into the running engine (ADR-0055).
 *
 * Pack resolution is a two-source chain: `PACK_REGISTRY` first, then the User
 * Pack store. `ensurePackLoaded` is the one place a slug crosses from the store
 * into the runtime — it fetches the document, registers its cached font faces,
 * and makes the manifest resolvable through `getPack` — and every path that can
 * name a pack (opening a composition, `appearance.set-pack`, readying
 * renderers) calls it first. A slug neither source holds resolves to `missing`
 * with a message that names the slug and the recovery; nothing substitutes
 * another look.
 */
import { PACK_REGISTRY } from './packs/registry';
import { registerUserPackFontFaces } from './user-pack-font-faces';
import { registerRuntimeUserPack, unregisterRuntimeUserPack } from './user-pack-runtime.svelte';
import { userPackStore, type UserPackDocument, type UserPackStore } from './user-pack-store';

export type PackResolution =
	| { kind: 'builtin'; slug: string }
	| { kind: 'user'; slug: string; document: UserPackDocument }
	| { kind: 'missing'; slug: string; reason: 'absent' | 'store-unreadable'; message: string };

export interface EnsurePackLoadedOptions {
	store?: UserPackStore;
	requestFetch?: typeof fetch;
	/** Ask the store again even when this slug is already loaded — after a save, for example. */
	refresh?: boolean;
}

const loadedUserPackDocuments = new Map<string, UserPackDocument>();

export function missingUserPackMessage(slug: string): string {
	return `Pack "${slug}" is not a built-in Pack, and the User Pack store holds nothing at that slug. Bind this composition to another Pack, or restore "${slug}" in the store.`;
}

/** The store document behind a loaded User Pack, or null for a built-in or an unloaded slug. */
export function loadedUserPackDocument(slug: string): UserPackDocument | null {
	return loadedUserPackDocuments.get(slug) ?? null;
}

/**
 * Put a store document into the runtime: faces registered against the
 * same-origin cache, manifest resolvable through `getPack`. Registering the
 * faces before the manifest means nothing can resolve the pack and capture
 * ahead of its fonts.
 */
export function activateUserPackDocument(slug: string, document: UserPackDocument): void {
	if (typeof globalThis.document !== 'undefined' && 'fonts' in globalThis.document) {
		registerUserPackFontFaces(document.fontFaces);
	}
	registerRuntimeUserPack({ ...document.manifest, slug });
	loadedUserPackDocuments.set(slug, document);
}

export function deactivateUserPack(slug: string): void {
	unregisterRuntimeUserPack(slug);
	loadedUserPackDocuments.delete(slug);
}

export async function ensurePackLoaded(
	slug: string,
	options: EnsurePackLoadedOptions = {}
): Promise<PackResolution> {
	if (Object.hasOwn(PACK_REGISTRY, slug)) return { kind: 'builtin', slug };
	const held = loadedUserPackDocuments.get(slug);
	if (held !== undefined && !options.refresh) return { kind: 'user', slug, document: held };

	let document: UserPackDocument | null;
	try {
		document = await (options.store ?? userPackStore).loadUserPack(slug, options.requestFetch);
	} catch (cause) {
		// A store that cannot answer is a failed resolution, not a substitution:
		// the composition stays unbound and the cause is in the message.
		console.error('Failed to read the User Pack store.', { slug, cause });
		return {
			kind: 'missing',
			slug,
			reason: 'store-unreadable',
			message: `Pack "${slug}" is not a built-in Pack, and the User Pack store could not be read: ${cause instanceof Error ? cause.message : String(cause)}. Retry once the store answers, or bind this composition to another Pack.`
		};
	}
	if (document === null) {
		// A pack the store dropped since it was loaded must stop resolving too.
		deactivateUserPack(slug);
		return { kind: 'missing', slug, reason: 'absent', message: missingUserPackMessage(slug) };
	}
	activateUserPackDocument(slug, document);
	return { kind: 'user', slug, document };
}
