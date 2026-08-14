# Critic report — diagram-3r-principle — 2026-08-12T23:45:25.766345+00:00

## Scope and capture provenance

- Artifact: `user-compositions/diagram-3r-principle.json` (User composition, not corpus Preset).
- Route: `http://localhost:7263/p/diagram-3r-principle` — runtime inspection returned this exact URL with no `source=builtin` query.
- Browser: sanctioned flag-enabled Chrome on CDP 9223; `CanvasDrawElement` probe returned `true`.
- Capture order was sequential: the complete horizontal sequence finished before the complete vertical sequence began. No orientation captures ran in parallel.
- Native horizontal captures: `.tmp-baselines/diagram-3r-principle-v3-horizontal/` at samples `0,.03,.07,.08,.12,.16,.20,.24,.28,.335,.35,.38,.42,.50,.545,.56,.60,.64,.685,.71,.75,.90,.94,.95,.96,.966,.98,1` (filenames use two-decimal rounding).
- Native vertical captures: `.tmp-baselines/diagram-3r-principle-v3-vertical/` at the same samples.
- Settled evidence: `.tmp-baselines/diagram-3r-principle-v3-horizontal/p0.90.png` and `.tmp-baselines/diagram-3r-principle-v3-vertical/p0.90.png`.
- Exit evidence: `p0.94.png` through `p0.98.png` in both directories.

## R-rule verification (gating)

- **R1 text sharpness:** At 200% on the horizontal headline in `.tmp-baselines/diagram-3r-principle-v3-horizontal/p0.90.png` at (1050,160), glyph edges are crisp and free of chromatic fringe. Probe: `probe-text-edge.ts --region 1050,160,1750,220` → `{"luma_range":0.7491,"max_step":0.7214,"max_step_normalized":0.963,"fringing_px":0.03,"transition_count":4823}`. **PASS.** Vertical headline at (250,170): `{"luma_range":0.7491,"max_step":0.7491,"max_step_normalized":1,"fringing_px":0.01,"transition_count":3754}`. **PASS.**
- **R2 transformed content:** At 200% on the final scaled RESULT node in horizontal `p0.90.png` at (975,1121) and vertical `p0.90.png` at (864,1148), the face, border, and type remain sharp at their final 1.05/1.28 scales; there is no blurry resample. The R1 normalized edge results above are 0.963/1.0. **PASS.**
- **R3 shadow falloff:** At 400% on the RESULT node's lower-right depth edge in horizontal `p0.90.png` at (1328,1255), the hard offset is visibly an explicit backing plate, while a separate soft outer cast shadow falls off without a hard outer rim. Probe: `probe-banding.ts --region 1328,1255,160,120 --channel luma` → `{"channel":"luma","max_step":0.1692,"band_count":1.17,"transition_span_px":0.1}`. Runtime computed style independently confirms plate `rgba(0,0,0,.85) translate 8px 8px` plus cast shadow `0px 12px 18px color(srgb 0 0 0 / 0.238274)` on every node. **PASS.**
- **R4 oblique-edge AA:** At 400% on the long white vertical passive-route arc in vertical `p0.90.png` at (1300,1300), the curved edge has smooth fractional coverage. Probe: `probe-edge-aa.ts --region 1300,1300,350,1500 --channel luma` → `{"channel":"luma","hard_stairsteps":22,"smooth_pixels":295,"coverage_ratio":0.931,"polarity":{"empty_top":317,"full_top":0}}`. Horizontal curved arrow at (2670,800) returned coverage ratio `0.913`. **PASS.**
- **R5 tonal banding:** At 200% on the empty warm-dark field in horizontal `p0.90.png` at (3000,1700) and vertical at (200,3400), the field is uniform with no posterization. Probes return `max_step:0, band_count:1, transition_span_px:0` in both orientations. **PASS.**
- **R6 native resolution:** `probe-dimensions.ts` → horizontal `{"width":3840,"height":2160}`; vertical `{"width":2160,"height":3840}`. **PASS.**
- **R7 compression artifacts:** At 200% on the title, node borders, and arrows in both settled PNGs, no ringing, macroblocking, mosquito noise, or chroma bleed is visible. Probe: not applicable to lossless CDP PNG evidence; no encoded export was requested. **PASS for preview capture.**
- **R8 failure ownership:** No R-rule failure was found and no preset value is masking a render defect. **PASS.**

## Craft, layout, and motion walk

- **Q1–Q18:** The composition maintains one flat physical diagram identity; one warm-dark field, white cards, and one accent yellow; coherent hard plate + soft cast light behavior; no decorative texture or effect-stack noise; ample quiet space; one focal reveal per beat; two type families; and readable stills throughout the sampled sequence. Q4 probe: one saturated hue in both settled frames (`45°`; 115,618 horizontal pixels / 74,972 vertical pixels). Q9 probe: horizontal `ink_ratio:0.045, quiet_ratio:0.955`; vertical `ink_ratio:0.049, quiet_ratio:0.951`. Q14/Q15: all sampled entrance and exit frames remain composed; no pop was observed. **PASS.**
- **G1/G2/G3/G5/G7–G12:** Native resolution, title-safe placement, vertical platform staging, contrast, settled/smooth easing semantics, deterministic seeking, real orientation reflow, and explicitly declared opaque full-frame output all pass. The settled vertical layout is a single readable column; no readable element clips the canvas and no visible elements collide. The vertical source resolves to scale `0.84`, centered at `(1080,3187.2)` = `(x .50, y .83)`, as authored. Its glyphs remain visible and unclipped.
- **G4 node/caption measurements:** Runtime font metrics plus final CSS scale put node cap height at about **46.96 px horizontal** (`44.725 × 1.05`, allowed 24–48) and **57.25 px vertical** (`44.725 × 1.28`, allowed 32–60). Runtime returned all three final node scales as **1.05 horizontal** and **1.28 vertical**. Node/caption G4 therefore passes. One separate headline ceiling failure is recorded below.
- **G6 exit verification:** Every one of the 14 animated entities (Surface + 13 Diagram primitives) declares exit `start:.94`, `duration:.026`, giving **260 ms**, inside the 180–280 ms absolute exit band. Both exit sequences remain full at p0.94, fade through p0.95/p0.96, are effectively gone at p0.966, and are blank by p0.98. Mean RGB deltas from p0.94→.95→.96→.966→.98 were horizontal `0.00921, 0.02528, 0.00140, 0` and vertical `0.01059, 0.02901, 0.00161, 0`. Absolute exit duration passes; matching-enter ratio failures are recorded below.

## Sound verification

- There are **14 animated entities × enter/exit = 28 automatic motion cues**, and every corresponding `sound` object is exactly `{"mute":true}`: **28 automatic cues muted**.
- `state.audioCues` contains exactly **nine** manual cues, all `kind:"cue"`, `assetSlug:"foley-tick"`, volume `.22`, duration `.014`, at starts `.03,.12,.20,.28,.38,.50,.56,.64,.71`.
- Runtime timeline DOM on the exact User-composition route contained exactly **nine** `.track-transition--audio` items named `foley-tick`, at left positions 3%, 12%, 20%, 28%, 38%, 50%, 56%, 64%, and 71%. This is the requested tweet-cluster foley-tick set. **PASS.**

## Findings

### [preset-choice] Horizontal Diagram headline exceeds the G4 cap-height ceiling

- **Where:** `user-compositions/diagram-3r-principle.json` → `surface.diagram[id=l-title].scale` (`1.65` horizontal).
- **Evidence:** `.tmp-baselines/diagram-3r-principle-v3-horizontal/p0.90.png` at approximately (1095,190) through (2734,323).
- **Measurement:** runtime `actualBoundingBoxAscent` is `78.654 px` before the parent scale; `78.654 × 1.65 = 129.78 px`. G4's Diagram headline / Surface title band is 60–110 px horizontal. The vertical override is `78.654 × 1.28 = 100.68 px` and passes its 76–138 px band.
- **Suggested value:** reduce only the horizontal title scale to at most about `1.39` (for example `1.36`–`1.38`) while retaining the vertical override.

### [preset-choice] Most exits are more than 30% shorter than their matching enters

- **Where:** `user-compositions/diagram-3r-principle.json` → Diagram `enter.duration` values paired with the uniform `exit.duration:.026`.
- **Evidence:** Both orientation exit sequences `p0.94.png`–`p0.98.png`; the absolute 260 ms fade itself is clean.
- **Measurement:** Surface and `e-output-result` pair 350→260 ms (25.7% shorter, pass). Ten 400→260 ms pairs are 35% shorter; two 450→260 ms pairs are 42.2% shorter; `e-passive-route` is 550→260 ms, 52.7% shorter. G6 requires matching exits to be 20–30% shorter. In addition, 450 ms and 550 ms connector entrances exceed G6's 250–400 ms baseline unless the rubric gains an explicit connector-draw carve-out.
- **Suggested value:** keep the requested 260 ms exits and bring matching enters into roughly 325–371 ms (practically 350–370 ms), or revise the exit durations per entity so each pairing meets the stated ratio. If long connector draws are intentional, document a rubric carve-out rather than silently passing them.

## Classification and verdict

- `pipeline-bug`: **0**
- `default-too-permissive`: **0**
- `preset-choice`: **2**
- `aesthetic-miss`: **0**
- `rubric-gap`: **0**

**Recommendation: REVISE.**

The Diagram node renderer itself clears the implementation gate: the R3 backing plate and separate soft cast shadow are both present, sharpness/AA/native resolution pass, and there are no clipping or collision defects. The remaining issues are Preset values: the horizontal headline exceeds G4's ceiling, and the uniform 260 ms exits do not meet G6's required ratio against most matching enters.
