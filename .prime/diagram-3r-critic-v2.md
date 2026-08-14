# Critic report — diagram-3r-principle — 2026-08-12T23:35:48.844431+00:00

Target: `user-compositions/diagram-3r-principle.json` loaded from `http://localhost:7263/p/diagram-3r-principle` **without** `source=builtin`.

## Captures

Sanctioned flag-enabled Chrome on CDP 9223; `FLAG(copyElementImageToTexture in GPUQueue)=true`.

- Horizontal full sequence: `.tmp-baselines/diagram-3r-principle-v2-horizontal/p0.00.png`, `p0.03`, `p0.07`, `p0.12`, `p0.16`, `p0.20`, `p0.28`, `p0.35`, `p0.38`, `p0.50`, `p0.56`, `p0.64`, `p0.71`, `p0.75`, `p0.90`, `p0.95`, `p1.00.png`
- Vertical full sequence: `.tmp-baselines/diagram-3r-principle-v2-vertical/` with the same 17 progress samples.
- Settled frames: both orientations at `p0.90.png`.

## R-rule verification (gating)

- **R1 text sharpness:** At 200% on the horizontal headline in `.tmp-baselines/diagram-3r-principle-v2-horizontal/p0.90.png` at (1920, 280), edges are crisp with no color fringe. Probe: `probe-text-edge.ts` → `max_step_normalized=0.963, fringing_px=0.04, transition_count=3721`. The vertical headline at (1080, 290) returns `max_step_normalized=1, fringing_px=0.01, transition_count=3700`. **PASS.**
- **R2 transformed content:** At 200% on RESPONSIBILITY in the horizontal node at (2266, 730), `.tmp-baselines/diagram-3r-principle-v2-horizontal/p0.90.png`, Probe: `max_step_normalized=0.9959, fringing_px=0`; vertical at (1080, 2035), Probe: `max_step_normalized=0.9959, fringing_px=0`. No resampling softness is visible. **PASS.**
- **R3 RESULT, horizontal:** At 400% below the node in `.tmp-baselines/diagram-3r-principle-v2-horizontal/p0.90.png` at (1150, 1340), the hard offset is a separate `#050504` backing plate and the outer cast shadow resolves continuously into the warm-black field. Face sample at (1000, 1150) is `[255,255,255]`. Probe region `1050,1316,200,60` → `max_step=0.0036, band_count=1, transition_span_px=0`. **PASS.**
- **R3 RESPONSIBILITY, horizontal:** At 400% below the node at (2266, 880), same capture, white face remains above the plate and soft shadow. Probe region `2150,862,230,60` → `max_step=0.0036, band_count=1, transition_span_px=0`. **PASS.**
- **R3 RESPONSE, horizontal:** At 400% below the node at (3226, 1340), same capture, the plate is hard geometry while the actual shadow has no rim or bands. Probe region `3120,1316,220,60` → `max_step=0.0036, band_count=1, transition_span_px=0`. **PASS.**
- **R3 RESULT, vertical:** At 400% below the node in `.tmp-baselines/diagram-3r-principle-v2-vertical/p0.90.png` at (1080, 1370), white face → border → offset plate → soft cast shadow layer in the correct order. Probe region `950,1344,250,60` → `max_step=0.0036, band_count=1, transition_span_px=0`. **PASS.**
- **R3 RESPONSIBILITY, vertical:** At 400% below the node at (1080, 2170), same capture. Probe region `850,2140,450,60` → `max_step=0.0036, band_count=1, transition_span_px=0`. **PASS.**
- **R3 RESPONSE, vertical:** At 400% below the node at (1080, 3060), same capture. Probe region `900,3034,350,60` → `max_step=0.0036, band_count=1, transition_span_px=0`. **PASS.**
- **R4 edge AA:** At 400% on the long yellow arc in the horizontal settled frame at (1550, 900), the oblique boundary has fractional coverage rather than a single-pixel staircase. Probe: `hard_stairsteps=26, smooth_pixels=172, coverage_ratio=0.869`. On the vertical white return arc at (1480, 2000), Probe: `hard_stairsteps=29, smooth_pixels=298, coverage_ratio=0.911`. Visual inspection confirms the counted hard samples are local joins/end geometry, not an aliased arc boundary. **PASS.**
- **R5 tonal banding:** At 200% on the empty lower-left field in horizontal `p0.90` at (500, 1850), Probe region `100,1700,1000,300` → `max_step=0, band_count=1`. Vertical at (350, 3450), region `100,3300,500,300` → `max_step=0, band_count=1`. **PASS.**
- **R6 native resolution:** Horizontal `p0.90`, Probe: `{"width":3840,"height":2160}`; vertical `p0.90`, Probe: `{"width":2160,"height":3840}`. **PASS.**
- **R7 codec artifacts:** Lossless native-canvas PNG captures show no blocking, ringing, or mosquito noise at the node borders or fine labels. No export file was part of this route-render brief. **PASS for captured render.**
- **R8 failure ownership:** No R-rule pipeline failure was found or hidden with a Preset workaround. **PASS.**

## Q1–Q18

- **Q1 PASS:** diagram primitives share one decisive printed-rule/card identity.
- **Q2 PASS / N/A:** no texture is claimed.
- **Q3 PASS:** plate offsets and cast shadows agree in direction.
- **Q4 PASS:** one saturated yellow hue. Probe: horizontal `saturated_hue_count=1` (`45°`, 7,918 px); vertical `saturated_hue_count=1` (`45°`, 5,216 px).
- **Q5 PASS:** arrows draw as rules; nodes land as cards with an explicit physical backing plate.
- **Q6 PASS / N/A:** no hand-made character is claimed; diagram wobble is correctly absent.
- **Q7 PASS:** casing, weight, white/yellow route distinction, and node plates establish hierarchy.
- **Q8 PASS:** measures are short and line-height is controlled.
- **Q9 PASS:** horizontal Probe `ink_ratio=0.0757, quiet_ratio=0.9243`; vertical `ink_ratio=0.0553, quiet_ratio=0.9447`.
- **Q10 PASS:** one reveal/focal addition per beat.
- **Q11 PASS:** square printed node corners and clean rule geometry agree.
- **Q12 PASS:** no effect stack.
- **Q13 PASS:** no additive effect ordering conflict.
- **Q14 PASS:** the 17-frame sequence in both orientations remains legible at each sampled progress; `p0.90` holds as a complete editorial still.
- **Q15 PASS:** shared exit begins at 0.94 and resolves to a clean field by `p1.00`; no pop is visible.
- **Q16 PASS:** structural contact depth comes from the backing plate; a separate low-amplitude CSS cast shadow supplies continuous far falloff.
- **Q17 PASS:** node ink is near-black `#0c0c0c`, not pure black, over the verified white face.
- **Q18 PASS:** the Pack-resolved mono/display system stays within two families.

## Animation, layout, and sound

- **G1/G9/G11/G12 PASS:** native 4K in both orientations, frame-addressable seeks, genuine horizontal-to-vertical reflow, and explicitly declared Pack background.
- **G2/G3 PASS:** the final vertical source ends at approximately y=3211 (`0.836`), narrowly inside the `0.84` bottom boundary; other readable content clears top/right UI bands.
- **G4 FAIL:** node labels exceed the binding diagram-node cap-height bands, while the vertical source falls below its floor. Measured at settled `p0.90`: horizontal node capitals are 73–75 px versus the 24–48 px band; vertical RESULT/RESPONSE are 65–68 px versus 32–60; vertical RESPONSIBILITY is 60–62 px; vertical source capitals are 25–28 px versus the 32 px minimum.
- **G5 PASS:** white node faces/near-black ink and yellow/near-black field remain comfortably above 4.5:1.
- **G6 FAIL:** every exit is `duration: 0.04` on a 10 s composition = 400 ms. That is not 20–30% shorter than the matching 350–550 ms enters and exceeds the rubric's 180–280 ms exit baseline.
- **G7/G8 PASS:** `settled` placement for labels/nodes and `smooth` stroke routes produce decisive, non-bouncy factual motion.
- **G10 PASS:** no flashes, rapid alternating patterns, or motion-safety hazard.
- **Sound PASS:** recursive audit found 28 automatic transition `sound` objects and all 28 have `mute: true`. There are exactly nine manual cues, all `foley-tick`, each `duration=0.014`, `volume=0.22`, matching the tweet-cluster cue parameters. Starts are `0.03, 0.12, 0.20, 0.28, 0.38, 0.50, 0.56, 0.64, 0.71`, aligned to the nine reveal clusters.

## Findings

- **[preset-choice] Diagram text violates G4 role bands in both directions.**
  - Where: `user-compositions/diagram-3r-principle.json:226,233,346,353,431,438,559` (`scale` on box nodes and vertical source).
  - Evidence: horizontal settled frame at RESULT (1151, 1185), RESPONSIBILITY (2266, 730), RESPONSE (3226, 1185); vertical settled frame at source around (1080, 3170).
  - Suggested value: reduce horizontal node scales enough to keep capitals at or below 48 px, keep vertical node capitals at or below 60 px, and raise the vertical source to at least 32 px cap-height while preserving the current safe-zone boundary.

- **[preset-choice] Exit timing is too long and is not shorter than entry timing.**
  - Where: `user-compositions/diagram-3r-principle.json:40-539`, repeated `exit.duration: 0.04`.
  - Evidence: both orientation sequences, especially `p0.95.png` through `p1.00.png`.
  - Suggested value: use a shared 180–280 ms exit (normalized `0.018–0.028` at 10 s), roughly 20–30% shorter than its paired entry.

- **[aesthetic-miss] The new continuous CSS cast shadow is technically clean but conflicts with the Syntax Pack's literal “No gaussian shadows on chrome, ever” rule.**
  - Where: `src/lib/platform/DiagramMount.svelte:185-186`; `src/lib/pipelines/blocks/node/CanvasSource.svelte:58`.
  - Evidence: settled horizontal node shadow at (1150, 1340); the hard signature remains explicit plate geometry and is visually dominant, while the soft shadow is restrained.
  - Aesthetic-doc reference: `docs/packs/syntax/aesthetic.md` § Card System / Anti-Aesthetic. This is advisory and non-gating.

No `pipeline-bug` findings. No `default-too-permissive` findings.

## Recommendation: REVISE

The R3 implementation fix works: every box retains a white face, the hard offset reads as explicit backing-plate geometry, the soft CSS cast shadow has continuous falloff, and depth order is correct in both orientations. The remaining blockers are Preset-authored G4 sizing and G6 exit timing. Sound configuration is exactly as requested.
