# Autoresearch: Faster homepage visual readiness

## Objective
Make `http://localhost:7263/` visibly ready much faster. The current homepage shows poster skeletons for seconds while it loads the composition library. Optimize the real cold-cache browser path, including server response, client hydration, user-composition metadata, and poster loading. Do not hide the delay by removing useful previews or by weakening the benchmark.

## Metrics
- **Primary**: `visualReadyMs` (ms, lower is better) — median cold-cache time until the 1440×900 viewport has no poster skeletons and homepage network work has been idle for 300 ms.
- **Secondary**: `ttfb`, `domContentLoaded`, `loadEvent`, `lcp`, `apiRequests`, `responseKb` — trade-off and diagnosis signals.

## How to Run
`./.auto/measure.sh` connects to the sanctioned flag-enabled Chrome on CDP port 9223 and measures the already-running app at port 7263. It runs three cold-cache samples and emits structured `METRIC` lines.

## Files in Scope
- `src/routes/+page.server.ts` — homepage server data.
- `src/routes/+page.svelte` — homepage composition loading and grid rendering.
- `src/routes/PosterCard.svelte` — poster loading and skeleton lifecycle.
- `src/routes/+layout.svelte` — shared chrome assets; keep workspace-only dependencies off the homepage.
- `src/routes/p/[slug]/+page.svelte` — workspace route entry and workspace-only dependency loading.
- `src/routes/api/user-compositions/+server.ts` — user-composition listing response.
- `src/lib/platform/user-composition-store.ts` — client transport and response parsing.
- Focused colocated tests for changed behavior.
- `.auto/` benchmark, checks, prompt, and ideas.

## Off Limits
- Preset JSON, rendering pipelines, Pack appearance, and export behavior.
- The existing dev server configuration and sanctioned Chrome launch.
- Unrelated in-progress Dex and deterministic-factory files present before this branch.

## Constraints
- Keep homepage functionality, previews, filtering, sorting, importing, deleting, and user-composition metadata correct.
- Do not start another dev server.
- Do not overfit to the probe, special-case its viewport, fake readiness, remove skeletons before content is ready, or warm caches inside the measurement.
- Strict TypeScript: no `any`, no re-exports, explicit return types on exports.
- Follow Svelte runes discipline and validate changed `.svelte` files with the Svelte autofixer.
- `npm run check` must pass after every passing benchmark.
- Primary metric improvements determine keep/discard; watch request count and LCP for regressions.

## What's Been Tried
- Baseline pending. Source inspection suggests an N+1 client path: the homepage lists user compositions, then requests every full Preset separately to derive three card fields. This is a prime candidate because 45 local compositions currently produce many API requests before the page settles.
