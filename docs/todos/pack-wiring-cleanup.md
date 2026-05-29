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

- [x] **Plumbing built** (2026-05-29): `packs/resolve.ts` `resolveAppearanceVars(manifest, pipelineType)` — core vocab `fill/ink/accent/edge/depth/light`, specific→core fallback (ADR-0024), string style Roles → CSS vars. `engine-state` `packState` (active slug); `applyPreset` sets it from `preset.pack` (schema already had `pack`, default `'syntax'` — still needs tightening to required, no-default later). `OverlayMount` injects the vars on the overlay mount root. `SurfaceMount` injection still TODO (surfaces not yet wired).
- [x] **2nd pack gate PASSED** (2026-05-29): new `editorial-mono` Pack overrides `lower-third.accent`; the same `lower-third-cinematic` preset re-skins the accent (orange `#f4a85e` → cyan `#22d3ee`) — verified by computed-style readback + screenshot. Render-is-truth holds under `syntax` (bar/kicker still `rgb(244,168,94)`, zero change). **The abstraction is real.**
- [x] **Lower-third var-ified** — accent + ink + role-ink end-to-end (render-is-truth). Remaining bit: the scrim alpha-gradient (needs rgb-channel or relative-color handling — with the rest).
- [x] **Overlays rolled out** (2026-05-29, 7-agent workflow): watermark / counter / instance-stack / text-3d var-ified → `var(--slot, #hex)` + syntax consumed Roles; cursor-trail / shader-fill / washi-tape had nothing safely var-ifiable (SVG attrs / GPU uniforms / prop-bound + alpha-gradient) — skipped. svelte-check + gate clean; counter `--ink` resolves render-is-truth. OverlayMount injects for all overlays already.
- [ ] **SurfaceMount injection + surface CanvasSources** — DIFFERENT path: SurfaceMount mounts the surface CanvasSource *as* the captured element (no wrapper), so vars must land on the article itself (set on the bound `element`, or a `vars` prop the CanvasSource applies to its root). Then var-ify paper/plain/chapter-card/etc. (note surfaces also pull some colors from `typography.paperColor/inkColor` preset-state — reconcile vs hardcoded).
- [ ] **Skipped-color pass** — the alpha/gradient/prop-bound colors the workflow left (watermark plate bg, washi-tape grain, cursor-trail trail, shader-fill GPU uniforms): richer handling (rgb-channel vars / relative color / route shader uniforms through the Pack).
- [ ] **Strip motion Roles** (`enterMotion`, `bodyEnter`, `focalMotion`, …) from manifests; re-declare `implementation` on Identity Specs.
- [ ] **Reconcile fictional Roles** — delete the old unconsumed `*.fill`/`*.inkFill` Roles + the stale `lower-third.light: anamorphic-flare`; update Identity Spec probe text to match what renders.
- [ ] **Delete dead Roles** once nothing references them (the 4 currently-unreferenced bare cores were the *intended* model — they survive as the fallback target; the unreferenced `counter.enterMotion`/`counter.frameRelationship` go).
- [ ] **Regenerate** `docs/preset-format.schema.json`; `verify-presets.ts` green.

## Acceptance

- `resolveStyle` is called on the render path; no inline hex in CanvasSources or presets.
- Before/after screenshots identical under `syntax` for every migrated pipeline (render-is-truth).
- `lower-third` (and ≥1 more) renders visibly different under `editorial-mono`.
- A minimal new Pack costs ~6 values to author.
