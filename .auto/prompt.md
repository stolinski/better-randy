# Autoresearch: Faster and more reliable Preset routes

## Objective
Improve full-page loads for every built-in `/p/<slug>` composition route, with special attention to intermittent 500s reported at `/p/lower-third-miranda-heath`. Optimize load speed, eliminate intermittent route failures, and make actionable failures visible in Sentry. Run exactly 15 experiment rounds. Do not optimize only Miranda Heath: every benchmark sweeps the complete built-in Preset corpus.

## Metrics
- **Primary**: `routeSuiteCostMs` (ms, lower is better) — corpus p95 ready time plus a 60,000 ms reliability cost for each failed route. This makes any 500, uncaught exception, console error, or readiness timeout dominate small speed gains.
- **Secondary**: `routeLoadP50Ms`, `routeLoadP95Ms`, `routeLoadMaxMs`, `failedRoutes`, `http5xx`, `consoleErrors`, `routeCount`, `mirandaReadyMs`.

## How to Run
`./.auto/measure.sh` connects to the sanctioned flag-enabled Chrome on CDP port 9223. It performs a cache-disabled full-document navigation for every JSON Preset path, checks the Workspace canvas/timeline/export seams, captures HTTP 5xx and browser errors, and emits structured `METRIC` lines.

## Files in Scope
- `src/routes/p/[slug]/+page.server.ts` — composition route data loading and server failure behavior.
- `src/routes/p/[slug]/+page.svelte` — route application and Workspace readiness.
- `src/lib/platform/preset.ts` and focused modules split from it — built-in Preset catalog loading and validation.
- `src/lib/platform/user-composition-store.ts` — built-in/user composition lookup transport.
- `src/routes/api/user-compositions/[slug]/+server.ts` and its local persistence dependencies — route lookup reliability and latency.
- `src/hooks.server.ts`, `src/hooks.client.ts`, and focused observability helpers/tests — Sentry error and trace capture.
- Focused tests for changed behavior.
- `.auto/` benchmark, checks, prompt, and ideas.

## Off Limits
- Preset JSON content, Pack appearance, rendering output, animation behavior, export behavior, or reduced native resolution.
- The existing dev server and sanctioned Chrome launch configuration.
- Homepage-only optimization work and unrelated in-progress Dex files.

## Constraints
- Preserve transparent rendering defaults, frame determinism, native target resolution, and orientation/Pack neutrality.
- Do not hide failures, retry until the benchmark passes, special-case benchmark paths, weaken readiness checks, warm caches inside a sample, or remove useful route behavior.
- Test every built-in Preset path each round; keep Miranda Heath as a named diagnostic, not a privileged implementation case.
- A route is ready only when the document completes and the canvas, timeline, export seam, and CanvasDrawElement capability exist.
- Strict TypeScript: no `any`, no re-exports, explicit return types on exports.
- Sentry must remain optional; application behavior cannot depend on a configured DSN.
- Do not start another dev server.
- `npm run check` must pass after every benchmark.

## What's Been Tried
- New baseline pending.
- Existing Sentry setup captures unexpected SSR errors and promotes resolved 5xx responses. Recent Sentry data proves local 500s are reaching both issues and structured error logs.
- The current route server load checks the User composition API before falling back to the eager built-in catalog. The route HTML for Miranda Heath is currently about 445 KB and a direct request currently returns 200 in about 83 ms.
