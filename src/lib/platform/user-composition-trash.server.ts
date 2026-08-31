/**
 * Deleting a User composition never destroys it.
 *
 * `unlink` is not a code path over user artifacts any more. A delete renames the
 * file into a trash directory beside the store, where the author can retrieve it
 * with Finder and where no amount of automation can lose it. Trash sits on the
 * same volume as the store by construction, so the rename is atomic and never
 * degrades into copy-then-remove.
 */
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

import type { UserCompositionStoreLocation } from './user-composition-store-location.server';

/** Sortable, path-safe, and second-resolution — enough to keep repeated deletes of one slug apart. */
export function trashTimestamp(now: Date = new Date()): string {
	return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Move `<store>/<slug>.json` into trash. Returns false when there was nothing to
 * delete, so the route can answer 404 without treating absence as a failure.
 */
export async function moveUserCompositionToTrash(
	location: UserCompositionStoreLocation,
	slug: string,
	now: Date = new Date()
): Promise<boolean> {
	await mkdir(location.trashDirectory, { recursive: true });
	const trashedPath = join(location.trashDirectory, `${trashTimestamp(now)}-${slug}.json`);
	try {
		await rename(join(location.storeDirectory, `${slug}.json`), trashedPath);
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw cause;
	}
	return true;
}
