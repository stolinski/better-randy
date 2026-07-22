# Sentry dev flow

Supers reports errors, logs, and traces to Sentry (`scott-tolinski-projects/supers`) during local dev. Agents use the `sentry` CLI as the primary way to find and fix broken code — it sees every runtime error with stack, breadcrumbs, and trace context, which beats scraping the dev-server console or the browser log.

## What is instrumented

- **`src/hooks.server.ts`** — Sentry init + request tracing on every route (`sentryHandle`). Real SSR crashes flow through `handleErrorWithSentry`. Intentional `error(5xx)` HttpErrors (which never reach `handleError`) are captured explicitly with the response body. **4xx responses are logs, not issues** — an absent poster or fork is a signal, and turning it into an issue would recreate the console-noise problem in Sentry.
- **`src/hooks.client.ts`** — browser error capture, pageload/navigation tracing, unhandled rejections.
- **Both sides** run `consoleLoggingIntegration`: every existing `console.warn` / `console.error` call site is a structured Sentry log with no code changes.
- DSN comes from `.env` (`SENTRY_DSN` server, `PUBLIC_SENTRY_DSN` client — same value). No DSN → the SDK is disabled and the app behaves identically; nothing in the codebase may *depend* on Sentry being up.

## The fix-broken-code loop

```bash
sentry issue list --query "is:unresolved"   # what is broken right now
sentry issue view SUPERS-<n>                # stack, breadcrumbs, event context
sentry issue explain SUPERS-<n>             # Seer AI root-cause analysis
sentry issue plan SUPERS-<n>                # Seer fix plan
# ...fix the code, verify by re-driving the flow...
sentry issue resolve SUPERS-<n>
```

Org/project auto-detect from the DSN in `.env` — run the CLI from the repo root and scoping just works. Add `scott-tolinski-projects/supers` explicitly only if detection misfires.

After driving the app (captures, exports, Critic runs), check `sentry issue list --query "is:unresolved"` before calling the work verified — a flow that "looked fine" but threw upstream shows up there.

## Logs and metrics

```bash
sentry log list --follow                    # live tail of client+server logs
sentry log list --query "severity:error"    # errors only
sentry trace list --period 1h               # recent requests with durations
sentry trace view <trace-id>                # span tree for one request
sentry span list <trace-id>                 # spans (export encode, API calls)
```

Request tracing is on at 100% sample (local single-user dev — there is no volume to shed). Route transactions give per-endpoint duration series for free; use `sentry explore` or a dashboard when a question needs aggregates (e.g. p95 of `/api/export/prores` over a session).

### Export spans

Every export is its own transaction (`export.webm` / `export.prores`, op `export`) with two children: `export.render-frames` (the per-frame render loop) and `export.encode` (upload + server encode). Attributes carry `export.route` (`/p/<slug>` — the per-composition dimension), fps, frames, duration, opacity, and audio presence; the server request transaction adds `export.ffmpeg_ms` and `export.output_bytes`. Reference read from the first verified trace: a 6s blank WebM export = 79s total, of which 6.4s render and 73s VP9-lossless encode — exports are encode-bound, so encode settings are where export-speed work pays off.

### Versions

Every event and span carries a release: **`supers@<git sha>`**.

- **Server:** `src/lib/platform/git-version.server.ts` resolves HEAD per request
  (mtime-cached reads of `.git/HEAD` + the branch ref), so the long-running
  launchd dev server attributes events to the commit the working tree is ON —
  not the commit it booted with. The SDK-level release is fixed at process
  start; the always-current value rides the `git.release` tag.
- **Client:** the app shell carries `<meta name="supers-release">` (injected by
  the server per request); `hooks.client.ts` inits from it. A loaded page runs
  the code it was served, so its release stays correct for the page's lifetime.
- **Release registration:** `scripts/git-hooks/post-commit` registers each
  commit as a Sentry release with its commit list (suspect-commit attribution),
  detached and best-effort — no CLI or no auth never blocks a commit. Wired via
  `git config core.hooksPath scripts/git-hooks` (machine-local config — re-run
  that once on a fresh clone).

Slice anything by version: `sentry issue list --query "release:supers@<sha>"`,
`firstRelease:` / `lastRelease:` queries, and the dashboard's by-release tables.

### Dashboard

**Supers Dev** — <https://scott-tolinski-projects.sentry.io/dashboard/8615767/>: error/export KPIs, export duration + render-vs-encode trends, error and error-log time series, a routes-by-p95 table, and by-release tables (errors, export p95). Widget CLI gotchas: reference the dashboard by bare ID or exact title (an `org/project/id` path silently fails with "did you mean"), the `issue` dataset does not support `big_number`, and `sentry api --data` takes inline JSON only (no `@file`).

## Conventions

- **Do not leave test issues unresolved.** If you throw a deliberate error to verify capture, `sentry issue resolve` it immediately.
- **4xx = log, 5xx = issue.** Keep it that way when adding endpoints; capture explicitly only what a human should act on.
- **`.env` is gitignored and machine-local.** If the DSN is ever rotated: `sentry project view scott-tolinski-projects/supers` shows it, or mint keys via `sentry api /api/0/projects/scott-tolinski-projects/supers/keys/`.
