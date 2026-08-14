# Critic report — lower-third-miranda-heath — 2026-08-13T16:22:31+00:00

## Verdict

**IMPLEMENTATION-FIX-REQUIRED**

The Preset's authored copy, timing, silence, hierarchy, and deterministic frame seeking are correct. It is not ready because the rendered lower-third exceeds the lower-third width limits in both orientations, clips at the vertical right edge, uses a hard-rim stepped shadow that fails gating rule R3, and the generic Overlay motion has none of the G8 motion principles required by the animation rubric.

## Capture setup

Sanctioned flag-enabled Chrome on CDP port 9223 (`CanvasDrawElement` available). The built-in route was captured at native backing sizes with explicit timeline seeks.

- Horizontal, 3840×2160: `.tmp-baselines/lower-third-miranda-heath/horizontal/p0.00.png`, `p0.05.png`, `p0.08.png`, `p0.11.png`, `p0.50.png`, `p0.93.png`, `p0.95.png`, `p0.97.png`, `p1.00.png`
- Vertical, 2160×3840: `.tmp-baselines/lower-third-miranda-heath/vertical/p0.00.png`, `p0.05.png`, `p0.08.png`, `p0.11.png`, `p0.50.png`, `p0.93.png`, `p0.95.png`, `p0.97.png`, `p1.00.png`
- Determinism repeats: `.tmp-baselines/lower-third-miranda-heath/determinism-a/p0.50.png` and `determinism-b/p0.50.png`

The screenshot harness composites transparent canvas pixels over the workspace's neutral gray backstop. It does not save alpha in the PNG.

## R-rule verification (gating)

- **R1 text sharpness — PASS.** At 200% on the subtitle in `.tmp-baselines/lower-third-miranda-heath/horizontal/p0.50.png` around `(300, 1400)` and the wrapped vertical subtitle in `vertical/p0.50.png` around `(180, 2670)`, strokes are crisp, not doubled, and have no visible color fringe. Probe outputs: horizontal `{"luma_range":0.8821,"max_step":0.8821,"max_step_normalized":1,"fringing_px":0.01,"transition_count":10554}`; vertical `{"luma_range":0.8821,"max_step":0.8821,"max_step_normalized":1,"fringing_px":0,"transition_count":10547}`.
- **R2 resampling — N/A.** The standard lower-third is native HTML-in-Canvas text and CSS chrome; there is no sampled image or scaled texture.
- **R3 shadow falloff — FAIL.** At 400% on the lower edge of the Syntax plate in `horizontal/p0.50.png` near `(500, 1863)` and `vertical/p0.50.png` near `(300, 3275)`, the shadow cuts from solid near-black to the backstop at a hard outer rim. The Pack explicitly supplies ten zero-blur shadow steps (`src/lib/packs/syntax/manifest.ts:288`). Shadow-only probe outputs were horizontal `{"channel":"luma","max_step":0.0039,"band_count":1,"transition_span_px":0}` and vertical `{"channel":"luma","max_step":0.0039,"band_count":1,"transition_span_px":0}`; `transition_span_px:0` agrees that there is no continuous falloff. **FAIL.**

Per `docs/critic.md`, an R-rule failure stops the ordered R/Q walk. R4–R8 and the full Q1–Q18 walk were not used to claim acceptance. The task-specific checks below were still completed so the Producer has actionable evidence.

## Task-specific checks

### Exact copy, wrapping, and hierarchy

- **PASS — exact strings.** Both settled captures visibly render `Miranda Heath` and `Director and Researcher @ Software Stewardship Lab`, including the literal `@`. These match `src/lib/presets/lower-third-miranda-heath.json` exactly.
- **PASS — copy wrapping itself.** Horizontal keeps the subtitle on one line. Vertical wraps after `Software` into two lines without splitting a word or losing text, satisfying L7's two-line maximum.
- **PASS — hierarchy.** The name is larger, bold, and full-strength; the role is smaller and muted. Source sizes are `7 * --cqmin` versus `4.3 * --cqmin` (`StandardCanvasSource.svelte:64,77`), with distinct weight and color. The title is unmistakably primary.

### Placement and lower-third safety

Measured from the neutral-backstop pixel difference in the settled native captures:

| Orientation | Visible changed-pixel bounds | Width | Height | Result |
|---|---:|---:|---:|---|
| Horizontal | `(240,1340)`–`(2868,1864)` | 68.44% | 24.26% | **FAIL L2** (limit 60%); top is in L1's 0.62–0.72 band, but visual mass is taller than L1's 10–18% guidance. |
| Vertical | `(135,2612)`–`(2160,3276)` | 93.75% | 17.29% | **FAIL L2** (limit 90%); pixels reach the right canvas edge, so the plate/shadow is clipped. Bottom reaches y=0.853, beyond L1's required 0.84 clearance. |

The long exact subtitle is not the defect: an orientation-aware lower-third must constrain its own inline size and wrap the same copy. `StandardCanvasSource.svelte:31` has no aspect-aware `max-inline-size`, and the mount sizes to content.

### Transparency

- **PASS at composition/classification level.** The Preset declares neither `state.backgroundFill` nor `state.stage`, has no Effects, and therefore classifies as transparent under G12. The gray outside the plate is the capture backstop showing through, not an authored field. Static corpus verification passed.
- **Limitation:** the CDP screenshot is flattened to opaque RGB by Chrome, so this run did not independently decode a ProRes 4444 export to measure zero-alpha edge pixels. No alpha failure is visible or implied by the composition.

### Timing and motion

- **PASS — authored durations.** Six-second transport × enter duration `0.06` = **360 ms**. Six seconds × exit duration `0.042` = **252 ms**. Exit is exactly 70% of enter, or 30% shorter. These satisfy G6. Enter uses `settled`; exit uses `smooth`, satisfying G7.
- **PASS — frame evidence for duration.** `p0.05` is the enter start (0.30 s), `p0.08` is mid-enter (0.48 s), and `p0.11` is the enter end (0.66 s). `p0.93` is the exit start (5.58 s), `p0.95` is mid-exit (~5.71 s), and `p0.97` is the exit end (~5.83 s). No pop was observed.
- **PASS — read time.** Settled screen time is `6 × (0.93 − 0.11) = 4.92 s`, inside L4's 4–6 second band and adequate for the ten-word stack at 2× 200 wpm (3.0 s).
- **FAIL — G8 choreography.** `OverlayMount.svelte:120–142` only combines opacity with a straight 32 px `translateY`. It clamps away the `settled` overshoot and supplies no anticipation, follow-through, arc, stagger, or secondary action. The source therefore cannot identify even one required G8 principle beyond slow-in/slow-out.

### Silence and determinism

- **PASS — silence.** `probe-sound-map.ts` reports `cues: []`, `manualCues: []`, and muted IDs `overlay:main:enter` and `overlay:main:exit`. Both timing blocks explicitly set `sound.mute: true`.
- **PASS — deterministic seeking.** Two independent sanctioned-CDP captures at progress 0.50 are byte-identical: SHA-256 `8534ad7fe4098277f91b9bdfc0f6f61abc2e53c89f2e6abb4cb2e3a051f3a12b` for both files.

### Other numeric probes

- Native dimensions: horizontal `{"width":3840,"height":2160}`; vertical `{"width":2160,"height":3840}`.
- Q4 palette probe: zero saturated hue clusters in both captures. The restrained warm-neutral card is coherent with the Syntax Pack.
- Q9 negative space probe: horizontal `quiet_ratio:0.8351`; vertical `quiet_ratio:0.8387`, both comfortably above 30%.
- `npm run verify-presets`: all schema, semantic, Pack, identity, and static safety/readability checks passed. The render-measured defects above remain.

## Findings

### [pipeline-bug] Standard lower-third does not constrain rendered width by orientation

- **Where:** `src/lib/pipelines/overlays/lower-third/variants/StandardCanvasSource.svelte:31`; mount sizing in `src/lib/platform/OverlayMount.svelte`
- **Evidence:** `horizontal/p0.50.png` spans 68.44% against L2's 60% limit. `vertical/p0.50.png` spans 93.75%, reaches x=2160, and clips its right chrome.
- **Proposed fix:** Give the lower-third an orientation-aware maximum inline size that accounts for padding, border, and shadow, then let the subtitle wrap inside it. Keep the same Preset and exact copy in both orientations.

### [pipeline-bug] Syntax lower-third shadow fails gating R3

- **Where:** `src/lib/packs/syntax/manifest.ts:288` consumed by `StandardCanvasSource.svelte:50`
- **Evidence:** settled captures at the lower shadow edge; the outer rim has zero falloff span.
- **Proposed fix:** Replace the zero-blur shadow stack with continuous, multi-zone falloff that still reads flat and decisive, or revise the binding rubric before accepting stepped hard shadows as intentional. A Preset value must not hide this defect.

### [pipeline-bug] Generic Overlay motion cannot satisfy G8

- **Where:** `src/lib/platform/OverlayMount.svelte:120–142`
- **Evidence:** entry captures plus source inspection. The only intrinsic motion is straight `translateY` + opacity, and line 129 clamps away the `settled` overshoot.
- **Proposed fix:** Add a lower-third-appropriate authored motion form with at least one identifiable G8 principle, such as a small anticipation or a bounded settle/follow-through, while preserving the 360/252 ms envelopes and deterministic seeking.

### [preset-choice] The 0.16 bottom offset does not clear the vertical visual shadow

- **Where:** `src/lib/presets/lower-third-miranda-heath.json:38–41`
- **Evidence:** `vertical/p0.50.png` visible pixels end at y=3276 (0.853), beyond the 0.84 clearance line.
- **Suggested value:** After the Pipeline measures its full visual bounds correctly, raise the block enough that all chrome clears y=0.84 in vertical without leaving the horizontal L1 band.

### [rubric-gap] Syntax's required stepped shadow contradicts R3 and Q16

- **Where:** `docs/packs/syntax/aesthetic.md` calls for a chunky stepped shadow, while `docs/quality-rubric.md` R3 requires every shadow to have continuous gaussian falloff and Q16 requires soft multi-zone falloff.
- **Suggested rule:** Decide explicitly whether a geometric offset-stack is a non-physical graphic extrusion rather than a shadow. Until the docs make that carve-out, the current pixels fail R3 as written.

## Recommendation

**IMPLEMENTATION-FIX-REQUIRED.** Do not revise the exact copy, 360/252 ms timing, silence, or hierarchy. Fix the lower-third Pipeline's orientation-aware width and motion behavior, reconcile/fix the hard shadow, then re-run both native orientations and an actual alpha-preserving export decode.
