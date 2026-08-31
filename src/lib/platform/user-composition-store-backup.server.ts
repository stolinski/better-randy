/**
 * Cheap, local, automatic snapshots of the User composition store.
 *
 * The 2026-08-29 loss was unrecoverable because no copy of the store existed
 * anywhere — no Time Machine, no snapshot, no cloud. Copying a few dozen small
 * JSON files costs nothing, so the store is snapshotted on every dev-server boot
 * and again immediately before any delete, and the last
 * `USER_COMPOSITION_SNAPSHOT_LIMIT` snapshots are kept.
 */
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { UserCompositionStoreLocation } from './user-composition-store-location.server';
import { trashTimestamp } from './user-composition-trash.server';

/** Enough history to survive a bad week of automation without unbounded growth. */
export const USER_COMPOSITION_SNAPSHOT_LIMIT = 20;

/** Why a snapshot was taken. Part of the directory name, so it stays greppable on disk. */
export type UserCompositionSnapshotReason = 'boot' | 'before-delete';

async function readStoredCompositionFileNames(storeDirectory: string): Promise<string[]> {
	try {
		const entries = await readdir(storeDirectory);
		return entries.filter((entry) => entry.endsWith('.json'));
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw cause;
	}
}

/**
 * Drop the oldest snapshots. Names lead with a UTC timestamp, so lexical order is
 * chronological order. This removes copies GFX made, never author artifacts.
 */
async function pruneUserCompositionSnapshots(backupsDirectory: string): Promise<void> {
	const snapshots = (await readdir(backupsDirectory)).sort();
	for (const stale of snapshots.slice(
		0,
		Math.max(0, snapshots.length - USER_COMPOSITION_SNAPSHOT_LIMIT)
	)) {
		await rm(join(backupsDirectory, stale), { recursive: true, force: true });
	}
}

/**
 * Copy every stored composition into a new timestamped snapshot directory.
 * Returns the snapshot path, or null when the store held nothing worth copying.
 */
export async function snapshotUserCompositionStore(
	location: UserCompositionStoreLocation,
	reason: UserCompositionSnapshotReason,
	now: Date = new Date()
): Promise<string | null> {
	const fileNames = await readStoredCompositionFileNames(location.storeDirectory);
	if (fileNames.length === 0) return null;

	const snapshotDirectory = join(location.backupsDirectory, `${trashTimestamp(now)}-${reason}`);
	await mkdir(snapshotDirectory, { recursive: true });
	for (const fileName of fileNames) {
		await copyFile(join(location.storeDirectory, fileName), join(snapshotDirectory, fileName));
	}
	await pruneUserCompositionSnapshots(location.backupsDirectory);
	return snapshotDirectory;
}
