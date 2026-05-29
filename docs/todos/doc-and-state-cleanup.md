# Doc + state cleanup (mechanical)

**Status:** planned, not started. Captured 2026-05-28. No design forks here — these are fixes with one obvious approach.

- [ ] **`engine-architecture.md` registry drift.** Doc says "7 presets, 2 overlays, `paper-grain` only effect, 7 surfaces"; reality is 22 presets, 8 overlays, 2 effects. The "Current registry contents" and `EffectType`/`OverlayType`/preset-count sections are stale. Update to match the live `PIPELINE_REGISTRY`, and reconcile the "5–7 built-in Presets" discipline with the demo-vs-deliverable split (see [rubric-recharter](rubric-recharter.md) preset-catalog hygiene).
- [ ] **`cloneSurface` hand-enumeration.** `src/lib/platform/preset.ts` `cloneSurface()` copies `content` field-by-field; any new content slot is silently dropped on preset load. Replace with a structural clone driven off the schema so slots can't fall through.
- [ ] **Identity-Spec probe truthfulness.** Many `identity.ts` `probe` descriptions describe things that don't render (e.g. `chapter-card` fill probe expects a "card body" that doesn't exist). Folded into the pack-wiring reconciliation ([pack-wiring-cleanup](pack-wiring-cleanup.md)): as each pipeline is migrated, make its probe text match what it actually renders, or delete the fictional dimension. Whether the Critic ever *executes* probes is a separate, later question.
