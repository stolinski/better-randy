/**
 * What one export session's disposal actually released (ADR-0052).
 *
 * The public demo persists nothing on a visitor's behalf, so "the session ended"
 * is not the guarantee — "the session left nothing behind" is. Every terminal
 * path (a drained download, a cancellation, a failure, either expiry clock) ends
 * in one receipt naming what was released and what was not, so a retention leak
 * is something the origin observes and fixtures assert rather than something the
 * transport assumes.
 *
 * A receipt carries the session identity, which already names the session in
 * URLs and therefore in logs, and never a work directory, a credential, a
 * filename, or any composition content — the same redaction rule the export
 * telemetry attributes follow.
 *
 * Deliberately free of Node imports, like its `public-export-limits` and
 * `public-export-security` peers, so fixtures and the transport read one set of
 * rules.
 */

import type { PublicExportLimitName } from '$lib/platform/public-export-limits';

/**
 * Why a session was disposed. Every way an export can end has its own case,
 * including `shutdown` — the host was signalled, and an encode nobody will come
 * back for is released now rather than left for the orphan sweep of whichever
 * process replaces it.
 */
export type ExportCleanupReason =
	'downloaded' | 'cancelled' | 'failed' | 'idle-expired' | 'lifetime-expired' | 'shutdown';

export interface ExportCleanupReceipt {
	/** The public session identity — the one private value a receipt may name. */
	sessionId: string;
	reason: ExportCleanupReason;
	/** False when the encoder was still unreaped after its termination grace window. */
	encoderTerminated: boolean;
	/** False when an in-flight download body could not be closed. */
	downloadClosed: boolean;
	/** False when the private work directory survived the disposal. */
	workDirectoryRemoved: boolean;
	elapsedMs: number;
}

/**
 * Receipts a store keeps for inspection. Bounded, because the receipts are
 * themselves state the public runtime holds: they exist to prove the last
 * disposals released everything, not to accumulate a session history.
 */
export const EXPORT_CLEANUP_RECEIPT_HISTORY = 64;

/** Which clock a removed session ran out of, in cleanup vocabulary. */
export function exportCleanupReasonForExpiry(limit: PublicExportLimitName): ExportCleanupReason {
	return limit === 'sessionLifetimeMs' ? 'lifetime-expired' : 'idle-expired';
}

/**
 * The first thing a disposal failed to release, named for the origin log — or
 * `null` when the session left nothing behind.
 */
export function findExportCleanupLeak(receipt: ExportCleanupReceipt): string | null {
	const ended = `Export session ${receipt.sessionId} (${receipt.reason})`;
	if (!receipt.downloadClosed) return `${ended} left its download body open.`;
	if (!receipt.encoderTerminated) return `${ended} left its encoder process running.`;
	if (!receipt.workDirectoryRemoved) return `${ended} left its work directory on disk.`;
	return null;
}

/** Every leak across a run of disposals, so a repeated sweep is asserted at once. */
export function findExportCleanupLeaks(receipts: readonly ExportCleanupReceipt[]): string[] {
	return receipts.flatMap((receipt) => findExportCleanupLeak(receipt) ?? []);
}
