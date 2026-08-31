/**
 * What the User composition store does before the host serves its first request:
 * move anything still sitting in the old in-repo folder into app data, then take
 * a boot snapshot.
 *
 * Both steps are best-effort. A dev server that cannot snapshot is still a dev
 * server, and failing to boot over a backup would trade a small risk for a
 * certain outage — so a failure is logged with context and the host serves on.
 */
import { mkdir, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { parseCompositionSessionStoreConfig } from './public-runtime-contract';
import { snapshotUserCompositionStore } from './user-composition-store-backup.server';
import { resolveUserCompositionStoreLocation } from './user-composition-store-location.server';

/**
 * Where compositions lived until 2026-08-31: inside the checkout, one stray
 * `cwd` away from any process that started in the repository root.
 */
export function legacyRepositoryStoreDirectory(workingDirectory: string): string {
	return join(workingDirectory, 'user-compositions');
}

/**
 * Move every legacy composition into the app-data store. A slug that already
 * exists in app data is left alone — the app-data copy is the live one, and a
 * stale in-repo file must never overwrite it. Returns how many files moved.
 */
export async function migrateLegacyRepositoryCompositions(
	legacyDirectory: string,
	storeDirectory: string
): Promise<number> {
	let legacyFileNames: string[];
	try {
		legacyFileNames = (await readdir(legacyDirectory)).filter((entry) => entry.endsWith('.json'));
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') return 0;
		throw cause;
	}
	if (legacyFileNames.length === 0) return 0;

	await mkdir(storeDirectory, { recursive: true });
	const alreadyStored = new Set(await readdir(storeDirectory));
	let moved = 0;
	for (const fileName of legacyFileNames) {
		if (alreadyStored.has(fileName)) continue;
		await rename(join(legacyDirectory, fileName), join(storeDirectory, fileName));
		moved += 1;
	}
	return moved;
}

/**
 * Run the store's boot work for this host. Does nothing when the origin serves a
 * browser-scoped session (there is no disk store to protect) or when this is a
 * verification run (whose jail is throwaway, and which must not read the real
 * store to migrate into it).
 */
export async function startUserCompositionStore(
	env: Readonly<Record<string, string | undefined>>,
	workingDirectory: string = process.cwd()
): Promise<void> {
	if (parseCompositionSessionStoreConfig(env).kind !== 'origin') return;
	const resolution = resolveUserCompositionStoreLocation(env);
	if (resolution.kind === 'refused') {
		console.error(`User composition store not served: ${resolution.reason}`);
		return;
	}
	if (resolution.location.isVerificationRun) return;

	try {
		const moved = await migrateLegacyRepositoryCompositions(
			legacyRepositoryStoreDirectory(workingDirectory),
			resolution.location.storeDirectory
		);
		if (moved > 0) {
			console.log(
				`Moved ${moved} User composition(s) out of the repository into ${resolution.location.storeDirectory}.`
			);
		}
		const snapshot = await snapshotUserCompositionStore(resolution.location, 'boot');
		if (snapshot !== null) console.log(`User composition store snapshotted to ${snapshot}.`);
	} catch (cause) {
		console.error('User composition store boot failed; serving without a fresh snapshot.', cause);
	}
}
