import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

import * as Sentry from '@sentry/sveltekit';

import { staleBuildRecovery } from '$lib/platform/stale-build-recovery-runtime';

// Vite raises this when a dynamic import cannot fetch its module. After an
// integration rebuilds the origin, that module is a chunk this page's build
// named and the new build no longer ships — so reload onto the current build
// instead of surfacing the failure (ADR-0058). The event is left uncancelled:
// the import still rejects, and a caller that is not reloading keeps its own
// error path.
window.addEventListener('vite:preloadError', () => {
	staleBuildRecovery.reloadIfBuildIsStale().catch((error: unknown) => {
		console.error('Stale-build recovery failed.', error);
	});
});

// Browser-side Sentry (errors, tracing, logs). The DSN comes from
// PUBLIC_SENTRY_DSN in .env — absent, the SDK stays disabled and this whole
// file is inert, so the app never depends on Sentry being configured.
//
// The release is the commit the server's working tree was on when it rendered
// this page (app-shell meta, injected by hooks.server.ts) — correct for the
// lifetime of the page, since a freshly loaded page runs current code.
const releaseMeta = document
	.querySelector('meta[name="gfx-release"]')
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
