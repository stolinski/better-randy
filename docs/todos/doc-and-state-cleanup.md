# Doc + state cleanup (mechanical)

**Status:** planned, not started. Captured 2026-05-28. No design forks here — these are fixes with one obvious approach.

- [ ] **`engine-architecture.md` registry drift.** Doc says "7 presets, 2 overlays, `paper-grain` only effect, 7 surfaces"; reality is 22 presets, 8 overlays, 2 effects. The "Current registry contents" and `EffectType`/`OverlayType`/preset-count sections are stale. Update to match the live `PIPELINE_REGISTRY`, and reconcile the "5–7 built-in Presets" discipline with the demo-vs-deliverable split (see [rubric-recharter](rubric-recharter.md) preset-catalog hygiene).
- [x] **`cloneSurface` hand-enumeration (DONE, checkpoint Phase 1).** `cloneSurface()` now spreads `{ ...surface.content }` + copies `variant`, so new content slots can't fall through (it had silently dropped `counterpoint`, degrading every `type-hero` pair preset to single).
- [x] **Identity-Spec probe truthfulness (DONE, Phase 2 strip).** The atomic Identity-Spec refactor reconciled every fictional probe across 13 specs to match what actually renders (e.g. `chapter-card` fill-treatment now describes the transparent substrate, not a nonexistent card body). Whether the Critic ever *executes* probes (vs reads them) is still a separate, later question.
