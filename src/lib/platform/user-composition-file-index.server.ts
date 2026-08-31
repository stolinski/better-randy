import { readdir } from 'node:fs/promises';

import { resolveUserCompositionStoreLocation } from './user-composition-store-location.server';

// Keyed by store directory: the store's location is configuration, and a
// verification run in the same process must never read the primary store's index.
const indexedUserCompositionSlugsByDirectory = new Map<string, Promise<Set<string> | null>>();

async function readUserCompositionSlugs(storeDirectory: string): Promise<Set<string> | null> {
	try {
		const entries = await readdir(storeDirectory);
		return new Set(
			entries.filter((entry) => entry.endsWith('.json')).map((entry) => entry.slice(0, -5))
		);
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT')
			return new Set();
		// The index is only an optimization. A transient directory read failure
		// must fall back to the authoritative API instead of taking down every route.
		console.error('Failed to index User composition files; using API lookup.', cause);
		return null;
	}
}

/**
 * Null when there is no index to consult — either the store refuses to serve
 * this process, or a read failed — which sends the caller to the API instead.
 */
async function indexedUserCompositionSlugs(): Promise<Set<string> | null> {
	const resolution = resolveUserCompositionStoreLocation(process.env);
	if (resolution.kind === 'refused') return null;
	const { storeDirectory } = resolution.location;
	const indexed =
		indexedUserCompositionSlugsByDirectory.get(storeDirectory) ??
		readUserCompositionSlugs(storeDirectory);
	indexedUserCompositionSlugsByDirectory.set(storeDirectory, indexed);
	return indexed;
}

/** Avoid an HTTP subrequest and filesystem read when no User override exists. */
export async function userCompositionFileExists(slug: string): Promise<boolean | null> {
	return (await indexedUserCompositionSlugs())?.has(slug) ?? null;
}

export async function addUserCompositionFileToIndex(slug: string): Promise<void> {
	(await indexedUserCompositionSlugs())?.add(slug);
}

export async function removeUserCompositionFileFromIndex(slug: string): Promise<void> {
	(await indexedUserCompositionSlugs())?.delete(slug);
}
