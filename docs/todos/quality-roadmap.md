# Quality roadmap — getting to the first high-end deliverable

**Status:** in progress. From the 2026-05-28 multi-agent quality-gap audit. Priority: end-output quality / high-end video.

**The diagnosis:** the shaders are genuinely strong but paint onto a foundation missing its base materials — no loaded fonts, no photographic substrate input, no configurable edge treatment — plus declared-but-dead intent layers (packs, cameraMotion, clamped overshoot) and an 8-bit signal path. No preset has ever passed the Critic; all 22 are fixtures.

**Framing rule (load-bearing):** the engine builds *capabilities*; each Pack supplies the *choices*. Don't hardcode the Syntax look (fonts, torn edges) into the engine — see [[feedback_torn_edge_is_pack_not_engine]] and ADR-0023.

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

## First deliverable target
**Cinematic lower-third** — only family needing no new primitive (pipeline + variant + flare shader exist; sits over the editor's own footage, so no substrate needed). Path = steps 1→2→3→real copy→drive `/critic` to ACCEPT.
