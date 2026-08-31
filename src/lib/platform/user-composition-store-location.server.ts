/**
 * Where a User composition actually lives on disk, and who is allowed to touch
 * it.
 *
 * The store used to be `<cwd>/user-compositions`, which made the author's own
 * documents a function of whatever directory a process happened to start in. A
 * verification probe that spawned a server without an explicit `cwd` inherited
 * the primary checkout and pointed the real store at itself; its storage
 * clear/denial tests then deleted about thirty of Scott's compositions on
 * 2026-08-29. Nothing under the repository tree holds user data again.
 *
 * Two rules follow, and both are enforced here rather than at each call site:
 *
 *   1. The store lives in macOS app data, outside every checkout and worktree.
 *   2. A verification run must name its own throwaway store directory. It may
 *      never resolve to the real one, and it has no delete authority at all —
 *      removing an author's work is the author's decision, never a probe's.
 */
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { error } from '@sveltejs/kit';

import { readGfxEnvironmentValue } from '$lib/utils/legacy-supers-compatibility';

/** Set to `1` by every harness that drives a server it did not author. */
export const VERIFICATION_RUN_VARIABLE = 'GFX_VERIFICATION_RUN';

/** The jailed store a verification run must name before any route will serve. */
export const USER_COMPOSITION_STORE_DIRECTORY_VARIABLE = 'GFX_USER_COMPOSITION_STORE_DIRECTORY';

/**
 * macOS app data. GFX is a local-first macOS tool, so this is the platform's
 * answer for "documents the app keeps on the user's behalf" — and, unlike the
 * repository tree, nothing in the delivery pipeline ever deletes or rewrites it.
 */
export function primaryUserCompositionStoreDirectory(home: string = homedir()): string {
	return join(home, 'Library', 'Application Support', 'GFX', 'compositions');
}

/** The store directory plus the two sibling directories that protect it. */
export interface UserCompositionStoreLocation {
	storeDirectory: string;
	/** Where deleted compositions go. Deleting never destroys. */
	trashDirectory: string;
	/** Where boot and pre-delete snapshots go. */
	backupsDirectory: string;
	isVerificationRun: boolean;
}

/**
 * A refusal is a configuration answer, not a request-shaped one: it names what
 * the environment would have to say for the store to serve at all.
 */
export type UserCompositionStoreResolution =
	{ kind: 'served'; location: UserCompositionStoreLocation } | { kind: 'refused'; reason: string };

/** Trash and backups sit beside the store so a move across them never crosses a device. */
function locationAround(
	storeDirectory: string,
	isVerificationRun: boolean
): UserCompositionStoreLocation {
	return {
		storeDirectory,
		trashDirectory: join(storeDirectory, '..', 'trash'),
		backupsDirectory: join(storeDirectory, '..', 'backups'),
		isVerificationRun
	};
}

/** True when `candidate` is the same directory as `other`, or sits inside it. */
function isWithin(candidate: string, other: string): boolean {
	const step = relative(other, candidate);
	return step === '' || (!step.startsWith('..') && !isAbsolute(step));
}

export function isVerificationRun(env: Readonly<Record<string, string | undefined>>): boolean {
	return readGfxEnvironmentValue({ ...env }, VERIFICATION_RUN_VARIABLE) === '1';
}

/**
 * Resolve the store for this process. Reads the environment on every call —
 * the dev server outlives the configuration it started with, and tests vary it.
 */
export function resolveUserCompositionStoreLocation(
	env: Readonly<Record<string, string | undefined>>,
	home: string = homedir()
): UserCompositionStoreResolution {
	const verificationRun = isVerificationRun(env);
	const primaryDirectory = primaryUserCompositionStoreDirectory(home);
	const configured = readGfxEnvironmentValue({ ...env }, USER_COMPOSITION_STORE_DIRECTORY_VARIABLE);

	if (configured === undefined || configured.trim().length === 0) {
		// Without an explicit directory a verification run would land on the real
		// store, which is the exact failure this module exists to make impossible.
		if (verificationRun) {
			return {
				kind: 'refused',
				reason: `${VERIFICATION_RUN_VARIABLE}=1 requires an explicit ${USER_COMPOSITION_STORE_DIRECTORY_VARIABLE} outside ${primaryDirectory}; a verification run may never be served the real composition store.`
			};
		}
		return { kind: 'served', location: locationAround(primaryDirectory, false) };
	}

	if (!isAbsolute(configured)) {
		return {
			kind: 'refused',
			reason: `${USER_COMPOSITION_STORE_DIRECTORY_VARIABLE} must be an absolute path; received "${configured}".`
		};
	}

	const storeDirectory = resolve(configured);
	// A jail that contains the real store, or sits inside it, is not a jail.
	if (
		verificationRun &&
		(isWithin(storeDirectory, primaryDirectory) || isWithin(primaryDirectory, storeDirectory))
	) {
		return {
			kind: 'refused',
			reason: `${USER_COMPOSITION_STORE_DIRECTORY_VARIABLE} "${storeDirectory}" overlaps the real composition store at ${primaryDirectory}; a verification run must use a throwaway directory.`
		};
	}

	return { kind: 'served', location: locationAround(storeDirectory, verificationRun) };
}

/**
 * The route-facing form. A refusal answers 403 rather than 500: the host is
 * working exactly as configured, and the configuration says do not serve this.
 */
export function requireUserCompositionStoreLocation(
	env: Readonly<Record<string, string | undefined>> = process.env
): UserCompositionStoreLocation {
	const resolution = resolveUserCompositionStoreLocation(env);
	if (resolution.kind === 'refused') error(403, resolution.reason);
	return resolution.location;
}

/**
 * Deleting an author's work is the author's decision. Verification code has no
 * delete authority over any store — not even its own jail, because a probe that
 * can delete is a probe one misconfiguration away from deleting the real thing.
 */
export function assertUserCompositionDeleteAuthorized(
	location: UserCompositionStoreLocation
): void {
	if (!location.isVerificationRun) return;
	error(
		403,
		`A verification run (${VERIFICATION_RUN_VARIABLE}=1) has no delete authority over User compositions; removing a composition is the author's action alone.`
	);
}
