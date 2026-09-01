/**
 * Where User Packs and their materialized fonts live on disk (ADR-0055).
 *
 * Both sit beside the User composition store as siblings of it — the same
 * arrangement `trash` and `backups` already use — so one configured store
 * directory anchors every disk-backed development surface, and the jail a
 * verification run names for compositions (`GFX_USER_COMPOSITION_STORE_DIRECTORY`)
 * jails packs and fonts too without a second variable per store. Every rule the
 * composition location enforces (app data, never the working directory; a
 * verification run must name a throwaway; automation has no delete authority)
 * carries over unchanged, because this module only derives from it.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

import { error } from '@sveltejs/kit';

import {
	resolveUserCompositionStoreLocation,
	VERIFICATION_RUN_VARIABLE,
	type UserCompositionStoreLocation
} from './user-composition-store-location.server';

export interface UserPackStoreLocation {
	/** One `<slug>.json` User Pack document per file. */
	packStoreDirectory: string;
	/** Hash-named woff2 bytes plus the index that maps font claims onto them. */
	fontCacheDirectory: string;
	/** Where deleted packs go. Deleting never destroys. */
	trashDirectory: string;
	isVerificationRun: boolean;
}

export type UserPackStoreResolution =
	{ kind: 'served'; location: UserPackStoreLocation } | { kind: 'refused'; reason: string };

/** The pack store and font cache beside a resolved composition store. */
export function userPackStoreLocationBeside(
	composition: UserCompositionStoreLocation
): UserPackStoreLocation {
	return {
		packStoreDirectory: join(composition.storeDirectory, '..', 'packs'),
		fontCacheDirectory: join(composition.storeDirectory, '..', 'fonts'),
		trashDirectory: join(composition.trashDirectory, 'packs'),
		isVerificationRun: composition.isVerificationRun
	};
}

export function resolveUserPackStoreLocation(
	env: Readonly<Record<string, string | undefined>>,
	home: string = homedir()
): UserPackStoreResolution {
	const resolution = resolveUserCompositionStoreLocation(env, home);
	if (resolution.kind === 'refused') return resolution;
	return { kind: 'served', location: userPackStoreLocationBeside(resolution.location) };
}

/** The route-facing form: a refusal is configuration, so it answers 403 rather than 500. */
export function requireUserPackStoreLocation(
	env: Readonly<Record<string, string | undefined>> = process.env
): UserPackStoreLocation {
	const resolution = resolveUserPackStoreLocation(env);
	if (resolution.kind === 'refused') error(403, resolution.reason);
	return resolution.location;
}

/** Deleting a pack is the author's decision; verification code never has that authority. */
export function assertUserPackDeleteAuthorized(location: UserPackStoreLocation): void {
	if (!location.isVerificationRun) return;
	error(
		403,
		`A verification run (${VERIFICATION_RUN_VARIABLE}=1) has no delete authority over User Packs; removing a pack is the author's action alone.`
	);
}
