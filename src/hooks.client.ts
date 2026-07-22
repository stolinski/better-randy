import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

import * as Sentry from '@sentry/sveltekit';

// Browser-side Sentry (errors, tracing, logs). The DSN comes from
// PUBLIC_SENTRY_DSN in .env — absent, the SDK stays disabled and this whole
// file is inert, so the app never depends on Sentry being configured.
//
// The release is the commit the server's working tree was on when it rendered
// this page (app-shell meta, injected by hooks.server.ts) — correct for the
// lifetime of the page, since a freshly loaded page runs current code.
const releaseMeta = document
	.querySelector('meta[name="supers-release"]')
	?.getAttribute('content');

Sentry.init({
	dsn: env.PUBLIC_SENTRY_DSN,
	release: releaseMeta || undefined,
	environment: dev ? 'development' : 'production',
	// Local single-user dev — sample everything; there is no volume to shed.
	tracesSampleRate: 1,
	enableLogs: true,
	integrations: [
		Sentry.browserTracingIntegration(),
		// Existing console.warn/error call sites become structured Sentry logs
		// without touching them.
		Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })
	]
});

export const handleError = Sentry.handleErrorWithSentry();
