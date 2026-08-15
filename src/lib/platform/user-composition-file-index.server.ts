import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const USER_COMPOSITION_STORE_DIR = join(process.cwd(), 'user-compositions');
let indexedUserCompositionSlugs: Promise<Set<string>> | undefined;

async function readUserCompositionSlugs(): Promise<Set<string>> {
	try {
		const entries = await readdir(USER_COMPOSITION_STORE_DIR);
		return new Set(
			entries.filter((entry) => entry.endsWith('.json')).map((entry) => entry.slice(0, -5))
		);
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
		throw cause;
	}
}

/** Avoid an HTTP subrequest and filesystem read when no User override exists. */
export async function userCompositionFileExists(slug: string): Promise<boolean> {
	indexedUserCompositionSlugs ??= readUserCompositionSlugs();
	return (await indexedUserCompositionSlugs).has(slug);
}

export async function addUserCompositionFileToIndex(slug: string): Promise<void> {
	indexedUserCompositionSlugs ??= readUserCompositionSlugs();
	(await indexedUserCompositionSlugs).add(slug);
}

export async function removeUserCompositionFileFromIndex(slug: string): Promise<void> {
	indexedUserCompositionSlugs ??= readUserCompositionSlugs();
	(await indexedUserCompositionSlugs).delete(slug);
}
