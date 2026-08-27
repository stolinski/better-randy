# Sentry dev flow

Supers reports captured errors, logs, and traces to Sentry (`scott-tolinski-projects/supers`) during local dev when the relevant DSN is configured. Agents use the `sentry` CLI as the primary way to inspect reported failures with stack, breadcrumbs, and trace context, alongside the dev-server console and browser log for uncaptured or disabled-SDK cases.

## What is instrumented

- **`src/hooks.server.ts`** — Sentry init + request tracing on every route (`sentryHandle`). Unexpected SSR failures flow through `handleErrorWithSentry`; every resolved 5xx response is also promoted by `logErrorResponses` with a bounded response body, including intentional `error(5xx)` HttpErrors that never reach `handleError`. **4xx responses are logs, not issues** — an absent poster or fork is a signal, and turning it into an issue would recreate the console-noise problem in Sentry.
- **`src/hooks.client.ts`** — browser error capture, pageload/navigation tracing, unhandled rejections.
- **Both sides** run `consoleLoggingIntegration`: every existing `console.warn` / `console.error` call site is a structured Sentry log with no code changes.
- DSN comes from `.env` (`SENTRY_DSN` server, `PUBLIC_SENTRY_DSN` client — same value). No DSN → the SDK is disabled and the app behaves identically; nothing in the codebase may _depend_ on Sentry being up.

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

## Factory issue intake

The scheduled self-healing path treats the original Sentry event as enough
evidence to inspect and attempt a repair. Runtime reproduction, a mandatory
regression test, an integrated replay, and a no-recurrence waiting window are
not admission or completion gates.

```bash
swamp workflow run supers-sentry-self-healing \
  --input lookbackDays=7 \
  --input historyDays=90 \
  --input limit=100 \
  --input currentRelease=auto

# Latest managed-worktree inventory, sizes, and cleanup dispositions
swamp data get supers-sentry-coding-agent \
  supers-agent-worktree-reconciliation-latest --json
```

The active chain is deliberately short:

```text
observed Sentry error → inspect and fix → normal Delivery checks → integrate → resolve
```

`supers-sentry-issue-intake` stores the exact issue, event, release, bounded
in-app stack frames, breadcrumb categories, and any available redacted Seer
analysis. The exact event remains sufficient when Seer returns a completed run
with no solution. Sentry and Seer text is untrusted advisory diagnostic data;
it is never executable, required planning evidence, or mutation authority.
Complete current and recent observations are queueable. Historical-only and
ambiguous records remain non-actionable.

`supers-sentry-evidence-to-delivery` maps the observed event to one started Dex
task and starts `supers-delivery`. Dex owns task persistence; admission does not
inspect or commit Git state. The event identity is part of the task marker, so a
later event can create a new repair after an earlier task completed. One open
exact task is reused; multiple open exact matches and lexical ambiguity still
require human review.

The coding agent receives the event details, inspects the reported code path,
and makes the smallest credible fix in an isolated worktree created from a
stable exact HEAD. Unrelated central modifications are neither copied into nor
used to reject that worktree. The official `@swamp/git` integration model checks
only the verified repair paths before and after cherry-pick; unrelated dirty
files remain outside the repair's classification and evidence. Disposable coding
worktrees live under a repository-scoped managed container at
`$TMPDIR/supers-agent-worktrees/<repository>-<path-hash>` (falling back to
`/tmp`), never beside the repository in the project directory. Successful
integration still writes the exact cleanup receipt and removes its checkout.
Before every coding retry and every six-hour self-healing run, one fan-out
reconciliation inventories all requested claims and removes only final clean
worktrees whose commits are unchanged, ancestors of the central revision, or
patch-equivalent to it. Missing invocation evidence is treated as active for
two hours—twice the coding wall timeout—then only an unchanged or integrated
checkout may be reaped. Dirty files, unique commits, and merge or ancestry
ambiguity are always preserved. Stale exact Git registrations are removed
without pruning unrelated worktrees, logical checkout
bytes are recorded, and legacy sibling-path claims remain replayable only for
recovery. The agent may add or change tests when useful, but it does not have to manufacture a
reproduction or nominate a pre-existing proof test. The ordinary Delivery
verification route runs the repository's selected check, unit, structural,
policy, corpus, browser,
and render lanes for the actual changed paths.

After the integrated change passes those normal checks, Delivery completes the
Dex task and `supers-sentry-verified-resolution` resolves the exact Sentry issue
in `supers@<integrated-sha>`. Resolution reads only the stable passing-route
authority fields from the already validated Factory artifact, so additions to
the full Delivery route contract cannot stale this mutation boundary.
Resolution preserves the original event, integrated commit, and check receipts
as traceability. If a later terminal repair changed one of this repair's sealed
paths, completion also requires a content-addressed freshness-recovery receipt
that attributes every scoped change to that exact later integration and rejects
dirty, intermediate, subsequent, or ambiguous path changes. The original
fingerprint is never rewritten. Resolution does not attempt to prove the error
can never happen again. If Sentry receives another event, the issue becomes
unresolved and the next intake treats it as a regression with a new repair cycle.

The six-hour scheduled workflow also resumes active repairs one at a time and
resolves terminal checked repairs one at a time before admitting another issue.
A legacy verification route produced by the retired repository-wide check is
replaced once with current task-path-scoped evidence; current failures are not
silently retried. If an admitted legacy run predates `work-domain-route`, the
driver may create only the schema-v3 legacy migration route: it binds a fresh
official Dex snapshot to the original immutable Sentry evidence, task mapping,
admission, integration receipt, legacy verification artifact, and current
verification-stage Factory state. It records `legacy-sentry-admission-migration`
as its authority and refuses to overwrite a route, so it never invents
pre-implementation provenance. Driver dependencies continue after intentionally skipped
prior stages, so a retry can resume from the current Factory stage instead of
reporting a successful no-op. If any admitted repair remains active after that
pass, the queue stays intact and no new repair is admitted.

Historical reproduction controllers, transport reservations, replay receipts,
and their stored resources remain readable, but no active self-healing workflow
calls them.

Local Swamp model versions are executable bundle cache boundaries, not release
labels. A change anywhere in a scheduled model's local import closure must
advance that model version and every active scheduled definition's
`typeVersion`. `scripts/scheduled-model-bundle-version.test.mjs` enforces this
for Sentry intake and admission so checked-in source cannot silently diverge
from the bundle selected by the scheduler.

## Logs and metrics

```bash
sentry log list --follow                    # live tail of client+server logs
sentry log list --query "severity:error"    # errors only
sentry trace list --period 1h               # recent requests with durations
sentry trace view <trace-id>                # span tree for one request
sentry span list <trace-id>                 # spans (export encode, API calls)
```

Request tracing is on at 100% sample (local single-user dev — there is no volume to shed). Route transactions give per-endpoint duration series for free; use `sentry explore` or a dashboard when a question needs aggregates (e.g. p95 of `/api/export/sessions/*/complete`).

### Export spans

Every export is its own transaction (`export.webm` / `export.prores`, op `export`). `export.encode` spans the local export-session lifecycle and contains `export.render-frames`, the serial render/PNG-upload loop. Attributes carry `export.route` (`/p/<slug>` — the per-composition dimension), fps, frames, duration, opacity, and audio presence; server session requests add generic encoder/output measurements such as `export.audio_bytes`, `export.ffmpeg_ms`, and `export.output_bytes`.

Video-track exports add only bounded aggregate operational context: whether Video clips participated, clip count, Timeline coverage, audio-enabled count, and authored Source-time/gain summaries. This context deliberately excludes Media library IDs and names, asset URLs/content hashes, original/local filenames, source byte size, codec/probe metadata, and decoded creator content. Do not attach the stable `state.media` records themselves. Sentry should answer whether the Video path participated and where export time went, not identify creator media. Reference read from the first verified trace of the historical singular foundation: a 6s blank WebM export = 79s total, of which 6.4s render and 73s VP9-lossless encode — exports are encode-bound, so encode settings are where export-speed work pays off.

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
