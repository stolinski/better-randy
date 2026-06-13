# Rubric re-charter: static linter = video-safety + readability only

**Status:** in progress. `lintPreset` re-chartered 2026-05-28. See [ADR-0025](../adr/0025-static-linter-checks-safety-and-readability-only.md).

The static linter (`preset-rubric.ts`) grew into a motion-timing *taste* gate and failed 16/22 presets, so it was being ignored. Re-charter it to its intended job: objective, JSON-computable **video-safety + readability**, orientation-aware. All taste moves to the Critic's G/Q rubric docs.

Two layers, do not re-merge:
- **`lintPreset`** (`preset-rubric.ts`) — JSON-computable safety/readability, hard errors, the build gate (`verify-presets.ts`).
- **`lintPresetVisual`** (same file) — render-measured checks, called by `runtime-audit.ts` (the visual-audit path), **not** the build gate.
- **Rubric tiers** R/Q/G (`quality-rubric.md`, `animation-rubric.md`) — judged by eye by the Critic.

## Done

- [x] **`lintPreset` re-chartered.** Kept (errors): A1, A3-no-segment, G2, G3, G5, G6-pre-mark *floor*, G6-post-mark, L1, L4 *floor*, G10 (warn). Deleted → Critic: G6 enter/exit bands, exit:enter ratio, A3 duration bands, A2 stagger, G6-pre-mark *ceiling*, L4 *ceiling*, L3, G7. Confirmed with Scott: L1 stays; L3 + G7 → Critic.
- [x] **Ownership annotated** in `animation-rubric.md` (who-enforces-what block) + `CONTEXT.md` *Preset linter* term.
- [x] **Verified:** `svelte-check` 0 errors; gate went 6/22 → **13/22** passing. Remaining 9 failures are all genuine readability/safety (see below), not taste.

## Done (cont.)

- [x] **Read-window made content-derived + correct.** Post-mark read = `words ÷ 200 × 60` at **1×** (was 1.5×); stacked marks on one span (`[magnify][side-note]`) now count as **one** read via `segmentIndex` dedupe in `flattenBody`/`checkHoldTime` (the bug that made pullquotes unsatisfiable). Lower-third hold floor 4s → **2.5s** read-floor (was the bottom of an industry taste band).
- [x] **5 real deliverables retuned** to pass on readability (render-is-truth otherwise): `quote-magnify` (16-word hold 4.8s), `quote-lift-out` (6s→7s), `quote-tear-out`, `quote-vertical`, `research-paper-critique` (3 marks staggered with read gaps). Fast settle + 0.7s glance + read window before exit. **20/22 pass; svelte-check 0 errors.**

## Open

- [x] **2 demos reclassified (Phase 3, 2026-05-29):** `cursor-trail-demo` + `newspaper-body-test` now carry `kind:'fixture'`; the gate schema-checks fixtures but skips rubric floors for them, so the gate is fully green.
- [x] **`lintPresetVisual` re-chartered** — cut cap-height *ceilings*, title:body ratio, T1 card-mass (→ Critic); kept cap-height *floors*, G4-density measure, text-in-safe-zone. File now 704 lines (was 1042); `svelte-check` 0 errors.
- [x] **Preset-catalog hygiene (Phase 3, 2026-05-29)** — added `kind: 'deliverable' | 'fixture'` to `PresetSchema`; 9 fixtures tagged; `listPresets()` shows 13 deliverables only; `getPresetBySlug` still resolves fixtures so `/p/<slug>` works. **This doc is now fully done.**

## Acceptance

- Linter errors only on objective safety/readability, orientation-aware. ✓ for `lintPreset`; pending for `lintPresetVisual`.
- No motion-timing taste in `lintPreset`. ✓
- Deliverable presets pass the gate; remaining failures are genuine readability/safety bugs. ✓ (9 real bugs to fix)
- `animation-rubric.md` marks linter-vs-Critic ownership per rule. ✓
