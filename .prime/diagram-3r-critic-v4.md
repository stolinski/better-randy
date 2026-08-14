# Critic report — diagram-3r-principle — 2026-08-12T23:54:50.406576+00:00

## Scope and capture provenance

- Artifact: `user-compositions/diagram-3r-principle.json` (User composition).
- Route: `http://localhost:7263/p/diagram-3r-principle` — no `source=builtin` query.
- Browser: sanctioned flag-enabled Chrome on CDP 9223; `CanvasDrawElement` probe returned `true`.
- Capture order was sequential, never parallel: horizontal first, then vertical. The capture harness's orientation control autosaves User compositions, so the task-start JSON was restored byte-for-byte after orientation capture; the reviewed artifact has no content changes.
- Horizontal sequence: `.tmp-baselines/diagram-3r-principle-v4-horizontal/` (44 requested samples spanning entrances, hold, and exit; two-decimal filenames cause the documented close-sample overwrites).
- Stable vertical sequence: `.tmp-baselines/diagram-3r-principle-v4-vertical-stable/` (21 samples spanning every reveal cluster and the exit).
- Settled frames: `.tmp-baselines/diagram-3r-principle-v4-horizontal/p0.90.png` and `.tmp-baselines/diagram-3r-principle-v4-vertical-stable/p0.90.png`.
- Determinism recaptures: `.tmp-baselines/diagram-3r-principle-v4-determinism-horizontal/p0.90.png` and `.tmp-baselines/diagram-3r-principle-v4-determinism-vertical/p0.90.png`.

## R-rule verification (gating)

- **R1 text sharpness:** At 200% on the headline in horizontal `p0.90.png` at (1050,160), strokes are crisp single-pixel transitions without fringe. Probe: `probe-text-edge.ts --region 1050,160,1750,220` → `{"luma_range":0.7491,"max_step":0.7491,"max_step_normalized":1,"fringing_px":0.01,"transition_count":4059}`. Vertical at (250,170) → `{"luma_range":0.7491,"max_step":0.7491,"max_step_normalized":1,"fringing_px":0.01,"transition_count":3754}`. **PASS.**
- **R2 transformed content:** At 200% on the scaled headline and box-node labels in both settled captures, final-scale edges are equally sharp, with no blockiness, doubling, or sampled media softness. The R1 normalized edge step is `1` in both orientations. **PASS.**
- **R3 shadow falloff:** At 400% below the horizontal RESULT node in horizontal `p0.90.png` at (1328,1255), the hard offset remains explicit plate geometry and the separate outer cast shadow resolves continuously. Probe: `probe-banding.ts --region 1328,1255,160,120 --channel luma` → `{"channel":"luma","max_step":0.1692,"band_count":1.17,"transition_span_px":0.1}`. At 400% below vertical RESULT at (950,1344), Probe `--region 950,1344,250,60` → `{"channel":"luma","max_step":0.0036,"band_count":1,"transition_span_px":0}`; the RESPONSIBILITY and RESPONSE shadow regions return the same `max_step=0.0036, band_count=1`. No outer hard rim or visible bands. **PASS.**
- **R4 oblique-edge AA:** At 400% on the horizontal yellow arc at (1400,780), Probe `probe-edge-aa.ts --region 1400,780,650,450 --channel luma` → `{"hard_stairsteps":68,"smooth_pixels":503,"coverage_ratio":0.881}`; visual inspection confines hard samples to joins/arrowhead geometry. On the vertical passive arc at (1300,1300), Probe → `{"hard_stairsteps":22,"smooth_pixels":295,"coverage_ratio":0.931}`. Boundaries show fractional coverage. **PASS.**
- **R5 tonal banding:** At 200% in the empty lower-right horizontal field at (2800,1700), Probe `--region 2800,1700,700,300` → `max_step=0, band_count=1`. Vertical empty field at (100,3400), `--region 100,3400,500,300` → `max_step=0, band_count=1`. **PASS.**
- **R6 native resolution:** `probe-dimensions.ts` → horizontal `{"width":3840,"height":2160}`; vertical `{"width":2160,"height":3840}`. Harness banners independently report backing stores `3840x2160` and `2160x3840`. **PASS.**
- **R7 codec artifacts:** At 200% on text, borders, and arrowheads in both lossless native-canvas PNGs, no ringing, macroblocking, mosquito noise, or chroma bleed is visible. Probe: not applicable to the lossless preview capture; no encoded export was requested. **PASS for captured render.**
- **R8 failure ownership:** No render-quality defect is hidden by a Preset workaround. **PASS.**

## Exact prior-finding convergence

- **Prior G4 headline failure is fixed.** Runtime canvas font measurement gives headline `actualBoundingBoxAscent=78.65424346923828 px` before item scale. Horizontal `scale:1.38` therefore renders a **108.5429 px cap height**, inside the 60–110 px Diagram-headline band. Vertical `1.28` renders **100.6774 px**, inside 76–138 px. **PASS.**
- **Prior G6 timing failure is fixed.** Surface plus all 13 Diagram primitives declare `enter.duration:.035` and `exit.duration:.026`: 350 ms and 260 ms on the 10-second Timeline. `1 - .026/.035 = 0.257142857`, so every matching exit is **25.7% shorter**, within the required 20–30%; 350 ms enters and 260 ms exits also clear the absolute bands. All exits share `start:.94`; both sequences fade continuously through `p0.95/p0.96/p0.97` and are clean field by `p0.98`, with no stranded item or pop. **PASS.**

## Q1–Q18, motion, layout, and sound regression

- **Q1–Q18:** Flat printed-rule/card identity, single loud yellow, coherent plate/cast-depth ordering, short measures, ample quiet space, one focal addition per beat, disciplined corners, no effect-stack conflict, and two type families remain intact. Q4: one saturated hue (`45°`; 6,476 downsampled horizontal pixels / 5,216 vertical). Q9: horizontal `ink_ratio=.0416, quiet_ratio=.9584`; vertical `ink_ratio=.049, quiet_ratio=.951`. Entrance and exit samples remain composed. **PASS except the G4/G3 findings below.**
- **G1/G2/G5/G7–G12:** Native 4K, horizontal title-safe placement, contrast, semantic settled/smooth easing, motion safety, explicit opaque background, real orientation reflow, and frame-addressable seeks pass. No element clips the canvas or collides with another in either settled frame or the sampled entrance/exit sequence.
- **Determinism:** The independent horizontal `p0.90` recapture is byte-identical to the sequence frame (SHA-256 `6cafe34af5cb141204b1a17b470036f521f8567df90710370abcc3d88922ff24` for both). The independent vertical pair is also byte-identical (SHA-256 `d25b218a0766c7b3d579f80d284164b048ddb33e1a63616223d3a02da255d65c` for both). **PASS.**
- **Sound:** Recursive data audit finds **28 automatic transition sound objects, all exactly `{"mute":true}`**. There are exactly **nine** manual cues, all `foley-tick`, `duration:.014`, `volume:.22`, at `.03,.12,.20,.28,.38,.50,.56,.64,.71`. **PASS.**

## Findings

### [preset-choice] Vertical DELIBERATE ROUTE caption narrowly misses the G4 floor

- **Where:** `user-compositions/diagram-3r-principle.json` → `surface.diagram[id=l-active].orientationOverrides.vertical.scale` (`.78`).
- **Evidence:** `.tmp-baselines/diagram-3r-principle-v4-vertical-stable/p0.90.png` at approximately (121,2008)–(549,2063).
- **Measurement:** runtime `actualBoundingBoxAscent=40.09823989868164 px`; `.78` scale yields **31.2766 px**, below the 32–60 px Diagram node/caption-label band. The neighboring vertical caption scales `.82` yield 32.8806 px and pass.
- **Suggested value:** raise only this vertical override to at least `.799` (practically `.80`) while retaining its current placement.

### [preset-choice] The vertical source line enters the bottom platform-UI exclusion band

- **Where:** `user-compositions/diagram-3r-principle.json` → `surface.diagram[id=l-source].orientationOverrides.vertical.position.y` (`.83`) and `scale` (`.84`).
- **Evidence:** `.tmp-baselines/diagram-3r-principle-v4-vertical-stable/p0.90.png` at approximately (739,3138)–(1417,3241).
- **Measurement:** G3's readable lower boundary is `.84 × 3840 = 3225.6 px`. Direct pixel segmentation finds painted source glyphs through **y=3241 (`.8440`)**, 15.4 px inside the bottom exclusion band. It is canvas-unclipped but not fully platform-safe.
- **Suggested value:** move the vertical source upward by about 20–24 px (normalized y around `.824`) while retaining the now-passing `.84` scale and G4 cap height of 33.6825 px.

### [aesthetic-miss] The technically valid soft cast shadow remains outside the Syntax Pack's chrome vocabulary

- **Where:** Diagram box-node depth treatment in the settled frames.
- **Evidence:** horizontal RESULT lower-right depth edge at (1328,1255), `.tmp-baselines/diagram-3r-principle-v4-horizontal/p0.90.png`.
- **Aesthetic-doc reference:** `docs/packs/syntax/aesthetic.md` §§ Card System / Anti-Aesthetic (“No gaussian shadows on chrome, ever”). The explicit hard backing plate remains dominant and R3 passes; this note is advisory and non-gating.

## Classification and verdict

- `pipeline-bug`: **0**
- `default-too-permissive`: **0**
- `preset-choice`: **2**
- `aesthetic-miss`: **1** (non-gating)
- `rubric-gap`: **0**

**Recommendation: REVISE.**

Both exact v3 blockers are fixed: the title is 108.54 px horizontal and every enter/exit pair is 350→260 ms (25.7% shorter). Render quality, R3, sound, native output, clipping, and determinism remain clean. The full regression found two small but numeric vertical violations that v3 missed: DELIBERATE ROUTE is 0.72 px under G4, and the source glyphs extend 15.4 px into G3's bottom UI band.
