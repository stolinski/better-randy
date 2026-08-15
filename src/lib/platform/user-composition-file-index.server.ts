import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const USER_COMPOSITION_STORE_DIR = join(process.cwd(), 'user-compositions');
let indexedUserCompositionSlugs: Promise<Set<string> | null> | undefined;

async function readUserCompositionSlugs(): Promise<Set<string> | null> {
	try {
		const entries = await readdir(USER_COMPOSITION_STORE_DIR);
		return new Set(
			entries.filter((entry) => entry.endsWith('.json')).map((entry) => entry.slice(0, -5))
		);
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
		// The index is only an optimization. A transient directory read failure
		// must fall back to the authoritative API instead of taking down every route.
		console.error('Failed to index User composition files; using API lookup.', cause);
		return null;
	}
}

/** Avoid an HTTP subrequest and filesystem read when no User override exists. */
export async function userCompositionFileExists(slug: string): Promise<boolean | null> {
	indexedUserCompositionSlugs ??= readUserCompositionSlugs();
	return (await indexedUserCompositionSlugs)?.has(slug) ?? null;
}

export async function addUserCompositionFileToIndex(slug: string): Promise<void> {
	indexedUserCompositionSlugs ??= readUserCompositionSlugs();
	(await indexedUserCompositionSlugs)?.add(slug);
}

export async function removeUserCompositionFileFromIndex(slug: string): Promise<void> {
	indexedUserCompositionSlugs ??= readUserCompositionSlugs();
	(await indexedUserCompositionSlugs)?.delete(slug);
}
