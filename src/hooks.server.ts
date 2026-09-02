import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';

import { describeErrorResponse } from '$lib/platform/public-error-observability';
import { applyPublicResponseHeaders } from '$lib/platform/public-response-headers';
import {
	assertPublicRuntimeDeployment,
	parsePublicRuntimeProfile
} from '$lib/platform/public-runtime-deployment';
import {
	servedOriginTrialToken,
	servedPublicRuntimeProfile,
	servedRelease
} from '$lib/platform/public-runtime-profile.server';
import {
	DEVELOPMENT_ONLY_SURFACE_MESSAGE,
	DEVELOPMENT_ONLY_SURFACE_STATUS,
	isSurfaceRefusedByProfile
} from '$lib/platform/public-surface-inventory';

// Which Sentry server SDK this bundle carries. The Cloudflare adapter resolves
// `@sentry/sveltekit` through its `worker` export condition, and that build
// ships no process-wide `init`: a Worker has no process, so the SDK is set up
// per request by `initCloudflareSentryHandle` instead. Detected by the absence
// rather than by profile, so a Node build serving the hosted profile locally
// keeps its process-wide client.
const isWorkerSentryBuild = typeof Sentry.init !== 'function';

const sentryEnvironment = dev ? 'development' : 'production';

// Server-side Sentry (errors, request tracing, logs). The DSN comes from
// SENTRY_DSN in .env — absent, the SDK stays disabled and every capture below
// is a no-op, so the app never depends on Sentry being configured.
if (!isWorkerSentryBuild) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		release: servedRelease() ?? undefined,
		environment: sentryEnvironment,
		// Local single-user dev — sample everything; there is no volume to shed.
		tracesSampleRate: 1,
		enableLogs: true,
		// Existing console.warn/error call sites become structured Sentry logs
		// without touching them.
		integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })]
	});
}

// The launchd dev server survives commits. Bind every event to the release this
// process is serving at capture time rather than the one it started with — the
// working tree's commit on a dev host, and the built GFX_RELEASE on a public one.
Sentry.addEventProcessor((event) => {
	const release = servedRelease();
	return release === null ? event : { ...event, release };
});

// The Node adapter awaits this before it listens, so a host whose deployment
// inputs cannot serve its declared profile exits non-zero here rather than
// accepting a request it could not finish (ADR-0052). Both dynamic env modules
// are read because the inputs span private and PUBLIC_-prefixed names.
//
// A hosted origin encodes nothing and stores nothing, so none of the Node
// lifecycle applies to it: no ffmpeg readiness, no temp-disk sweep, no store
// boot. That module reaches for the process and the filesystem, so it is loaded
// only on a host that will run it; the hosted origin is held to its own inputs
// and answers requests from there. A Worker has no listen step, so a failed
// assertion there fails every request until the deployment is corrected.
export const init: ServerInit = async () => {
	const runtimeEnv = { ...env, ...publicEnv };
	if (parsePublicRuntimeProfile(runtimeEnv) === 'hosted') {
		assertPublicRuntimeDeployment(runtimeEnv);
		return;
	}
	const { startPublicRuntime } = await import('$lib/platform/public-runtime-lifecycle.server');
	await startPublicRuntime(runtimeEnv);
};

// A surface this origin does not have answers 404 before its route module
// runs, so an excluded route never reads a body, touches disk, or spawns a
// browser (ADR-0053). Which surfaces those are is one inventory, not a condition
// scattered across route modules; the profile decides which rows apply.
const refuseUnservedSurfaces: Handle = async ({ event, resolve }) => {
	if (isSurfaceRefusedByProfile(event.url.pathname, servedPublicRuntimeProfile())) {
		return new Response(DEVELOPMENT_ONLY_SURFACE_MESSAGE, {
			status: DEVELOPMENT_ONLY_SURFACE_STATUS,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}
	return resolve(event);
};

// Hold every public response to the header contract — origin isolation, the
// WebMCP `tools` Permissions Policy, CSP, HSTS, referrer and content-type
// protections, and no-store by default (ADR-0052, ADR-0054). A development host
// is held to none of it: the dev server runs Vite HMR, the CDP verification
// harness, and the development-only routes above. The hosted origin adds the
// HTML-in-Canvas origin-trial token to every document, which is what lets a
// visitor's unflagged Chrome pass the capability gate.
const publicResponseHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (servedPublicRuntimeProfile() !== 'development') {
		applyPublicResponseHeaders(response, { originTrialToken: servedOriginTrialToken() });
	}
	return response;
};

// Log every error response server-side. Intentional error(...) HttpErrors from
// endpoints never reach handleError — without this hook they leave no trace in
// the dev-server logs at all (only unexpected crashes get logged).
const logErrorResponses: Handle = async ({ event, resolve }) => {
	// The SDK's release is fixed at process start, but the launchd dev server
	// outlives commits by days — tag every event with the release being served
	// right now, and hand the same value to the client via the app-shell meta.
	// On a dev host that is the WORKING TREE's commit (a freshly loaded page runs
	// current code, so its release IS current); on a production image it is the
	// GFX_RELEASE it was built with, which is the only release identity in there
	// at all — the image carries no checkout to read a commit from.
	const release = servedRelease();
	if (release !== null) {
		Sentry.getIsolationScope().setTag('git.release', release);
	}
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%gfx.release%', release ?? '')
	});
	if (response.status >= 400) {
		// What survives into the log depends on the profile: a public host keeps no
		// query string and strips absolute paths out of the body (ADR-0052).
		const report = describeErrorResponse({
			profile: servedPublicRuntimeProfile(),
			timestamp: new Date().toISOString(),
			status: response.status,
			method: event.request.method,
			pathname: event.url.pathname,
			search: event.url.search,
			body: response.status >= 500 ? await response.clone().text() : null,
			reportedByErrorHandler: event.locals.serverExceptionReportedToSentry === true
		});
		console.error(report.line);
		if (report.diagnostic !== null) {
			// Promote a resolved 5xx unless something already answers for it: the
			// route's designed answer (the readiness 503), or an unhandled exception
			// handleError reported with its stack. Intentional error(...) never
			// reaches handleError, so promoting is the only Sentry event it gets;
			// 4xx stays a log line only.
			Sentry.captureMessage(`${response.status} ${event.request.method} ${event.url.pathname}`, {
				level: 'error',
				extra: { ...report.diagnostic }
			});
		}
	}
	return response;
};

// Outermost first. Logging wraps the exclusion so a refused surface is still
// observed, and the header layer sits between them so the refusal carries the
// same headers every other public response does. The worker build initializes
// Sentry per request ahead of everything else, where the Node build already did
// so at module scope.
export const handle = sequence(
	...(isWorkerSentryBuild
		? [
				Sentry.initCloudflareSentryHandle({
					dsn: env.SENTRY_DSN,
					release: servedRelease() ?? undefined,
					environment: sentryEnvironment,
					tracesSampleRate: 1
				})
			]
		: []),
	Sentry.sentryHandle(),
	logErrorResponses,
	publicResponseHeaders,
	refuseUnservedSurfaces
);

// Surface real SSR failures during development — SvelteKit's default masks
// everything as "Internal Error", which hides the stack from the browser and
// from agents driving the app headlessly. Production keeps the opaque message.
export const handleError: HandleServerError = Sentry.handleErrorWithSentry(({ error, event }) => {
	// Sentry captured this exception, with its stack, immediately before handing
	// it here. Mark the request so logErrorResponses does not file the 500 it
	// becomes as a second, stackless event — that duplication is what turned one
	// aborted frame upload into both GFX-COMPUTER-27 and GFX-COMPUTER-2A. Only an
	// unhandled exception reaches this hook; an intentional error(...) is answered
	// before it, and stays promotable.
	event.locals.serverExceptionReportedToSentry = true;
	console.error(
		`[${new Date().toISOString()}] SSR error at ${event.url.pathname}${event.url.search}:`,
		error
	);
	if (dev && error instanceof Error) {
		return { message: `${error.message}\n${error.stack ?? ''}` };
	}
	return { message: 'Internal Error' };
});
