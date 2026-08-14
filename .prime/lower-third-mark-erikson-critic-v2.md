Critic report — lower-third-mark-erikson — v2 — 2026-08-13T16:37:12Z

Scope and source-snapshot caveat
- Independent re-review; no product source or Preset was edited.
- Flag-enabled Chrome was confirmed on sanctioned CDP port 9223. Horizontal and vertical runs were serialized; no concurrent CDP capture was used.
- The captures below describe the temporary fixed lower-third snapshot that was live when capture began: orientation-aware 58%/82% maximum widths, larger role type, a below-axis enter with preserved settled overshoot, and an explicit backing-depth plate plus a separate gaussian cast shadow.
- During analysis, the parent restored `StandardCanvasSource.svelte`, `OverlayMount.svelte`, the lower-third renderer metadata, and Syntax appearance defaults to git HEAD. The current working tree is therefore the old implementation and these v2 captures no longer prove current code. The prior report's implementation findings apply to the restored source. This report still records whether the attempted engine/default fix itself cleared the gate.

Captures
- Horizontal: `.tmp-baselines/lower-third-mark-erikson-v2-horizontal/p0.00.png`, `p0.05.png`, `p0.06.png`, `p0.07.png`, `p0.08.png`, `p0.09.png`, `p0.10.png`, `p0.11.png`, `p0.12.png`, `p0.50.png`, `p0.93.png`, `p0.94.png`, `p0.95.png`, `p0.96.png`, `p0.97.png`, `p1.00.png`.
- Vertical: `.tmp-baselines/lower-third-mark-erikson-v2-vertical/` with the same progress samples.

R-rule verification (gating)
- R1 text sharpness: At 200% on the smallest subtitle run in horizontal `p0.50.png` at (351, 1400) and vertical `p0.50.png` at (247, 2715), stroke transitions are crisp and unfringed. Probe: horizontal `{"luma_range":0.8821,"max_step":0.8243,"max_step_normalized":0.9346,"fringing_px":0,"transition_count":9634}`; vertical `{"luma_range":0.8821,"max_step":0.835,"max_step_normalized":0.9466,"fringing_px":0,"transition_count":11223}`. PASS.
- R2 transformed-content sharpness: At 200% on the settled card text and border in both `p0.50.png` captures, the card is equally sharp throughout; no resampled substrate exists. The R1 probes above remain well above the 0.3 fuzzy threshold. PASS.
- R3 shadow falloff and explicit backing depth: At 400% on the outer cast-shadow edge left of the horizontal face in `p0.50.png` at (160, 1080), the cast shadow changes in continuous one-luma increments with no hard rim. Probe: `{"channel":"luma","max_step":0.0039,"band_count":2.87,"transition_span_px":null}`. The dark offset shape behind the face is an explicitly painted, fully opaque backing plate with its own rounded geometry, not a light/shadow falloff claim; its hard edge is therefore assessed as formal backing depth, not as an R3 shadow. The separate cast shadow clears R3. PASS.
- R4 curved-edge antialiasing: At 400% on the upper-left face radius in horizontal `p0.50.png` at (240, 1090), the curve has fractional coverage pixels rather than a binary stair-step. PASS.
- R5 tonal banding: At 200% on the neutral footage proxy in horizontal `p0.50.png` at (2800, 300), the field is uniform. Probe: `{"channel":"luma","max_step":0,"band_count":1,"transition_span_px":null}`. PASS.
- R6 native resolution: horizontal probe `{"width":3840,"height":2160}`; vertical probe `{"width":2160,"height":3840}`. PASS.
- R7/R8: Lossless captures show no ringing, macroblocks, or hidden pipeline failure. PASS.

Requested content, safety, motion, output
- Exact copy: Both holds render `Mark Erikson` and `Senior Time-Travel Engineer @ Replay.io`, including the literal `@`, exact casing, and punctuation. The subtitle reflows to two lines without dropping or altering text. PASS.
- G4 cap heights: horizontal title 122 px (96–144), horizontal subtitle leading-cap run 80 px (80–112); vertical title 131 px (120–180), vertical subtitle leading-cap run 97 px (96–136). All four meet their overlay-primary bands, narrowly at the subtitle floors. PASS.
- Width and platform safety: horizontal visible block bounds are x=215..2517, width 2302 px = 59.95% (L2 ≤60%); readable ink begins x=351. Vertical visible bounds are x=110..1956, width 1846 px = 85.46% (L2 ≤90%); readable ink is x=247..1574, the right edge remains 10 px left of the x=1966 platform-rail boundary, and the backing depth ends y=3199, 26 px above the y=3225 (84%) clear line. PASS, though the right-side decorative margin is tight.
- Below-axis enter with settled follow-through: horizontal top edge moves 1121→1096→1085→1083 px at p0.06–p0.09, then follows through to its 1087 px settled position by p0.11. Vertical moves 2440→2396→2377→2373, then settles at 2380. This is true Y-axis below→settled motion with a restrained 4 px/7 px overshoot, not the prior lateral sweep. PASS.
- Timing: enter = 0.06×6 s = 360 ms; exit = 0.042×6 s = 252 ms; ratio = 0.70. Settled read window = 6×(0.93−0.11) = 4.92 s. PASS.
- Stable hold and clear exit: horizontal p0.11/p0.12/p0.50/p0.93 are byte-identical. Vertical hold re-captures differ by only 5–20 pixels at 1–2 luma levels; geometry and content are unchanged. p0.97 and p1.00 are byte-identical to the clear p0.00 neutral-proxy frame in both orientations. PASS.
- Silence: `probe-sound-map.ts` reports `cues: []`, muted IDs `overlay:main:enter` and `overlay:main:exit`, and `manualCues: []`. PASS.
- Transparency: the Preset declares neither `state.backgroundFill` nor `state.stage`; neutral-proxy frame edges remain exposed, and `src/lib/utils/output-classification.test.ts` passes 2/2. PASS.

Q1–Q18 and animation walk
- Q1–Q8, Q10–Q15, Q17–Q18: coherent flat-card hierarchy; restrained achromatic palette; crisp type; no texture/effect-stack conflict; stable hold; animated enter/exit; title clearly outranks subtitle; sub-maximum token contrast. PASS/N/A as applicable.
- Q4 probe: `{"saturated_hue_count":0,"clusters":[]}`. PASS.
- Q9 probe: horizontal `{"channel":"luma","ink_ratio":0.2,"quiet_ratio":0.8}`; vertical `{"channel":"luma","ink_ratio":0.1783,"quiet_ratio":0.8217}`. PASS.
- Q16: the attempted fix separates formal backing depth from a gaussian cast shadow. The gaussian is smooth (R3 evidence above); the backing plate is not presented as a photographic shadow. PASS.
- G1–G12 and L2–L7 otherwise pass: native targets, readable safe placement, contrast, vertical one-column reflow, Y-motion, timing, corner anchor, 4.92 s hold, two-line subtitle maximum, silence, and transparent output are all correct.
- L1 does not pass because the corrected type and Pack spacing make the card far too tall (finding below).

Findings

[default-too-permissive] The attempted standard lower-third reflow clears G4 by turning the exact-copy card into an oversized panel that violates L1's lower-third height/band contract.
  Where: the temporary fixed snapshot of `src/lib/pipelines/overlays/lower-third/variants/StandardCanvasSource.svelte` plus Syntax `lower-third.pad`/`gap` defaults.
  Evidence: horizontal `.tmp-baselines/lower-third-mark-erikson-v2-horizontal/p0.50.png` at (215,1087): visible block y=1087..1821, height 734 px = 33.98% of frame; its top is y=0.503, well above L1's y=0.62–0.72 and height≈10–18% bands. Vertical `.tmp-baselines/lower-third-mark-erikson-v2-vertical/p0.50.png` at (110,2380): y=2380..3199 clears the platform line but height 819 px = 21.33%, above L1's ≈10–16% band.
  Proposed tightening: retain the passing G4 sizes and 60%/90% width limits, but reduce standard-card padding/gap and improve line-fit so exact required copy does not inflate a lower third into a large card. Do not solve it by shrinking text below G4 or shortening the copy.

[aesthetic-miss] The copy-only card has no visible Space Mono chrome or yellow accent.
  Where: lower-third content contains title/subtitle but no kicker/chip.
  Evidence: both `p0.50.png` captures.
  Aesthetic-doc reference: `docs/packs/syntax/aesthetic.md` § Type System and § Anti-Aesthetic (“Compositions with no mono”). Advisory; non-gating.

Recommendation: IMPLEMENTATION-FIX-REQUIRED

Reason: The attempted engine/default fix resolves the prior G3/G4/G11/L2/L5 defects and passes R3 by separating a gaussian shadow from explicit backing geometry, but creates a new gating L1 scale/mass defect. In addition, the current working tree was restored to the old lower-third implementation after these captures, so it still retains the prior report's gating default problems. There is no source state currently supported by the evidence that is acceptable.
