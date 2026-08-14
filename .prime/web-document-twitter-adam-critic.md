Critic report — web-document-twitter-adam-burnout — 2026-08-12T22:32:57+00:00

Captures (flag-enabled Chrome, CDP 9223):
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.00.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.04.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.07.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.20.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.24.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.28.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.50.png
  - .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p1.00.png
  - .tmp-baselines/web-document-twitter-adam-burnout-vertical/p0.00.png through p1.00.png at the same samples
  - Dense entrance sweeps: .tmp-baselines/web-document-twitter-adam-burnout-{horizontal,vertical}-entrance/p0.00.png through p0.07.png
  - Determinism recaptures: .tmp-baselines/web-document-twitter-adam-burnout-{horizontal,vertical}-repeat/p0.24.png and p0.50.png

R-rule verification (gating):
  R1 (text sharpness): At 200% on the smallest date metadata in .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.50.png at (830, 1570), observed crisp single-pixel stroke transitions without doubled edges. Probe: probe-text-edge.ts → {"luma_range":0.9222,"max_step":0.8911,"max_step_normalized":0.9663,"fringing_px":0.4,"transition_count":718}. Vertical at (130, 2500): {"luma_range":0.9225,"max_step":0.8978,"max_step_normalized":0.9733,"fringing_px":0.16,"transition_count":1289}. PASS.
  R2 (resampling): At 200% on the body and baked circular avatar in the horizontal hold at (830, 830) and (820, 600), observed sharp final-scale detail with no scale blur or doubled boundary. Probe: body text max_step_normalized=0.9752, fringing_px=0.11; avatar edge probe coverage_ratio=1, hard_stairsteps=0. Vertical body max_step_normalized=0.971, fringing_px=0.11. PASS.
  R3 (shadow falloff): At 400% on the bottom browser-card shadow in .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.50.png at (1500, 1792), observed a continuous soft falloff to the neutral backstop with no hard outer rim. Probe: probe-banding.ts on the isolated falloff → {"channel":"luma","max_step":0.102,"band_count":3.09,"transition_span_px":null}; vertical → max_step=0.102, band_count=3.87. PASS.
  R4 (non-axis-aligned edges): At 400% on the circular avatar boundary in the horizontal hold at (820, 600), observed smooth fractional coverage rather than a stair-step contour. Probe: probe-edge-aa.ts → {"hard_stairsteps":0,"smooth_pixels":4,"coverage_ratio":1}. The vertical sample returned one hard-stairstep column among three sampled (coverage_ratio=0.667), but direct inspection of the full circumference showed a consistently antialiased boundary rather than a repeating aliased contour. PASS.
  R5 (tonal regions): At 200% across the true-black X body and browser chrome in both p0.50 captures, observed stable flat tone; the only gradient is the continuous card shadow described under R3. Probe: isolated shadow probe above; no separate flat-tone probe exists. PASS.
  R6 (native output): At 100% on the full clipped canvases, the horizontal and vertical captures are native 4K with no smaller intermediate. Probe: probe-dimensions.ts → {"width":3840,"height":2160} and {"width":2160,"height":3840}. PASS.
  R7 (codec artifacts): At 400% on white-on-black body strokes and the saturated amber highlight in both p0.50 captures, observed no blocking, mosquito noise, smear, or chroma bleed. Probe: not applicable to the lossless PNG CDP capture; no encoded export artifact was part of this review. PASS for the captured render path.
  R8 (no preset masking): No R failure was hidden by a preset adjustment. PASS.

Content and requested treatment:
  - Exact authored/rendered text: “I’m going through the craziest burnout I’ve experienced in my ~17 year career / I’ve been sick for 16 days now, haven’t even been able to go for walks / I kind of fucking hate AI / I think all of these things are related.” Author Adam, @adamdotdev, 2:36 PM · Apr 28, 2026, and status URL 2049135608728019393 are all present.
  - Text-only post: no media block. No action row, footer rule, or footer hairline appears at any captured frame.
  - The avatar resolves from the baked local file static/web-document-twitter/adamdotdev.jpg (400×400, 21,063 bytes), not a remote URL.
  - The post body uses the true-black X Lights Out treatment. Against the neutral capture backstop, held central pixels remain the screenshot pipeline's black floor (RGB 7–8), not a gray card or atmospheric gradient.
  - The phrase “I kind of fucking hate AI” alone receives the amber physical highlight. It starts at p0.20, is partial at p0.24, and is complete at p0.28: 0.08 × 6 s = 480 ms. Yellow-region pixels grow from the unmarked baseline to 21,155 then 37,353 horizontal, and 27,081 then 49,662 vertical.
  - Both surface entrance and mark declare sound.mute=true; no audible cue is authored.
  - Entrance is a restrained fade/upward settle, then the composition is motionless through the hold. Dense captures show the arrival resolving between p0.00 and p0.04; p0.04–p0.20 are pixel-identical before the mark. p0.28, p0.50, and p1.00 are pixel-identical after it.
  - Metadata and body keep X-like hierarchy. Body cap height and measure remain readable in both orientations; metadata is visibly secondary without becoming illegible.
  - No clipping: horizontal card bounds are about (713,356)–(3136,1814); vertical about (69,1095)–(2093,2767). Readable vertical content begins inside the 6% column and stays clear of top, bottom, and right platform-UI exclusion bands.
  - Determinism: independent recaptures at p0.24 and p0.50 are byte-for-pixel identical in both orientations (0 changed pixels, max channel delta 0).

Q/G/aesthetic walk:
  - Q1–Q3, Q5–Q18: PASS. The browser-framed found document has one coherent identity, one light/shadow model, clean material edges, disciplined single mark, a stable hero phrase, sufficient negative space, and no effect stack. probe-ink-coverage.ts reports quiet_ratio=0.5928 horizontal and 0.611 vertical.
  - Q4: four saturated hue clusters are measurable in the faithful X/browser substrate: amber/yellow, red, blue, and green. See rubric-gap finding below.
  - G1–G5, G7–G12: PASS. Native dimensions, title/platform safety, found-document scale bands, contrast, deliberate `settled`/`smooth` semantics, frame-addressability, reflow, and declared opacity behavior are sound.
  - G6: FAIL narrowly. The declared entrance is 0.07 × 6 s = 420 ms, 20 ms above the 250–400 ms enter band. The six-word decorative highlight is 480 ms, inside its 360–540 ms band; establishment is 780 ms and post-mark absorption is 4.32 s.
  - Syntax aesthetic: PASS. The substrate correctly keeps X's own physics rather than forcing Syntax chrome onto a found document; the single amber physical highlighter is the allowed measured mark color. There is no glossy atmosphere or gratuitous Pack decoration.
  - Static schema/semantic/safety verification: `npm run verify-presets -- web-document-twitter-adam-burnout` completed with all checks passing.

Findings:
  [preset-choice] The surface entrance exceeds G6's enter-duration ceiling by 20 ms.
    Where: src/lib/presets/web-document-twitter-adam-burnout.json → state.surface.enter.duration
    Evidence: .tmp-baselines/web-document-twitter-adam-burnout-horizontal-entrance/p0.00.png through p0.07.png
    Suggested value: Use duration 0.0667 or less at six seconds (400 ms maximum) while retaining the muted `settled` arrival.

  [rubric-gap] Q4 counts tiny, semantically fixed platform/browser status chrome exactly like authored palette fields.
    Where: Q4 palette restraint applied to the faithful X/browser substrate
    Evidence: .tmp-baselines/web-document-twitter-adam-burnout-horizontal/p0.50.png:(730,370) and (1040,650); probe-hue-count.ts → saturated_hue_count=4, centers 45°, 15°, 195°, 135°
    Suggested rule: Define whether tiny verisimilar platform/browser indicators below a bounded frame-area threshold count toward Q4; until then the rule conflicts with faithful found-document reproduction.

No pipeline-bug or default-too-permissive findings.

Recommendation: REVISE
