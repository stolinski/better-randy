/**
 * The User Packs loaded into this engine, as reactive state (ADR-0055).
 *
 * `getPack` resolves built-ins first and then asks the runtime source this
 * module installs. Two records back it: the documents as the store last saved
 * them, and — per slug, while the author edits — a preview manifest that
 * re-dresses the render ahead of the autosave. Both are `$state.raw` and
 * replaced whole on every change, so a `$derived` that read a pack through
 * `getPack` re-runs when that pack is loaded, previewed, replaced after a save,
 * or unloaded — the same way it already re-runs when `packState.slug` changes.
 * Nothing here touches the network; the loading lives in `user-pack-runtime.ts`.
 *
 * Node never imports this module, which is what keeps every script and
 * deliverable gate on the built-in registry alone.
 */
import { installRuntimePackSource, PACK_REGISTRY } from './packs/registry';
import type { PackManifest } from './packs/types';
import type { UserPackDocument } from './user-pack-store';

let loadedUserPacks = $state.raw<Readonly<Record<string, UserPackDocument>>>({});
let previewManifests = $state.raw<Readonly<Record<string, PackManifest>>>({});

function manifestFor(slug: string): PackManifest | undefined {
	return previewManifests[slug] ?? loadedUserPacks[slug]?.manifest;
}

installRuntimePackSource({
	read: manifestFor,
	list: () =>
		Object.keys(loadedUserPacks)
			.map(manifestFor)
			.filter((manifest): manifest is PackManifest => manifest !== undefined)
});

function withoutKey<T>(
	record: Readonly<Record<string, T>>,
	slug: string
): Readonly<Record<string, T>> {
	if (!Object.hasOwn(record, slug)) return record;
	const next = { ...record };
	delete next[slug];
	return next;
}

/**
 * Make a store document resolvable through `getPack`. A re-registration
 * replaces the previous document and drops any preview: what the store just
 * saved is the look again.
 */
export function registerLoadedUserPack(slug: string, document: UserPackDocument): void {
	if (PACK_REGISTRY[slug] !== undefined) {
		throw new Error(
			`User Pack "${slug}" would shadow the built-in Pack of the same slug; the store never admits one`
		);
	}
	loadedUserPacks = {
		...loadedUserPacks,
		[slug]: { ...document, manifest: { ...document.manifest, slug } }
	};
	previewManifests = withoutKey(previewManifests, slug);
}

/**
 * Re-dress a loaded pack with an unsaved draft. The saved document is
 * untouched, so a refused save can put it back with `clearLoadedUserPackPreview`.
 */
export function previewLoadedUserPackManifest(slug: string, manifest: PackManifest): void {
	if (loadedUserPacks[slug] === undefined) {
		throw new Error(`User Pack "${slug}" is not loaded, so it cannot be previewed`);
	}
	previewManifests = { ...previewManifests, [slug]: { ...manifest, slug } };
}

/** Back to the look the store holds. */
export function clearLoadedUserPackPreview(slug: string): void {
	previewManifests = withoutKey(previewManifests, slug);
}

export function unregisterLoadedUserPack(slug: string): void {
	loadedUserPacks = withoutKey(loadedUserPacks, slug);
	previewManifests = withoutKey(previewManifests, slug);
}

/** The store document behind a loaded User Pack — as last saved, never the preview — or null. Reactive. */
export function loadedUserPackDocument(slug: string): UserPackDocument | null {
	return loadedUserPacks[slug] ?? null;
}
