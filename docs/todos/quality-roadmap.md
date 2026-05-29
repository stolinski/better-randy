# Quality roadmap — Hiviz (master tracker)

**This is the single source of truth for what to do next.** Other todo docs are sub-plans linked from the index at the bottom. From the 2026-05-28 quality-gap audit. Priority: end-output quality / high-end video.

**Framing rule (load-bearing):** the engine builds *capabilities*; each Pack supplies the *choices*. Don't hardcode the Syntax look (fonts, torn edges) into the engine — see [[feedback_torn_edge_is_pack_not_engine]] and ADR-0023.

## Status at a glance
- ✅ **Done:** 1 fonts · 2 render path (16-bit + dither + QUALITY_HIGH) · 3 motion overshoot + dead controls · 4 **first deliverable accepted** (`lower-third-cinematic`).
- 🔨 **Active:** 5 **pack wiring** — the next move ([pack-wiring-cleanup.md](pack-wiring-cleanup.md)).
- ⏭ **Queued (sequence):** 6 heavy primitives (substrate + edge-treatment) · 7 animation model + corpus hygiene.
- 🗂 **The bulk (beyond the sequence):** mass-produce a Critic-accepted deliverable per surface/overlay family — see *Beyond the sequence*.

**Original diagnosis:** strong shaders on a foundation missing its base materials (no fonts, no substrate, no edge-treatment) + declared-but-dead intent layers + an 8-bit path. Steps 1–4 retired the foundational/uncertain part; what remains is bounded execution.

## Sequence (impact-per-effort order)

- [x] **1. Font loading (general capability).** `PackManifest.fonts` + `src/lib/platform/fonts.ts` `fontsReady()`; Syntax pack self-hosts EB Garamond / Playfair Display / Old Standard TT / JetBrains Mono / Inter via `@fontsource` (`src/lib/packs/syntax/fonts.ts`). Preview first-paint + both export paths gate on `fontsReady()`. svelte-check + vite build clean; woff2 bundled. **Visually confirmed in-canvas** (2026-05-29): `research-paper-attention` title renders EB Garamond (601px) not Georgia fallback (676px); all 5 families load.
- [~] **2. Render signal path (L, whole-corpus).**
  - [x] All off-screen intermediates → **`rgba16float`** via shared `INTERMEDIATE_FORMAT` (gpu-host): surface output textures (paper/plain), shader-pass + effect-chain ping-pong, and their pipeline targets. DOM/marks textures stay `rgba8unorm` (8-bit source).
  - [x] **Dithered present pass** — the old blit is now a present pass that does the single 16float→8bit canvas write with interleaved-gradient-noise ordered dither (~1 LSB on premultiplied rgb, alpha exact). Every frame ends through it, effects or not. This is the banding fix; float precision alone wouldn't do it.
  - [x] **`QUALITY_HIGH`** export (was `QUALITY_MEDIUM`) — stops 4K VP9 macroblocking.
  - [x] Verified: svelte-check + vite build clean; reloaded `research-paper-attention` and `chapter-card-cinematic` in the flagged Chrome — both render correctly, no WebGPU/WGSL/pipeline errors, no color/alpha regression. (Dramatic banding improvement is by-construction + best seen at native 4K / in export; downscaled preview hides it.)
  - [ ] **Deferred — linear-light blending.** Changes the *look* (composite math), risky; separate pass with heavy before/after verification. Not part of the banding fix.
  - [ ] **Dropped — MSAA.** The audit recommended it, but the compositor is fullscreen-quads (no internal geometry edges), so MSAA does nothing here; edge AA already comes from the browser-AA'd DOM texture + analytic SDF shaders. Revisit only if real rasterized geometry is added.
- [x] **3. Dead motion controls (S).**
  - [x] Removed the `[0,1]` clamp on eased progress in `generic-stagger.ts` `interpolateKeyframe`; geometric channels now overshoot, opacity/blur/scale stay physically bounded via `clampChannel`. Spring/`back`/`elastic` eases are no longer flattened. svelte-check clean; **visual confirmation pending Chrome.**
  - [x] `entry.enter.ease` resolved (kept, not wired): text-anim easing is intrinsic to the catalog effect (`spec.enter.easing`), so per-entry ease is a no-op for text anims — removed the needless reactivity tracking in `Workspace.svelte` + documented why. The `ease` field stays (it's the shared `Transition` shape and *does* drive surface/overlay transitions).
  - [x] `cameraMotion` resolved (kept-deferred, control hidden): camera push/snap is data-modeled + G10-safety-checked but not yet rendered (a documented follow-up). Hid the inert Controls selector (`paper` `controls.camera: false`) so the UI doesn't lie; schema field + rubric + preset data retained. Reversible one-liner when camera motion is wired.
- [x] **4. First deliverable — ACCEPTED 2026-05-29.** `lower-third-cinematic` (Rich Harris / Creator of Svelte). Critic ran full protocol → REVISE; Producer fixed all actionable findings (flare sweep removed per user, enter/exit into G6 bands, subtitle over the G4 floor); user accepted directly (the two `aesthetic-miss` items — cinematic≠collage, warm-mono palette — are sanctioned ADR-0020 variant deviations). **The first Critic-grade, genuinely high-end overlay in the repo.** It's the visual + process reference the rest are measured against. (Note: `docs/todos/lower-third-aesthetic.md` describes a *different*, torn-collage treatment of the *standard* lower-third + watermark — not fulfilled by this, and now reframed under step 6's general edge-treatment.)
- [ ] **5. Wire packs (ADR-0023/0024).** `resolveStyle`/`resolveRole` → CanvasSources; reconcile manifest values to what pipelines paint. Now there are real values (fonts, colors) to route. See [pack-wiring-cleanup](pack-wiring-cleanup.md).
- [ ] **6. Heavy primitives (XL).** General image/video **substrate input**; general **configurable edge-treatment** primitive (clean / soft / irregular / torn / none) driven by the pack `edge-treatment` role — torn is one value, not a default.
- [ ] **7. Animation model + corpus hygiene (XL).** Generalize the 2-keyframe tween to ordered `keyframes[]` with per-channel ease; per-overlay enter descriptors; re-author presets for staggered follow-through; quarantine the demo presets to fixtures; fix `docs/briefs/README.md` surface-vocabulary drift (names 4 surfaces not in `SurfaceTypeSchema`).

## Beyond the sequence (the bulk of the remaining work)

- **The corpus.** One preset is ship-grade (`lower-third-cinematic`); ~21 are fixtures. Each surface/overlay family needs a real, Critic-accepted deliverable authored to that bar. Largest body of *hours*, but now **repeatable** (Critic loop + reference exist). Gated behind pack wiring (real colors) and, for on-photo/collage families, the step-6 primitives. Hygiene part: quarantine the demo presets to fixtures; fix `docs/briefs/README.md` surface-vocabulary drift (names 4 surfaces not in `SurfaceTypeSchema`).
- **Long tail (real, not blocking):** camera motion (wire the deferred, currently-hidden feature) · block types (mermaid / code / image / chart — none built) · linear-light blending (deferred from step 2) · the torn-collage lower-third + watermark variant ([lower-third-aesthetic.md](lower-third-aesthetic.md), now reframed under step-6 edge-treatment) · `probe-timeline.ts` for the G6/L4 timing rubric-gap.

## Todo index (sub-plans — status)

- **[pack-wiring-cleanup.md](pack-wiring-cleanup.md)** — 🔨 active (step 5). The detailed pack-wiring sequence.
- **[rubric-recharter.md](rubric-recharter.md)** — ✅ mostly done; open: reclassify demo presets to fixtures (overlaps the corpus-hygiene item).
- **[doc-and-state-cleanup.md](doc-and-state-cleanup.md)** — ⏭ open: `engine-architecture.md` registry drift, `cloneSurface` field-drop fragility, identity-probe truthfulness (folds into pack rollout).
- **[lower-third-aesthetic.md](lower-third-aesthetic.md)** — ⚠ partly stale: decided a torn-collage lower-third (hardcoded torn + `#fabf47`), which conflicts with "torn is pack, not engine." Re-fold its useful decisions into the step-6 edge-treatment primitive; don't implement as written.
- **[fixer-sub-agent.md](fixer-sub-agent.md)** — ⏸ deferred design question (auto-fix Critic findings); revisit after more Critic runs.
- **[research-paper-attention-revise.md](research-paper-attention-revise.md)** — check/close (predates this session's preset retunes).
