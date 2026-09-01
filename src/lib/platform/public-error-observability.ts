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
	/**
	 * Whether an unhandled exception produced this response, which means
	 * `handleError` has already reported it to Sentry WITH its stack.
	 */
	reportedByErrorHandler: boolean;
}

export interface ErrorResponseReport {
	/** The console line, body included when there is one. */
	line: string;
	/**
	 * Context for the promoted Sentry message, or `null` when there is nothing
	 * left to promote: no body to read, the route's designed answer rather than a
	 * failure, or a failure the error handler already reported.
	 */
	diagnostic: { body: string; search: string } | null;
}

/**
 * Statuses a route answers with on purpose, keyed by path. `/api/health` is the
 * readiness contract (ADR-0052): 200 once the host can serve both export lanes,
 * 503 while it cannot. A host that is legitimately not ready — no encoder, or
 * temp disk below the reserved export envelope — is behaving exactly as
 * specified, and the container healthcheck polls it on a loop, so promoting that
 * 503 files one Sentry error per poll and buries the failures worth reading.
 */
const DESIGNED_RESPONSE_STATUSES_BY_PATHNAME: ReadonlyMap<string, ReadonlySet<number>> = new Map([
	['/api/health', new Set([503])]
]);

/** Whether this route answered with this status by design rather than by failing. */
export function isDesignedResponseStatus(pathname: string, status: number): boolean {
	return DESIGNED_RESPONSE_STATUSES_BY_PATHNAME.get(pathname)?.has(status) ?? false;
}

/**
 * Whether this error response is worth promoting to Sentry as its own event.
 *
 * Promotion exists for the failures nothing else reports: an intentional
 * `error(5xx, ...)` throws an `HttpError`, which SvelteKit answers before
 * `handleError` runs, so without this it leaves no Sentry event at all. An
 * UNHANDLED exception is the opposite case — `handleError` has already captured
 * it with its stack by the time the 500 comes back, so promoting it files the
 * same request a second time as a stackless `500 <METHOD> <path>` message.
 *
 * That duplicate is how one aborted frame upload became both GFX-COMPUTER-27
 * (`Error: aborted`, with the stack) and GFX-COMPUTER-2A (`500 PUT
 * /api/export/sessions/[sessionId]/frames/1`, without it) on one trace, and it
 * doubled the unresolved queue: every SSR crash on `/p/[slug]` arrived twice.
 */
function isPromotableErrorResponse(observation: ErrorResponseObservation): boolean {
	return (
		!observation.reportedByErrorHandler &&
		!isDesignedResponseStatus(observation.pathname, observation.status)
	);
}

/**
 * The line to log and the context to promote, for one error response. A failure
 * on a development host carries its query string and its body verbatim; the same
 * failure on a public host carries no query string and a path-stripped body. A
 * designed status is still logged — an operator wants to see readiness flip —
 * but never promoted, because nothing went wrong. A failure the error handler
 * already reported is logged and not promoted either, because promoting it again
 * files the same request twice.
 *
 * Every case still logs. Withholding the diagnostic decides only whether this
 * response becomes a SECOND Sentry event, never whether the host records it.
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
	return {
		line: `${line}\n${body}`,
		diagnostic: isPromotableErrorResponse(observation) ? { body, search } : null
	};
}
