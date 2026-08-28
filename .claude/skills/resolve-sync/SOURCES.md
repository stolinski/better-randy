# Sources — resolve-sync

Synthesized 2026-07-16 from in-repo and live-verified material; export ownership revalidated against the current engine on 2026-07-21. No external retrieval: every Resolve behavior encoded here was verified live against Resolve Studio 21.0.2.4 (2026-07-15/16), which supersedes official API docs for the failure modes documented (false negatives, append refusals, crash modal).

## Inventory

- `docs/adr/0042-resolve-marker-sync.md` — decision, considered options, consequences (grammar v2 amendment landed 2026-07-16: color-blind read, END markers close spans, beat labels carry item text).
- `docs/adr/0042-resolve-marker-sync.md` — current marker grammar, re-place-never-re-speed semantics, span fallback, lint set, and shipped bridge scope.
- `scripts/resolve-markers.py` / `scripts/resolve-place.py` — wire shapes (source of truth for snapshot/plan JSON), invocation forms, marker-rewrite restore path.
- `src/lib/utils/marker-sync.ts` + `marker-sync.test.ts` — grammar constants, grouping, lints, derivation math, versioning, export filename.
- `src/lib/platform/composition-export-controller.ts` + tests — export planning, deterministic stepping, output classification, audio/video handoff, cancellation, downloads, and cleanup.
- `src/lib/platform/Workspace.svelte` — mounted `window.__gfxExport` callback and live Svelte/DOM/GPU dependencies delegated to the controller.
- `src/lib/platform/export-video.ts` — `SyncExportRequest` plus bounded WebM/ProRes session upload and native download primitives.
- `src/lib/platform/export-session.server.ts`, `src/routes/api/export/sessions/`, and `src/routes/api/export/export.test.ts` — ordered frame protocol, disk output streaming, cleanup, and the current ProRes 4444 encoding contract for transparent and opaque compositions.
- Project memory `resolve-mcp-bridge-mbp` — bridge topology, live gotchas (stale markers, linked-audio refusals, stranded audio, download seam, crash modal), and the 2026-07-16 corrections: identify by label not color, no named editor, Mint receipt stays.

## Coverage (workflow-process class)

Preconditions, ordered flow, failure handling, safety boundaries, and export ownership all trace to the inventory above. Retrieval stopped because the flow's knowledge originates in this repo and its live verification — external Resolve documentation is lower-trust than the recorded observed behavior.

## Gaps

- None. Grammar v2 (dex `lrggqgvz`) landed 2026-07-16: the code is color-blind (END markers, `parseBeatLabel`, `DeriveMarkerSyncOptions.group`), the interim shim is gone, and ADR-0042 is amended. Free-label *head* recognition (e.g. `<Title> Checklist Start`) intentionally stays a conversational-selection concern, not code — the customData receipt formalizes such groups after their first sync.
