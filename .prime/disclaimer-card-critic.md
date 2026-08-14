# Critic report — educational-entertainment-disclaimer-card — 2026-08-13T16:24:36+00:00

## Verdict

**REVISE** — one Producer-fixable `preset-choice` finding. There are **zero `pipeline-bug`** and **zero `default-too-permissive`** findings.

## Captures

Sanctioned flag-enabled CDP Chrome (`CanvasDrawElement`) at native backing resolution, sampled through the 7-second sequence:

- Horizontal: `.prime/disclaimer-card-captures/horizontal/p0.00.png`, `p0.03.png`, `p0.05.png`, `p0.08.png`, `p0.10.png`, `p0.13.png`, `p0.16.png`, `p0.25.png`, `p0.75.png`, `p1.00.png`
- Vertical: `.prime/disclaimer-card-captures/vertical/p0.00.png`, `p0.03.png`, `p0.05.png`, `p0.08.png`, `p0.10.png`, `p0.13.png`, `p0.16.png`, `p0.25.png`, `p0.50.png`, `p0.75.png`, `p1.00.png`

`horizontal/p0.50.png` was excluded because the live timeline disappeared during that harness run and the saved frame was blank; the independently captured 0.16, 0.25, 0.75, and 1.00 settled frames are byte-identical.

## R-rule verification (gating)

- **R1 text sharpness — PASS.** At 200% on the smallest `DISCLAIMER` run in `horizontal/p0.16.png` around `(700,420,500,180)`, edges are crisp without blur or color fringes. `probe-text-edge.ts`: `max_step_normalized=1`, `fringing_px=0.03`. On the horizontal body around `(1200,750,1600,1000)`: `1`, `0`. On vertical label/body regions in `vertical/p0.50.png`: `1`, `0.04` and `1`, `0.01`.
- **R2 resampling — N/A.** This piece contains only native vector/HTML text and an axis-aligned rule; no image or transformed/resampled substrate is present.
- **R3 shadow quality — N/A.** No shadow is rendered.
- **R4 edge AA — PASS.** At 400% on glyph curves and diagonals in the same label/body regions, coverage is clean and fractional; no jagged stair-step or doubled edge is visible. The rule is axis-aligned.
- **R5 banding — PASS.** At 200% across the upper-left flat field (`horizontal/p0.16.png` `(0,0,600,400)` and `vertical/p0.50.png` `(0,0,500,700)`), tone is uniform with no posterized steps. `probe-banding.ts --channel luma`: `max_step=0`, `band_count=1`, `transition_span_px=0` for both.
- **R6 resolution — PASS.** `probe-dimensions.ts`: horizontal `3840×2160`; vertical `2160×3840`. No upscale is used.
- **R7 compression — PASS.** At 400% around the white/yellow high-contrast edges, the lossless PNG captures show no blocks, smear, color bleed, or chroma artifacts.

## Content, layout, motion, and safety

- **Exact wording — PASS.** Reading the six statement labels in order yields exactly: `This video is for educational and entertainment purposes and is not intended to replace medical or mental health support`. No punctuation is added.
- **Reading order — PASS.** Horizontal reads as six centered lines. Vertical reflows those same labels into nine visible lines while preserving word order; no collision or clipping occurs.
- **Centered composition — PASS.** The main statement remains optically centered in both orientations, with the label/rule acting as restrained editorial chrome. Negative space remains ample (`probe-ink-coverage.ts`: horizontal `quiet_ratio=0.9828`; vertical `0.9722`).
- **Safe areas — PASS.** Runtime visual audit reports no G2/G3 errors in either orientation. All content stays clear of vertical platform UI zones.
- **G4 readability — FAIL horizontal / PASS vertical.** The visual audit reports all six horizontal `surface-title` runs at **56 px cap height**, below the **60 px horizontal floor**. Vertical audit reports no issue.
- **Palette and Syntax fit — PASS.** Warm near-black, off-white primary ink, and one decisive yellow accent match Syntax's flat, restrained editorial vocabulary. `probe-hue-count.ts`: one saturated hue in each valid settled frame.
- **Entry sequence — PASS.** The field settles first, `DISCLAIMER` resolves, the yellow rule draws, then the six statement labels resolve together. Captures at 0.08, 0.10, and 0.13 show a coherent hierarchy without a pop or confusing partial sentence.
- **Silence — PASS.** Every authored enter has `sound.mute: true`; `state.audioCues`, `state.textAnimations`, overlays, effects, and mark timings are empty.
- **No exit / editorial hold — PASS.** No `exit` is authored. After the entry completes, valid horizontal captures at 0.16, 0.25, 0.75, and 1.00 are byte-identical; vertical captures at 0.16, 0.25, 0.50, 0.75, and 1.00 are byte-identical. The piece holds steadily through its editorial endpoint.
- **Determinism — PASS.** Motion is driven by explicit timeline progress, and repeated settled samples have identical hashes within each orientation.
- **Static validation — PASS.** `node --experimental-strip-types scripts/verify-presets.ts` reports `✓ educational-entertainment-disclaimer-card.json` and completes with all preset validation checks passed.

## Findings

### [preset-choice] Horizontal disclaimer statement is below the G4 cap-height floor

- **Where:** `src/lib/presets/educational-entertainment-disclaimer-card.json` → `state.surface.diagram[2..7].scale` (`0.72`)
- **Evidence:** `.prime/disclaimer-card-captures/horizontal/p0.16.png`, main statement around `(1200,750)`. Runtime visual audit: each of the six `surface-title` runs measures `56px`, below the horizontal `60px` floor.
- **Suggested value:** Raise the shared horizontal headline scale to at least about `0.78` (then re-capture both orientations to confirm wrapping, centering, and safety). Keep the vertical override independently tuned.

## Recommendation

**REVISE.** The composition otherwise clears the render, wording, reading-order, safety, silence, native-resolution, determinism, no-exit, and stable-hold checks. Re-run the independent Critic after correcting the horizontal G4 size.
