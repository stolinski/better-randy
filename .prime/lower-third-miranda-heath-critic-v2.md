# Critic report v2 — lower-third-miranda-heath — 2026-08-13T16:34Z

## Verdict

**IMPLEMENTATION-FIX-REQUIRED**

This re-Critic did capture the proposed engine/default fixes in both orientations, sequentially through the sanctioned flag-enabled CDP harness. Those fixes cleared the old width/clipping, below-axis-motion, and R3 objections, but introduced a new lower-third layout failure: the card became much too tall and the vertical subtitle wrapped to three lines. During this Critic run, the proposed implementation was then rolled back to Git HEAD. The current source therefore again has the prior gating implementation defects. There is no current fixed implementation to accept.

## Capture provenance

Flag-enabled Chrome on CDP port 9223 reported `FLAG(copyElementImageToTexture in GPUQueue)=true`. Captures were made sequentially, horizontal then vertical, at native backing sizes.

- Proposed-fix horizontal, 3840×2160: `.tmp-baselines/lower-third-miranda-heath-v2/horizontal/`, `horizontal-exit/`, `horizontal-clear/`
- Proposed-fix vertical, 2160×3840: `.tmp-baselines/lower-third-miranda-heath-v2/vertical-enter-a/`, `vertical-hold/`, `vertical-exit-a/`, `vertical-clear/`
- Enter samples: 0, 0.049/0.05, 0.06, 0.08, 0.10, 0.11, 0.12
- Hold samples: 0.12, 0.50, 0.90
- Exit samples: 0.929, 0.94, 0.95, 0.97

The source changed after these captures. At report time, `StandardCanvasSource.svelte` is back to its unconstrained HEAD implementation, `OverlayMount.svelte:141` is back to a clamped 32px rise, and `manifest.ts:288-291` is back to the ten hard zero-blur box-shadow steps. The captures document the proposed fix, not the final on-disk source.

## Proposed-fix render results

### Exact copy, width, and safety

- **PASS exact copy.** Both orientations visibly render `Miranda Heath` and `Director and Researcher @ Software Stewardship Lab`, including the literal `@`.
- **PASS L2 width after the proposal.** Strong plate/backing pixels measure `(240,1088)–(2517,1821)` horizontal: 2277px, **59.30%**. Vertical measures `(135,2180)–(1956,3199)`: 1821px, **84.31%**. The faint gaussian cast falloff extends the horizontal changed-pixel envelope to 60.10%; the material lower-third itself remains under the 60% limit.
- **PASS vertical platform clearance, narrowly.** The vertical material edge ends at x=1956 (90.56% of width), just inside the x=1965.6 right-rail boundary, and at y=3199 (83.31%), inside the 84% bottom boundary. Readable text is farther inward.
- **FAIL L1/L7.** Horizontal changed-pixel bounds are `(209,1081)–(2517,1826)`: top y=0.500 and height 34.49%, versus L1 top 0.62–0.72 and height 10–18%. Vertical bounds are `(104,2173)–(1956,3204)`: top y=0.566 and height 26.85%, versus top 0.62–0.74 and height 10–16%. The vertical subtitle visibly wraps to **three lines** (`Director and` / `Researcher @ Software` / `Stewardship Lab`), exceeding L7's two-line maximum. This reads as a large card rather than a lower third.

### G4 type sizes and hierarchy

- **PASS G4.** In the proposed implementation, the horizontal title cap is about 121px and subtitle cap about 80px, inside the 96–144 / 80–112 overlay bands. Vertical is about 131px / 97px, inside the 120–180 / 96–136 bands.
- **PASS hierarchy.** Bold off-white name leads; the smaller muted role follows. The `@` remains legible in both targets.

### Enter, hold, exit, timing, and silence

- **PASS below-axis enter.** At p0.06, the proposed card is 39px below its horizontal settled y and 65px below its vertical settled y. It moves only upward into place, not sideways.
- **PASS settled follow-through.** At p0.08–0.10 the horizontal card travels about 2px above its final y, then is at its exact settled y by p0.11. The overshoot is subtle but measurable.
- **PASS timing.** Enter starts at 0.30s and lasts 0.36s. Exit starts at 5.58s and lasts 0.252s, exactly 70% of enter duration. Both meet G6; screen time is 4.92s, meeting L4.
- **PASS stable hold.** Horizontal p0.12 and p0.50 PNGs are byte-identical (`sha256 9ee7b54c…`). Vertical p0.12, p0.50, and p0.90 are byte-identical (`sha256 9a7361fb…`).
- **PASS clear exit.** Horizontal and vertical p0.97 are pixel-identical to their p0.00 clear frames.
- **PASS silence.** `probe-sound-map.ts` reports `cues: []`, muted cue IDs `overlay:main:enter` and `overlay:main:exit`, and no manual cues.
- **PASS transparency.** Clear/settled frame edges show only the neutral capture backstop; the Preset declares no `backgroundFill`, stage, media, or Effect. Current and proposed compositions classify as transparent.

## R-protocol on the proposed fix

- **R1 text sharpness — PASS.** At 200% on the horizontal subtitle in `horizontal/p0.50.png` around `(300,1400)`, probe: `max_step_normalized=0.9996`, `fringing_px=0`. On the vertical subtitle in `vertical-hold/p0.50.png` around `(220,2580)`, probe: `max_step_normalized=1`, `fringing_px=0`. Edges are crisp single-pixel transitions.
- **R2 resampling — N/A.** Native HTML-in-Canvas text/chrome; no sampled image or transformed texture.
- **R3 shadow quality — PASS for the proposal.** The hard offset element visible behind the face was an explicit backing plate, separate geometry with its own rounded silhouette—not a claimed cast-shadow falloff. The actual `0 24px 42px` cast shadow falls continuously outside it. At 400% on the exposed left cast falloff in `horizontal/p0.50.png` around `(180,1150)`, probe: `max_step=0.0039`; vertical around `(75,2300)`: `max_step=0.0039`. No hard outer rim is visible. This distinction is valid under R3: hard constructed backing depth may have a hard material edge; a cast shadow may not.
- **R4 edge AA — PASS.** At 400% on the face and backing rounded corners around horizontal `(240,1088)` and vertical `(135,2180)`, curved boundaries have fractional edge coverage, not single-pixel jaggies.
- **R5 banding — PASS.** The plate and neutral field are flat and uniform; the only tonal transition is the continuous cast falloff named under R3.
- **R6 resolution — PASS.** Probe outputs are exactly `3840×2160` and `2160×3840`.
- **R7 compression artifacts — PASS for captured PNG evidence.** At 400% around the high-contrast title edge there is no ringing, block structure, or chroma bleed.
- **R8 no preset paper-over — PASS.** The proposed changes addressed implementation seams rather than hiding broken rendering with Preset values.

## Q/G/Pack summary

- Q1–Q3, Q5–Q18: contrast, hierarchy, edge craft, coherence, flat-card construction, and restrained typography pass in the proposed render. Title and role contrast are strong against `#141413`; no glare, gradient atmosphere, or unrequested background appears.
- Q4: `probe-hue-count.ts --downsample 4` reports `saturated_hue_count: 0` in both settled frames.
- G1–G3, G5–G7, G9–G12 and L2–L6 pass as described above. **L1 and L7 fail.**
- The proposed explicit backing plate plus soft cast shadow retains Syntax's flat physical depth without asking a hard-edged cast shadow to violate R3.

## Findings

[default-too-permissive] Proposed fixed lower-third metrics cannot fit ordinary exact attribution copy inside the lower-third height and two-line limits.

- Where at capture time: proposed `StandardCanvasSource.svelte` orientation type/max-width rules plus Syntax `lower-third.pad`.
- Evidence: `.tmp-baselines/lower-third-miranda-heath-v2/horizontal/p0.50.png` at `(209,1081)` and `vertical-hold/p0.50.png` at `(104,2173)`.
- Impact: horizontal material occupies roughly one third of frame height; vertical occupies over one quarter and the subtitle wraps to three lines.
- Required fix: rebalance the shared lower-third's inner padding, line measure, and orientation sizing while retaining the G4 floors, ≤60%/≤90% width, vertical rail/bottom clearance, and exact shared copy.

[pipeline-bug] The current on-disk implementation has rolled back to the prior hard-rim box shadow and clamped 32px generic enter.

- Where: `src/lib/packs/syntax/manifest.ts:288-291`; `src/lib/platform/OverlayMount.svelte:120-142`; `src/lib/pipelines/overlays/lower-third/variants/StandardCanvasSource.svelte:11,50,64,77`.
- Evidence: current source no longer matches the captured proposed render; prior reproducible evidence remains in `.prime/lower-third-miranda-heath-critic.md`.
- Required fix: restore a corrected version of the explicit backing/cast separation and lower-third-specific below-axis motion, then solve the L1/L7 regression before re-review.

## Recommendation

**IMPLEMENTATION-FIX-REQUIRED.** The proposed fixes were directionally correct and cleared R3, width, clipping, G4, and motion, but their layout did not meet L1/L7; the source was then rolled back, so the current implementation also retains the original gating defects.
