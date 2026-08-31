/**
 * What the public runtime does before its first request and after its last one
 * (ADR-0052).
 *
 * The Node adapter awaits SvelteKit's `init` hook before it listens, so this is
 * the one place a misconfigured host can still be stopped: `startPublicRuntime`
 * either returns and the origin serves, or it throws and the process exits
 * non-zero having never bound a port. Everything a container needs to be
 * deterministic hangs off those two edges — the orphan sweep at startup, and the
 * release of every open session when the host is signalled.
 */

import {
	exportSessionStore,
	startExportDirectoryMaintenance,
	stopExportDirectoryMaintenance
} from '$lib/platform/export-session.server';
import { findExportCleanupLeaks } from '$lib/platform/public-export-cleanup';
import { parsePublicRuntimeConfig } from '$lib/platform/public-runtime-contract';
import {
	assertPublicRuntimeDeployment,
	type PublicRuntimeProfile
} from '$lib/platform/public-runtime-deployment';
import { inspectPublicRuntimeReadiness } from '$lib/platform/public-runtime-readiness.server';
import { startUserCompositionStore } from '$lib/platform/user-composition-store-boot.server';

/**
 * How long after the last connection closes the process may still be held open
 * by something it does not own before it exits anyway. The guard timer is
 * unreferenced, so a host with nothing left to do exits immediately and this
 * only bounds the case where it does not.
 */
const RUNTIME_EXIT_GRACE_MS = 5_000;

let shutdownRegistered = false;

/**
 * The startup readiness line, and only what a log may carry: no paths, no
 * session identities, no composition content — the same rule the export
 * telemetry attributes follow.
 *
 * Public hosts only. Measuring readiness spawns ffmpeg twice and probes temp
 * disk, which is what an operator wants at deploy time and what a dev server
 * restarting on every save does not.
 */
async function logPublicRuntimeReadiness(): Promise<void> {
	const readiness = await inspectPublicRuntimeReadiness(parsePublicRuntimeConfig(process.env));
	const encoders =
		readiness.ffmpeg.missingEncoders.length === 0
			? 'all public encoders present'
			: `missing encoders ${readiness.ffmpeg.missingEncoders.join(', ')}`;
	const disk = readiness.temporaryDisk.ok
		? `${readiness.temporaryDisk.freeBytes} free temp bytes`
		: `temp disk unavailable (${readiness.temporaryDisk.freeBytes ?? 'unreadable'} of ${readiness.temporaryDisk.requiredBytes} required)`;
	const line = `GFX runtime ${readiness.ready ? 'ready' : 'unavailable'} (release ${readiness.release ?? 'unknown'}): ${readiness.ffmpeg.version ?? 'no ffmpeg'}, ${encoders}, ${disk}.`;
	if (readiness.ready) console.log(line);
	else console.error(line);
}

async function stopPublicRuntime(reason: string): Promise<void> {
	stopExportDirectoryMaintenance();
	const receipts = await exportSessionStore.disposeOpenSessions();
	for (const leak of findExportCleanupLeaks(receipts)) console.error(leak);
	console.log(`GFX runtime stopped (${reason}): released ${receipts.length} export session(s).`);
	// Nothing this process owns is still holding the loop open, so it exits here.
	// The guard is for anything that is not ours — a container stop has a grace
	// period, and being killed at the end of it is not a graceful shutdown.
	setTimeout(() => process.exit(0), RUNTIME_EXIT_GRACE_MS).unref();
}

/**
 * Hold this host to its deployment profile, sweep what the process it replaced
 * left behind, and arrange for the next signal to release every open session.
 * Throws when the environment cannot serve the declared profile.
 */
export async function startPublicRuntime(
	env: Readonly<Record<string, string | undefined>>
): Promise<PublicRuntimeProfile> {
	const profile = assertPublicRuntimeDeployment(env);
	startExportDirectoryMaintenance();
	// Boot is the one moment the store is guaranteed quiet, so it is where the
	// day's first snapshot is taken and where anything still sitting in the old
	// in-repo folder is moved out of the checkout for good.
	await startUserCompositionStore(env);

	if (!shutdownRegistered) {
		shutdownRegistered = true;
		// Emitted by the Node adapter once the HTTP server has closed, so in-flight
		// requests have already drained or been cut off at SHUTDOWN_TIMEOUT.
		process.on('sveltekit:shutdown', (reason: unknown) => {
			void stopPublicRuntime(typeof reason === 'string' ? reason : 'shutdown').catch((error) =>
				console.error('GFX runtime shutdown failed.', error)
			);
		});
	}

	if (profile === 'public') await logPublicRuntimeReadiness();
	return profile;
}
