/**
 * What a host is allowed to say about a request it answered with an error
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md)
 * redacted observability).
 *
 * A development host logs everything: the query string and the whole response
 * body are how a failure gets diagnosed on a machine that also has the checkout.
 * A public host cannot log the same two values, because that is where a
 * visitor's work ends up — the query string carries app state, and an error body
 * can echo whatever was sent. The public runtime promises to keep no visitor
 * content, and a log line is content it kept.
 *
 * Redacting is not the same as saying nothing. The public form keeps what
 * identifies the failure — status, method, path, and the body it answered with —
 * and strips what identifies the machine or the work, using the rule the export
 * lane already applies to ffmpeg's output: remove the private values, then
 * remove any remaining absolute path.
 *
 * Deliberately free of Node and `$env` imports so the hook and its tests read
 * one policy.
 */

import { redactExportDiagnostic } from './public-export-security';
import type { PublicRuntimeProfile } from './public-runtime-deployment';

/** How much of an error body is worth keeping, on either profile. */
export const ERROR_RESPONSE_DIAGNOSTIC_CHARACTER_BUDGET = 2000;

export interface ErrorResponseObservation {
	profile: PublicRuntimeProfile;
	timestamp: string;
	status: number;
	method: string;
	pathname: string;
	search: string;
	/** The response body, read for a 5xx and `null` for anything below it. */
	body: string | null;
}

export interface ErrorResponseReport {
	/** The console line, body included when there is one. */
	line: string;
	/** Context for the promoted Sentry message, or `null` when there is no body. */
	diagnostic: { body: string; search: string } | null;
}

/**
 * The line to log and the context to promote, for one error response. A failure
 * on a development host carries its query string and its body verbatim; the same
 * failure on a public host carries no query string and a path-stripped body.
 */
export function describeErrorResponse(observation: ErrorResponseObservation): ErrorResponseReport {
	const search = observation.profile === 'public' ? '' : observation.search;
	const line = `[${observation.timestamp}] ${observation.status} ${observation.method} ${observation.pathname}${search}`;

	if (observation.body === null) return { line, diagnostic: null };

	const body = (
		observation.profile === 'public'
			? redactExportDiagnostic(observation.body, [])
			: observation.body
	).slice(0, ERROR_RESPONSE_DIAGNOSTIC_CHARACTER_BUDGET);
	return { line: `${line}\n${body}`, diagnostic: { body, search } };
}
