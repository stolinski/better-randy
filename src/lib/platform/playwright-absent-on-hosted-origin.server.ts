/**
 * What `playwright` resolves to in the hosted build
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md)
 * amendment).
 *
 * The site-capture route is development-only and the hosted origin answers 404
 * for it before its module loads, but the Worker bundle still has to resolve
 * every import in the server tree — and Playwright is a Node package that
 * spawns a browser from disk, which a Worker can neither bundle nor run.
 * `vite.config.ts` aliases the package here for the hosted build only, so the
 * bundle closes and the route, if it were ever reached, fails naming the origin
 * that has the capability rather than failing to load.
 */

const HOSTED_ORIGIN_HAS_NO_BROWSER =
	'Website capture needs the local GFX origin: the hosted origin runs no headless browser.';

export const chromium = {
	launch(): Promise<never> {
		return Promise.reject(new Error(HOSTED_ORIGIN_HAS_NO_BROWSER));
	}
};
