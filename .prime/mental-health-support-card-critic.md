Critic report — mental-health-support-card — 2026-08-13T16:14:29.545123+00:00

Scope
- Independent review of `src/lib/presets/mental-health-support-card.json`.
- Sanctioned CDP 9223, CanvasDrawElement available. Native captures sampled at 0, 0.10, 0.25, 0.50, 0.75, and 1.00 in both orientations.
- Static schema/semantic/readability gate: `scripts/verify-presets.ts` reports `✓ mental-health-support-card.json` and all validation checks passed.

Captures
- `.tmp-baselines/mental-health-support-card-horizontal/p0.00.png`
- `.tmp-baselines/mental-health-support-card-horizontal/p0.10.png`
- `.tmp-baselines/mental-health-support-card-horizontal/p0.25.png`
- `.tmp-baselines/mental-health-support-card-horizontal/p0.50.png`
- `.tmp-baselines/mental-health-support-card-horizontal/p0.75.png`
- `.tmp-baselines/mental-health-support-card-horizontal/p1.00.png`
- `.tmp-baselines/mental-health-support-card-vertical/p0.00.png`
- `.tmp-baselines/mental-health-support-card-vertical/p0.10.png`
- `.tmp-baselines/mental-health-support-card-vertical/p0.25.png`
- `.tmp-baselines/mental-health-support-card-vertical/p0.50.png`
- `.tmp-baselines/mental-health-support-card-vertical/p0.75.png`
- `.tmp-baselines/mental-health-support-card-vertical/p1.00.png`

R-rule verification (gating)
- R1 text sharpness: At 200% on the smallest support-copy run in `.tmp-baselines/mental-health-support-card-horizontal/p0.50.png` at (500,1450), glyph strokes have crisp single-pixel transitions and no visible fringing. Probe: `probe-text-edge.ts --region 500,1450,1100,130` → `{"luma_range":0.8977,"max_step":0.8977,"max_step_normalized":1,"fringing_px":0.01,"transition_count":1699}`. Vertical at (450,1600): `{"luma_range":0.8977,"max_step":0.8977,"max_step_normalized":1,"fringing_px":0,"transition_count":1905}`. PASS.
- R2 transformed/resampled sharpness: At 200% on the large `ADAA.org` anchor in both p0.50 captures at approximately H (650,1080) and V (700,1340), edges are as sharp as the smaller labels; no sampled asset or softened transformed region is present. Probe: the R1 text-edge results above are normalized 1. PASS.
- R3 shadow falloff: No shadows are rendered by this plain full-frame composition. At 400% on the quiet upper-right field in horizontal p0.50 at (3000,200), no rim or stepped falloff exists. Probe: `probe-banding.ts --region 3000,200,400,300` → `{"channel":"luma","max_step":0,"band_count":1,"transition_span_px":0}`. PASS (N/A material).
- R4 edge anti-aliasing: At 400% on the longest oblique glyph strokes in the p0.50 headline regions, coverage is visibly fractional and there is no hard single-pixel stair pattern. The only non-text geometry is axis-aligned. Probe: `probe-edge-aa.ts` is not meaningful for this opaque glyph field (mixed glyph boundaries return region-dependent coverage); visual inspection is authoritative here. PASS.
- R5 tonal banding: At 200% across the largest uniform background field in horizontal p0.50 at (3000,200), the field is continuous and flat, with no posterization. Probe: `probe-banding.ts` → `{"channel":"luma","max_step":0,"band_count":1,"transition_span_px":0}`. The corresponding vertical quiet field at (200,1000) returns the same values. PASS.
- R6 native resolution: Horizontal p0.50 is 3840×2160; vertical p0.50 is 2160×3840, and the harness banners report backing stores of those exact sizes. Probe: `probe-dimensions.ts` → `{"width":3840,"height":2160}` and `{"width":2160,"height":3840}`. Text remains native-sharp per R1. PASS.
- R7 codec artifacts: At 200% on text and flat fields in both p0.50 PNG captures, no ringing, macroblocking, mosquito noise, or chroma bleed is visible. Probe: not applicable to lossless CDP PNG captures. PASS for preview pixels; no encoded export was supplied.
- R8 no preset masking: No R failure was found or hidden with preset tuning. PASS.

Required content and behavior
- Exact copy: authored labels, joined in reading order with spaces, reconstruct exactly: “Struggling with anxiety or depression? Visit ADAA.org for information and support. In crisis or need immediate support? Call or text 988.” Punctuation and casing match. PASS.
- Anchors: `ADAA.org` and `988.` are the dominant yellow focal anchors in both orientations. PASS.
- Total silence: `state.audioCues` is empty; Surface enter and every Diagram primitive enter declare `sound.mute: true`. `probe-sound-map.ts` reports `cues: []`, `manualCues: []`, with automatic `surface:enter` and `block:support-divider:enter` in `mutedCueIds`. PASS.
- Deterministic still hold: repeated horizontal captures at p0.00, p0.10, p0.25, p0.50, and p0.75 are byte-identical; a separately recaptured p1.00 is also byte-identical to the original p1.00. No wall-clock movement is visible during the settled hold. PASS.

Q1–Q18
- Q1 PASS — every visible item belongs to one sparse information-card identity.
- Q2 PASS/N/A — no texture claims are made.
- Q3 PASS/N/A — no lighting or modeled depth.
- Q4 PASS — one saturated hue. Probe: H `{"saturated_hue_count":1,"clusters":[{"hue_deg_center":45,"pixel_count":49944}]}`; V count 1 (49,031 pixels).
- Q5 PASS — flat labels/rule obey the formal diagram identity.
- Q6 PASS/N/A — no hand-made claim.
- Q7 PASS — yellow, weight, and scale establish anchor hierarchy.
- Q8 FAIL — horizontal crisis heading wraps to three short lines while the peer support heading occupies one extremely wide line, producing unequal measures and an unbalanced pair; vertical headings are coherent three-line peers.
- Q9 PASS — densest p0.50 ink coverage is H 0.0195 / quiet 0.9805 and V 0.0207 / quiet 0.9793 (`probe-ink-coverage.ts`).
- Q10 PASS — each authored beat adds one focal item; settled frame has two semantically distinct anchors.
- Q11 PASS — flat field, type, and clean rule agree.
- Q12–Q13 PASS/N/A — no effects.
- Q14 FAIL in horizontal — the final still is not a balanced two-column layout: the left heading begins around x=54, outside title-safe, while the right headline is a narrow three-line block; this is visible from p0.25 through p1.00. Vertical stills hold as a clear stack.
- Q15 PASS/N/A — no effect stack.
- Q16 PASS/N/A — no shadows.
- Q17 PASS — off-white text and yellow accent sit below pure white/full RGB intensity on the warm dark field.
- Q18 PASS — one declared type family.

G-rules and Syntax aesthetic
- G1 PASS — 30 fps, native 4K in both targets.
- G2 FAIL — runtime visual audit at horizontal p0.50 reports `Readable text bounds (52,557 3197×983) extend outside title-safe rect [192,108]–[3648,2052]`; the support heading visibly starts near x=54. This is a video-safety failure.
- G3 PASS at the settled vertical frame — readable pixels lie within the constrained vertical safe column; the bottom of `988.` is approximately y=3194, inside the y=3226 platform-safe boundary, though with little spare margin.
- G4 FAIL — runtime visual audit measures both vertical headings at 69.4008 px cap height, below the 76 px vertical surface-title floor. Horizontal headings measure 66.3163 px, within the 60–110 px horizontal band. Caption labels and focal anchors are within their respective bands.
- G5 PASS — very high text/background contrast is visually stable.
- G6–G8 PASS for the declared intent — rapid, quiet staged reveals settle without bounce or distracting travel. There is no automatic audio despite automatic Surface/Diagram motion.
- G9 PASS — frame-addressable and repeatably deterministic as above.
- G10 PASS — no flashing, camera movement, parallax, or vestibular risk.
- G11 FAIL — the Preset does reflow rather than duplicate, and vertical is well stacked, but horizontal does not meet the required balanced two-column result.
- G12 PASS — opacity is explicitly declared through `backgroundFill: "pack"`; this is correctly a full-frame support card.
- Syntax fit: warm near-black, one loud yellow, clean non-wobbly diagram rule, decisive hierarchy, and no gloss are on-Pack. No aesthetic-miss finding.

Findings
[preset-choice] Horizontal support heading violates title-safe and destroys two-column balance.
  Where: `src/lib/presets/mental-health-support-card.json` → `state.surface.diagram[support-heading].position/scale` and peer column geometry.
  Evidence: `.tmp-baselines/mental-health-support-card-horizontal/p0.50.png`:(54,579); runtime audit text bound x=51.76 versus title-safe x=192.
  Suggested value: rebalance both horizontal columns so the two headings have comparable measures/wrapping and all readable pixels remain inside x=[192,3648].

[preset-choice] Vertical section headings are below the G4 surface-title cap-height floor.
  Where: `state.surface.diagram[support-heading|crisis-heading].orientationOverrides.vertical.scale`.
  Evidence: `.tmp-baselines/mental-health-support-card-vertical/p0.50.png` near (1080,568) and (1080,2020); runtime audit cap-height=69.4008 px, required ≥76 px.
  Suggested value: raise vertical heading scale enough to clear 76 px while preserving safe areas and the balanced stack.

Classification summary
- pipeline-bug: 0
- default-too-permissive: 0
- preset-choice: 2
- aesthetic-miss: 0
- rubric-gap: 0

Recommendation: REVISE

The rendering pipeline is technically clean, copy and silence requirements pass, and vertical stacking is strong. The Preset is not ready because the horizontal composition fails title-safe/balance and both vertical headings fail the readability floor. These are authorable Preset fixes, not implementation defects.
