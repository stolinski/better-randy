import { version } from '$app/environment';
import { updated } from '$app/state';

import { createStaleBuildRecovery } from '$lib/utils/stale-build-recovery';

// The one recovery every on-demand import failure funnels into: Vite's
// `vite:preloadError` listener in hooks.client.ts and the Preset route's
// renderer load (ADR-0058). `updated.check()` compares the origin's
// version.json with the build this page came from; the reload lands on
// whatever the origin serves now. Storage and reload are read at call time —
// this module is also evaluated during server rendering, where neither exists.
export const staleBuildRecovery = createStaleBuildRecovery({
	buildVersion: version,
	hasNewerBuild: () => updated.check(),
	reload: () => window.location.reload(),
	storage: () => {
		try {
			return window.sessionStorage;
		} catch {
			// Reading the property itself throws when the browser blocks site data.
			return null;
		}
	}
});
