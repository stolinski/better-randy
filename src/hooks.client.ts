import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';

import { staleBuildRecovery } from '$lib/platform/stale-build-recovery-runtime';
import { isOriginFetchFailure } from '$lib/utils/stale-build-recovery';

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

// Told which hook it is wrapping: the SDK's one signature spans both the client
// and server shapes, and with no argument to infer from it would otherwise
// resolve to the union and accept neither event.
const reportErrorToSentry = Sentry.handleErrorWithSentry<HandleClientError>();

// A stale tab's failing route MODULE gets SvelteKit's own full-page fallback,
// but the `load` that follows fetches `__data.json` itself and gets nothing: an
// origin going away under the tab leaves a dead error page and files an
// unhandled "Failed to fetch" (GFX-COMPUTER-12). Neither half is an application
// defect, and each origin already has a way back onto a live build.
export const handleError: HandleClientError = async (input) => {
	if (!isOriginFetchFailure(input.error)) return reportErrorToSentry(input);

	// Development: the dev server restarting under the tab is what produced this,
	// and Vite's own client reloads the page when it reconnects. The recovery
	// below cannot help here at all — SvelteKit hard-wires `updated.check()` to
	// false in dev — so filing it only made a working dev server look like an
	// unhandled defect.
	if (dev) return { message: 'The origin is unreachable; it is probably restarting.' };

	// Every integration rebuilds this origin, so take the same ADR-0058 recovery
	// the app's on-demand imports take. Awaiting it holds the error page back
	// until the reload is decided, the way the Preset route's renderer catch
	// does. An origin that is genuinely unreachable still reports: the version
	// check has to reach that same origin, so it sees no newer build, nothing
	// reloads, and Sentry gets the error as before.
	if (await staleBuildRecovery.reloadIfBuildIsStale()) {
		return { message: 'Reloading onto the current build.' };
	}
	return reportErrorToSentry(input);
};
