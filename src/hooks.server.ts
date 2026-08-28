import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleServerError } from '@sveltejs/kit';

import { resolveGitRelease } from '$lib/platform/git-version.server';

// Server-side Sentry (errors, request tracing, logs). The DSN comes from
// SENTRY_DSN in .env — absent, the SDK stays disabled and every capture below
// is a no-op, so the app never depends on Sentry being configured.
Sentry.init({
	dsn: env.SENTRY_DSN,
	release: resolveGitRelease(),
	environment: dev ? 'development' : 'production',
	// Local single-user dev — sample everything; there is no volume to shed.
	tracesSampleRate: 1,
	enableLogs: true,
	// Existing console.warn/error call sites become structured Sentry logs
	// without touching them.
	integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })]
});

// The launchd dev server survives commits. Bind every event to the repository
// revision at capture time rather than the revision from process startup.
Sentry.addEventProcessor((event) => {
	const release = resolveGitRelease();
	return release === undefined ? event : { ...event, release };
});

// Log every error response server-side. Intentional error(...) HttpErrors from
// endpoints never reach handleError — without this hook they leave no trace in
// the dev-server logs at all (only unexpected crashes get logged).
const logErrorResponses: Handle = async ({ event, resolve }) => {
	// The SDK's release is fixed at process start, but the launchd dev server
	// outlives commits by days — tag every event with the commit the WORKING
	// TREE is on, and hand the same value to the client via the app-shell meta
	// (a freshly loaded page runs current code, so its release IS current).
	const release = resolveGitRelease();
	if (release !== undefined) {
		Sentry.getIsolationScope().setTag('git.release', release);
	}
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%gfx.release%', release ?? '')
	});
	if (response.status >= 400) {
		const line = `[${new Date().toISOString()}] ${response.status} ${event.request.method} ${event.url.pathname}${event.url.search}`;
		if (response.status >= 500) {
			const body = await response.clone().text();
			console.error(`${line}\n${body.slice(0, 2000)}`);
			// Promote every resolved 5xx response; intentional error(...) never reaches
			// handleError, while 4xx stays a log line only.
			Sentry.captureMessage(
				`${response.status} ${event.request.method} ${event.url.pathname}`,
				{ level: 'error', extra: { body: body.slice(0, 2000), search: event.url.search } }
			);
		} else {
			console.error(line);
		}
	}
	return response;
};

export const handle = sequence(Sentry.sentryHandle(), logErrorResponses);

// Surface real SSR failures during development — SvelteKit's default masks
// everything as "Internal Error", which hides the stack from the browser and
// from agents driving the app headlessly. Production keeps the opaque message.
export const handleError: HandleServerError = Sentry.handleErrorWithSentry(({ error, event }) => {
	console.error(
		`[${new Date().toISOString()}] SSR error at ${event.url.pathname}${event.url.search}:`,
		error
	);
	if (dev && error instanceof Error) {
		return { message: `${error.message}\n${error.stack ?? ''}` };
	}
	return { message: 'Internal Error' };
});
