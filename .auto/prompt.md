# Autoresearch: Preset route load reliability

## Objective
Improve load speed, reliability, and actionable Sentry observability for every built-in `/p/<slug>` route. The reported symptom is an intermittent HTTP 500 on routes such as `/p/lower-third-miranda-heath`. Optimize real requests against the existing local dev server at `http://localhost:7263`; do not start another server. Do not specialize for one preset or bypass normal route behavior.

## Metrics
- **Primary**: `load_score_ms` (ms, lower is better) — p95 request latency plus a 10,000 ms penalty for each failed or semantically broken response.
- **Secondary**: `p95_ms`, `mean_ms`, `failures`, `requests`.

A success must be HTTP 200 and must not contain the route's load-error or missing-preset UI. The workload covers every built-in preset JSON slug through the normal route, plus a rotating subset through `?source=builtin`, under bounded concurrency. This catches broad catalog regressions without optimizing only Miranda Heath.

## How to Run
`./.auto/measure.sh`

## Files in Scope
- `src/routes/p/[slug]/+page.server.ts` — server route load and error behavior.
- `src/lib/platform/preset.ts` and focused new platform modules — built-in catalog loading/lookup.
- `src/lib/platform/user-composition-store.ts` and server-side composition persistence modules — user override lookup and resilience.
- `src/routes/api/user-compositions/**` — persistence API reliability.
- `src/hooks.server.ts` — route observability and Sentry context.
- Focused tests beside changed source.
- `.auto/measure.mjs`, `.auto/measure.sh`, `.auto/checks.sh` — benchmark/check harness when signal needs improvement.

## Off Limits
- Preset JSON content and visual rendering behavior.
- Benchmark-only production branches, skipped validation, fake responses, hard-coded Miranda Heath handling, or reduced route coverage.
- Starting/restarting the existing dev server.
- Destructive git commands.

## Constraints
- Preserve user-composition override semantics and `?source=builtin` behavior.
- Sentry is optional; routes must never depend on it.
- Strict TypeScript; no `any`.
- Keep all preset slugs loadable and preserve response semantics.
- Correctness checks must pass before keeping an experiment.
- Do not overfit or cheat the benchmark.
- Stop after 15 recorded rounds including baseline.

## What's Been Tried
- Sentry confirms `/p/*` 500s are captured. Historical events often coincide with Vite SSR module-evaluation errors during live source edits, so changes should improve failure context without pretending application code can hide invalid hot-reload modules.
- Baseline pending.
