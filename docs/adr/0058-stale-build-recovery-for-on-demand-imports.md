# ADR-0058 — A tab that outlives a rebuild reloads onto the current build

## Status

**Canon (built 2026-09-02).** No Dex epic: a defect fix delivered directly. Evidence: `pnpm probe:stale-build-recovery` (`scripts/probe-stale-build-recovery.ts`) drives the production artifact in the sanctioned CDP browser, simulates a rebuild by rewriting `version.json`, restarting the origin, and failing every chunk the tab has not fetched, and passes all five checks below.

Date: 2026-09-02

Builds on: [ADR-0049](0049-lazy-pipeline-renderer-loading.md) (renderers are on-demand imports), [ADR-0052](0052-public-runtime-and-retention-architecture.md) (one Node origin serves the built artifact)

## Context

`gfx.robo.online` serves the production build of `main` from one Node process, and every integration rebuilds that artifact and restarts the process (`gfx-verify.rebuild_and_smoke`). The adapter empties `build/` and writes fresh content-hashed files, so the previous build's chunks stop existing the moment the next one lands. With roughly 25 integrations a day, any tab open for more than a few minutes is running a build the origin no longer has.

SvelteKit covers the imports it makes itself: when a route module fails to load during navigation, the client fetches `_app/version.json`, sees a newer build, and falls back to a full-page navigation. It never hears about the imports the app makes. ADR-0049 made every Pipeline renderer an on-demand `import()` in `runtime-loader.ts` (66 of them), and the home route imports the composition store and lifecycle operations the same way. Vite routes those through its preload helper and, on failure, dispatches `vite:preloadError` on `window` — an opt-in hook, not a recovery. Nothing listened. The Preset route caught the browser's `Failed to fetch dynamically imported module` and showed "Couldn't load renderer", which is the intermittent error that appeared whenever a rebuild landed between loading the home page and opening a Preset.

Hosted SvelteKit sites do not show this because their edges keep old hashed files reachable and they deploy rarely. This origin has neither property, so the client has to carry the recovery.

## Decision

Three layers, all client-side, all using SvelteKit's own version contract:

1. **`kit.version.pollInterval` is 30 seconds** (`svelte.config.js`). Every open tab learns of a new build within that window, so `updated.current` is true before the next click in the common case.
2. **A stale tab's next navigation is a full page load.** The root layout's `beforeNavigate` cancels client-side navigation and sets `location.href` when `updated.current` is true and the navigation would not already unload the page. This is the recipe SvelteKit's configuration docs give; it means no import from a stale build is attempted at all.
3. **A failed on-demand import reloads onto the current build once.** `hooks.client.ts` listens for `vite:preloadError` and the Preset route's renderer catch classifies module-load failures (`isModuleLoadFailure`); both call `staleBuildRecovery.reloadIfBuildIsStale()`, which runs `updated.check()` and reloads when the origin serves a newer build. Concurrent failures share one check and one reload. The Preset route waits on that result before showing an error, so a reloading tab stays on "Loading…" instead of flashing the failure.

The reload is guarded per build: `sessionStorage` remembers which build the tab last reloaded from, and a second reload from the same build is refused. Between a build finishing and the restart completing, the old process can serve the old shell beside the new `version.json`; without the guard that window would loop. With it, the tab reloads once, and if it still lands on the old build it shows the error and the user reloads by hand a few seconds later.

The `vite:preloadError` event is deliberately not cancelled. Cancelling makes the import resolve to `undefined`, which turns a clear fetch failure into a confusing property access on nothing for any caller that is not reloading.

The pure logic (`isModuleLoadFailure`, `createStaleBuildRecovery`) lives in `src/lib/utils/stale-build-recovery.ts` with injected dependencies and unit tests; `src/lib/platform/stale-build-recovery-runtime.ts` binds it to `$app/environment`'s `version`, `$app/state`'s `updated.check()`, `window.location.reload`, and `sessionStorage`.

## Consequences

- The probe holds the contract to five observable facts: a failed on-demand import reloads the tab exactly once and onto the same Preset; the reloaded tab renders and records the build it left; a second failure from the same build shows "Couldn't load renderer" with no further reload; a tab that knows of a newer build takes its next navigation as a full page load; and the 30-second poll alone is enough to make the next click a full page load.
- A tab that outlives a rebuild keeps working. Its next click is a full page load, and the rare click inside the polling window or the restart window reloads once.
- A chunk missing from the _current_ build is still reported as an error: `updated.check()` returns false, nothing reloads, and the message names the module.
- Every open tab fetches `_app/version.json` every 30 seconds. Verification harnesses driving the CDP browser see the same request; it is same-origin, tiny, and needs no CSP change.
- The origin still deletes the previous build's files. Keeping the last build's `_app/immutable` beside the new one would let stale tabs finish without a reload at all; that is a serving-lane change, deferred until the client recovery proves insufficient.

## Alternatives considered

- **Only the route-level catch.** Covers the Preset route and nothing else; the home route's store and lifecycle imports would still fail. Rejected in favour of the global Vite event, kept alongside the route catch only to hold "Loading…" during the reload.
- **A retry loop on the failed import.** The chunk does not exist; retrying the same URL cannot succeed. Rejected.
- **Retaining old builds on the origin instead of any client change.** Fixes stale tabs completely but changes the rebuild lane and needs pruning. Deferred; the client recovery is what SvelteKit and Vite both document, and it also covers the restart window that asset retention cannot.
