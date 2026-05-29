# Pack wiring + cleanup

**Status:** planned, not started. Decisions locked 2026-05-28 in a grilling session.

The Pack/Role/Identity system is declared everywhere but consumed nowhere — `resolveStyle`/`resolveRole` are never called by rendering, CanvasSources hardcode color, and some manifest values contradict what their Pipeline actually paints. We are **finishing** it (wiring resolution to pixels), not cutting it. See [ADR-0023](../adr/0023-pack-is-appearance-only.md) and [ADR-0024](../adr/0024-role-resolution-core-fallback.md).

## Locked decisions

- **Finish** the Pack system — wire resolution to pixels.
- **Pack = appearance only** (color/edge/depth/light/font/material/asset). All motion intrinsic to Preset/Pipeline. [ADR-0023]
- **No default Pack.** `pack` is a required preset field; active Pack is runtime-overridable. [ADR-0023]
- **Hybrid Role resolution** — specific (`chapter-card.fill`) → core (`fill-treatment`) fallback. [ADR-0024]
- **CSS vars at mount root** — one `resolveIdentity()` helper; mounts inject `--fill` etc.; CanvasSources consume `var()`.
- **Render is truth** — behavior-preserving refactor; zero pixel change, proven by before/after screenshots.
- **A second Pack (`editorial-mono`) is the acceptance gate** — must visibly re-skin the proof slice before rollout.

## Proof-slice findings (lower-third — verified 2026-05-29)

Reading the real code surfaced the two first decisions, both bigger than "find/replace hex":

1. **Role granularity / core vocabulary.** The lower-third Identity Spec declares 4 abstract roles (`fill`/`edge`/`depth`/`light`), but `CinematicCanvasSource` paints **5 concrete colors** (scrim, accent, ink `#fff8ec`, role `#d8c4a0`, kicker `#f4a85e`). The 4 roles don't cover ink/role/kicker. **Decision:** the **core appearance vocabulary** must include the slots CanvasSources actually use — `fill`, `ink`, `accent`, `edge`, `depth`, `light` (+ font/material/asset) — and a pipeline references the specific role (`lower-third.ink`) with core fallback (`ink`) per ADR-0024. So the manifest grows per-pipeline appearance roles to match each pipeline's real color slots; the small core set is the fallback floor.
2. **Manifest is fiction — reconcile render-is-truth.** `lower-third.fill = #0e0e10` but the scrim paints `#08060a`; `edge.color = #fabf47` but the accent paints `#f4a85e`; `lower-third.light` still says `anamorphic-flare` **which step-4 removed**. Every migrated pipeline must set its manifest role values to the *actual rendered* colors (zero pixel change), not the pre-existing fictional ones.

These make the per-pipeline rollout a real reconcile-per-pipeline task (good candidate for a workflow once the resolver + proof slice exist).

## Sequence

- [ ] **Normalize dimension names** so a core fallback exists per dimension (`inkFill`/`fragmentFill`/`boxFill` → `fill`; define core `fill-treatment`/`edge-treatment`/`depth-treatment`/`light-treatment` + font/material/asset cores).
- [ ] **Build the plumbing**: `resolveIdentity(pipelineKey, pack)` with specific→core fallback; CSS-var injection in `SurfaceMount`/`OverlayMount`; `engineState.activePack`; `pack` field on the preset schema (required); runtime pack override.
- [ ] **Strip motion Roles** (`enterMotion`, `bodyEnter`, `focalMotion`, …) from manifests; re-declare them `implementation` on their Pipelines' Identity Specs.
- [ ] **Proof slice — `lower-third`** end-to-end, render-is-truth (before==after screenshot). Extract its current colors/fonts into `syntax` Roles.
- [ ] **Stand up `editorial-mono` Pack** (overrides ~6 core Roles). Confirm the same `lower-third` preset renders visibly different under it. **This is the acceptance gate.**
- [ ] **Roll out pipeline-by-pipeline** (~7 surfaces + 8 overlays + paragraph + annotations). At each: reconcile the three-way disagreement (CanvasSource paints ↔ manifest claims ↔ spec probes), extract values into `syntax`, delete fictional Roles, make probe text truthful or delete it.
- [ ] **Delete dead Roles** once nothing references them (the 4 currently-unreferenced bare cores were the *intended* model — they survive as the fallback target; the unreferenced `counter.enterMotion`/`counter.frameRelationship` go).
- [ ] **Regenerate** `docs/preset-format.schema.json`; `verify-presets.ts` green.

## Acceptance

- `resolveStyle` is called on the render path; no inline hex in CanvasSources or presets.
- Before/after screenshots identical under `syntax` for every migrated pipeline (render-is-truth).
- `lower-third` (and ≥1 more) renders visibly different under `editorial-mono`.
- A minimal new Pack costs ~6 values to author.
