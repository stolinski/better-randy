Critic report — lower-third-mark-erikson — 2026-08-13T16:19:46Z

Scope and setup
- Independent review; no source files were edited.
- Flag-enabled Chrome confirmed on sanctioned CDP port 9223 (`CanvasDrawElement` flag probe: true).
- Corpus route: `http://localhost:7263/p/lower-third-mark-erikson?source=builtin`.
- Both native orientations were captured at the requested enter/hold/exit points.

Captures
- Horizontal: `.tmp-baselines/lower-third-mark-erikson-horizontal/p0.00.png`, `p0.05.png`, `p0.08.png`, `p0.11.png`, `p0.50.png`, `p0.93.png`, `p0.95.png`, `p0.97.png`, `p1.00.png`.
- Vertical: `.tmp-baselines/lower-third-mark-erikson-vertical/p0.00.png`, `p0.05.png`, `p0.08.png`, `p0.11.png`, `p0.50.png`, `p0.93.png`, `p0.95.png`, `p0.97.png`, `p1.00.png`.

R-rule verification (gating)
- R1 text sharpness: At 200% on the subtitle in horizontal `p0.50.png` at (340, 1425) and vertical `p0.50.png` at (235, 2835), strokes are crisp, single-pixel transitions with no visible color fringe. Probe: horizontal `{"luma_range":0.8821,"max_step":0.8821,"max_step_normalized":1,"fringing_px":0.01,"transition_count":8337}`; vertical `{"luma_range":0.8821,"max_step":0.8821,"max_step_normalized":1,"fringing_px":0.01,"transition_count":8335}`. PASS.
- R2 transformed-content sharpness: At 200% on the plate text during the settled hold in horizontal `p0.50.png` at (350, 1440), text and card edges remain equally sharp; there is no sampled photo/texture or scaled substrate. Probe: `probe-text-edge.ts` output above. PASS.
- R3 shadow falloff: The visible Pack treatment at horizontal `p0.50.png` around (2200, 1800) is the Syntax Pack's explicitly authored stepped extrusion, not a gaussian/photographic shadow claim. Probe over the whole plate reports the deliberate steps: `{"channel":"luma","max_step":0.8821,"band_count":22.57,"transition_span_px":26.1}`. No gaussian shadow exists to inspect. PASS as formal extrusion; see rubric-gap finding because R3/Q16 do not state this exception.
- R4 curved-edge antialiasing: At 400% on the upper-left radius in horizontal `p0.50.png` at (240, 1340), the curve carries fractional boundary pixels (sample row values include 116→111→99→89→81→74), not a binary stair-step. Probe: `{"channel":"luma","hard_stairsteps":50,"smooth_pixels":0,"coverage_ratio":0,"polarity":{"empty_top":50,"full_top":0}}`; this is a false negative because the probe's fixed 32/224 luma thresholds cannot classify a 116↔60 low-contrast edge. PASS by the required 400% inspection; see rubric-gap finding.
- R5 tonal banding: At 200% on the neutral footage-proxy field in horizontal `p0.50.png` at (2500, 500), the field is uniform with no posterization. Probe: `{"channel":"luma","max_step":0,"band_count":1,"transition_span_px":null}`. PASS.
- R6 native resolution: Horizontal backing and PNG are 3840×2160; vertical backing and PNG are 2160×3840. Probe: `{"width":3840,"height":2160}` and `{"width":2160,"height":3840}`. Text sharpness is equal between orientations. PASS.
- R7 compression artifacts: At 200% on the title and subtitle in both `p0.50.png` captures, no ringing, macroblocking, or mosquito noise is visible in the lossless capture. Probe: not yet implemented. PASS; missing export-codec artifact probe is a rubric gap already inherent in the protocol.
- R8 no hiding pipeline failures: No R-rule failure was hidden with Preset values. PASS.

Requested content/output checks
- Exact strings: `Mark Erikson` and `Senior Time-Travel Engineer @ Replay.io` render exactly, with punctuation and casing intact, in both hold captures.
- Transparency: the Preset declares neither `state.backgroundFill` nor `state.stage`; all frame edges expose the capture harness's neutral footage proxy, including `p0.00`/`p1.00`. `src/lib/utils/output-classification.test.ts` passes (2/2), confirming absent fill/stage classifies as transparent. PASS.
- Sound: `probe-sound-map.ts` reports `cues: []`, muted IDs `overlay:main:enter` and `overlay:main:exit`, and no manual cues. Fully muted. PASS.
- Determinism: two independent horizontal `p0.50` captures are byte-identical (SHA-256 `f32dceae817626aa8b1737d0bbdb4fe58ccd239c5b44fca35fa6782e98dafc50`). Hold frames `p0.11`, `p0.50`, and `p0.93` have identical pixel sums; raw `p0.97` and `p1.00` are fully clear. PASS.
- Timing: enter = 0.06×6 s = 360 ms (G6 250–400 ms); exit = 0.042×6 s = 252 ms (G6 180–280 ms); exit/enter = 0.70, exactly 30% shorter. On-screen settled window = 6×(0.93−0.11) = 4.92 s, inside L4's 4–6 s band and above the 2× reading window. `p0.05` is clear, `p0.08` is mid-enter, `p0.11` is settled; `p0.93` is held, `p0.95` is mid-exit, `p0.97` is clear. Durations and endpoint behavior PASS; direction does not (finding below).

Q1–Q18 craft walk
- Q1/Q5/Q11: one coherent flat-card identity with the Syntax plate, border, radius, and stepped depth. PASS.
- Q2/Q3/Q6/Q10/Q12/Q13: no texture, hand-made mark, competing focal element, effect stack, or additive/transform ordering issue. N/A/PASS.
- Q4: restrained achromatic palette. Probe: `{"saturated_hue_count":0,"clusters":[]}`. PASS.
- Q7: title weight/brightness clearly outranks subtitle. PASS.
- Q8: both strings stay on one line with stable line-height and no collision. PASS.
- Q9: generous negative space. Probe: `{"channel":"luma","ink_ratio":0.1261,"quiet_ratio":0.8739}`. PASS.
- Q14/Q15: hold is stable; enter and exit are both animated with no endpoint pop. PASS.
- Q16: Syntax stepped extrusion is coherent but the rule only describes soft physical shadows; handled as the R3/Q16 rubric gap below.
- Q17: measured token contrast against `#141413`: title `#f7f6f2` = 17.05:1; subtitle `#c9c6bc` = 10.79:1. Both clear 4.5:1 while avoiding pure white/black. PASS.
- Q18: one visible type family. PASS.

Animation/lower-third walk
- G1/G2/G5/G6/G7/G8/G9/G10/G12 and L3/L4/L7 pass: native 4K, title-safe horizontally, strong contrast, correct 360/252 ms timing and settled/smooth semantics, deterministic timeline, transparent output, bottom-left anchor, 4.92 s read window, one-line subtitle.
- G3/G4/G11 and L1/L2/L5 fail through the lower-third renderer's orientation-insensitive defaults (finding below).
- Cap-height measurements on the leading capitals: horizontal title 107 px (96–144 band, PASS), horizontal subtitle 68 px (80–112, FAIL); vertical title 107 px (120–180, FAIL), vertical subtitle 68 px (96–136, FAIL).
- Vertical readable subtitle reaches x=1983 (91.81% of width), 17 px inside the forbidden rightmost 9% UI rail whose boundary is x=1966. The visible block including stepped depth spans x=135..2147 (93.19%, above L2's 90% maximum) and reaches y=3275 (85.29%, below L1/G3's 84% clear line).
- Horizontal block bounds are x=240..2252 (52.42%, within L2) and y=1340..1863 (top 62.04%, conventional L1 band).

Findings

[default-too-permissive] The standard lower-third does not genuinely reflow type or geometry for vertical, and its subtitle is below the broadcast cap-height floor even horizontally.
  Where: `src/lib/pipelines/overlays/lower-third/variants/StandardCanvasSource.svelte` (`7 * --cqmin` title, `4.3 * --cqmin` subtitle, no orientation-aware inline-size); `src/lib/presets/lower-third-mark-erikson.json` exposes the failure with the required exact copy.
  Evidence: horizontal `p0.50.png` at (350, 1440)/(350, 1627); vertical `p0.50.png` at (245, 2852)/(245, 3038), with the measured cap heights and bounds above.
  Proposed tightening: make standard lower-third typography orientation-aware, raise subtitle cap height to the G4 floor, cap the vertical block to ≤90% including depth, and reserve the right/bottom platform UI bands without changing the shared copy.

[default-too-permissive] The lower-third's default enter moves laterally from the right instead of entering from below.
  Where: lower-third overlay motion/placement implementation (the Preset only selects `settled`; it has no direction control).
  Evidence: horizontal `p0.08.png` at approximately (2640, 1500) versus settled (240, 1340); vertical `p0.08.png` at approximately (1480, 2900) versus settled (135, 2752).
  Proposed tightening: use a Y-axis below→settled placement envelope for lower-thirds in both orientations, especially vertical, while retaining the 360 ms duration and settled ease.

[aesthetic-miss] The composition has no visible Space Mono chrome or yellow accent, so it lacks the Syntax Pack's signature mono thread.
  Where: lower-third content has title/subtitle only and no kicker/chip.
  Evidence: both `p0.50.png` captures.
  Aesthetic-doc reference: `docs/packs/syntax/aesthetic.md` § Type System and § Anti-Aesthetic (“Compositions with no mono”). This is advisory and non-gating.

[rubric-gap] R3/Q16 do not distinguish an authored formal stepped extrusion from a defective hard-rim photographic shadow.
  Where: `docs/quality-rubric.md` R3 and Q16 versus `docs/packs/syntax/aesthetic.md` § Card System.
  Suggested rule: explicitly exempt registered formal/extrusion depth treatments that claim no gaussian light falloff, while still testing each step for clean deterministic edges.

[rubric-gap] `probe-edge-aa.ts` uses absolute 32/224 luma thresholds and misclassifies low-contrast curved card edges.
  Where: R4 probe contract.
  Suggested rule: normalize LOW/HIGH to the selected region's measured luma range, as `probe-text-edge.ts` already normalizes its sharpness verdict.

Recommendation: IMPLEMENTATION-FIX-REQUIRED

Reason: two `default-too-permissive` findings are gating. The exact copy, transparency, sharpness, contrast, sound muting, timing ratio/bands, stable hold, and deterministic exit are correct, but the shared standard lower-third implementation cannot meet G3/G4/G11/L1/L2/L5 for this required copy in both orientations without renderer/default changes.
