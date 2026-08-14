Critic report — web-document-twitter — 2026-08-12T22:12:49.705278+00:00

Route: http://localhost:7263/p/web-document-twitter?source=builtin
Capture path: sanctioned flag-enabled Chrome on CDP port 9223 only (`FLAG(copyElementImageToTexture in GPUQueue)=true`).

Captures:
  - Horizontal: `.tmp-baselines/web-document-twitter-v3-horizontal/p0.00.png`, `p0.02.png`, `p0.04.png`, `p0.07.png`, `p0.10.png`, `p0.20.png`, `p0.25.png`, `p0.40.png`, `p0.80.png`, `p1.00.png`
  - Vertical: `.tmp-baselines/web-document-twitter-v3-vertical/p0.00.png`, `p0.02.png`, `p0.04.png`, `p0.07.png`, `p0.10.png`, `p0.20.png`, `p0.25.png`, `p0.40.png`, `p0.80.png`, `p1.00.png`
  - Repeat determinism captures: `.tmp-baselines/web-document-twitter-v3-horizontal-repeat/` and `.tmp-baselines/web-document-twitter-v3-vertical-repeat/` at p0.02, p0.04, p0.25, p0.80.

User-request verification:
  - Five clean footer icons: PASS on count and recognizable glyph construction; five icons render in both orientations.
  - Even footer spacing: FAIL. Horizontal visual centers are approximately x=[890, 1489, 1920, 2351, 2950], giving gaps [599, 431, 431, 599] px. Vertical centers are approximately x=[220, 719, 1079, 1437, 1938], giving gaps [499, 360, 358, 501] px. The outer gaps are about 39% larger than the inner gaps.
  - Highlight exact sentence: PASS. `Ended up in hospital today from stress.` is the sole highlighted phrase; partial stroke is visible at p0.25 and the complete amber band at p0.40 onward in both orientations.
  - No Foley on entrance: PASS. `probe-sound-map.ts` reports `mutedCueIds: ["surface:enter"]`. The later mark still has its separate `mark:0` swipe cue (`foley-whoosh`); it is not the entrance.
  - Fade plus subtle upward settle: PASS. p0.00 is clear; p0.02 is partially visible and lower; by p0.04 it is fully settled. The detected dark-card top moves upward 23 px horizontally (y=36→13) and 40 px vertically (y=1066→1026), while the frame difference from p0.02→p0.04 is nonzero (mean absolute channel delta 14.62 horizontal / 13.16 vertical).
  - Native sharpness: PASS; see R1/R2/R6.
  - Clipping: FAIL horizontally; see finding 2.
  - Determinism: PASS. All eight same-progress repeat comparisons are byte-for-byte pixel-identical (max delta 0, mean delta 0, 0% changed pixels).

R-rule verification (gating):
  R1 (text sharpness): At 200% on the smallest settled body/metadata strokes in `.tmp-baselines/web-document-twitter-v3-horizontal/p0.80.png` at (950, 600) and `.tmp-baselines/web-document-twitter-v3-vertical/p0.80.png` at (150, 1550), observed crisp single-pixel transitions without doubled or colored edges. Probe: `probe-text-edge.ts` → horizontal {"luma_range":0.9292,"max_step":0.9026,"max_step_normalized":0.9714,"fringing_px":0.1,"transition_count":5432}; vertical {"luma_range":0.937,"max_step":0.9183,"max_step_normalized":0.98,"fringing_px":0.13,"transition_count":9956}. PASS.
  R2 (resampled/transformed sharpness): At 200% on avatar, browser address text, and body in both p0.80 captures at approximately (900, 350) horizontal and (180, 1450) vertical, observed equal edge sharpness between the transformed Surface and its internal text; no block doubling or soft low-resolution intermediate is visible. Probe: R1 text-edge measurements remain normalized ≥0.97 in both targets. PASS.
  R3 (shadow falloff): At 400% on the right diffuse screen/card shadow in `.tmp-baselines/web-document-twitter-v3-vertical/p0.80.png` at (2035, 1250), observed continuous falloff without a hard outer rim. Probe: `probe-banding.ts --channel luma` → {"channel":"luma","max_step":0.298,"band_count":6,"transition_span_px":0}. The maximum step remains just under Q16's 0.30 ceiling; the region also includes the card boundary, so the plateau count is not treated as an outer-shadow band count. PASS.
  R4 (edge antialiasing): At 400% on the avatar circle, verification badge, browser corners, and action-icon curves in both p0.80 captures (avatar near (900, 350) horizontal / (220, 1500) vertical), observed fractional edge coverage without naked single-pixel stair steps. Probe: not required by the current Critic numeric list. PASS.
  R5 (tonal banding): At 200% on the neutral quiet field in `.tmp-baselines/web-document-twitter-v3-horizontal/p0.80.png` at (0, 400) and vertical p0.80 at (0, 100), observed continuous flat tone with no posterized steps. Probe: `probe-banding.ts --channel luma` → both regions `max_step=0`, `band_count=1`, `transition_span_px=null`. PASS.
  R6 (native resolution): At 200% on both complete frames, backing-store captures are native and text stays as sharp as the native canvas. Probe: `probe-dimensions.ts` → horizontal {"width":3840,"height":2160}; vertical {"width":2160,"height":3840}. Harness banners independently reported `backing=3840x2160` and `backing=2160x3840`. PASS.
  R7 (compression artifacts): At 200% on address-bar gradients, dark post field, avatar, and highlight edges in both lossless PNG captures, observed no macroblocks, ringing, or mosquito noise. Probe: PNG capture is lossless; no export-codec probe was requested for these render captures. PASS.
  R8 (do not hide R failures): No R failure was hidden with a Preset value. The failures below are layout/default and animation-craft failures, not raster-quality failures. PASS.

Q-rule walk:
  - Q1 PASS — pixel-faithful X/browser identity is coherent.
  - Q2 PASS — the screen treatment is restrained at viewing distance.
  - Q3 PASS — one consistent diffuse shadow/halo direction.
  - Q4 RUBRIC GAP — `probe-hue-count.ts` reports 5 saturated bins horizontal and 4 vertical: horizontal centers 45°, 15°, 195°, 135°, 75°; vertical 45°, 15°, 195°, 135°. These arise from the faithful browser traffic lights, verified badge, photographic avatar, and amber mark, not a noisy authored channel palette. The literal ≤3 rule has no found-document exemption.
  - Q5 PASS — browser, X post, photograph, and physical highlighter each obey their claimed physics.
  - Q6 PASS — the highlight's slight irregularity is deterministic; repeat captures are identical.
  - Q7 PASS — name, handle, body, metadata, and mark hierarchy use weight/color in addition to size.
  - Q8 PASS — body measure and line height remain readable in both orientations.
  - Q9 PASS — `probe-ink-coverage.ts` → horizontal {"channel":"luma","ink_ratio":0.6122,"quiet_ratio":0.3878}; vertical {"channel":"luma","ink_ratio":0.4291,"quiet_ratio":0.5709}.
  - Q10 PASS — the hospital-stress highlight is the sole focal point after its mark beat.
  - Q11 PASS — X/browser radii and icon line language are internally consistent.
  - Q12 PASS — no composition-wide Effect stack; the Surface screen pass is restrained.
  - Q13 PASS — no additive element is incorrectly layered over a transforming focal element.
  - Q14 FAIL — the horizontal settled still crops the document at the lower frame edge.
  - Q15 PASS — entrance opacity and translation share the same reveal envelope; no effect pop was seen.
  - Q16 PASS — measured right-edge max luma step is 0.298, within the 0.30 bound.
  - Q17 PASS — body ink is slightly below full white (`#e7e9ea`) and metadata/icons step down further.
  - Q18 PASS — the found-document system face is the substrate face; no unnecessary extra family is introduced.

Animation/G-rule walk:
  - G1 PASS — native 4K targets at 30 fps.
  - G2 FAIL — horizontal browser/card geometry reaches the canvas edge and its lower edge/shadow is cropped; readable text itself remains inside title-safe.
  - G3 PASS — vertical readable content stays outside top, bottom, and right platform UI bands.
  - G4 FAIL horizontal — `bodyFontPx = width × 0.046` with horizontal width `3840 × 0.62` produces about 109.5 px font size / about 77 px cap height, above the 30–54 px found-document-body band. Vertical is about 64 px cap height and passes its 40–70 px band.
  - G4-density PASS — the copy reads as a post body rather than sparse signage in vertical; horizontal density is undermined by its oversize type/clipping noted above.
  - G5 PASS — white-on-black body and black-on-amber highlighted ink remain high contrast.
  - G6 PASS entrance — 0.07 normalized over 6 s is 420 ms, in the Syntax ~420 ms enter band.
  - G7 PASS — `settled` suits deliberate card placement; `smooth` suits marker travel.
  - G8 PASS — restrained travel, coordinated fade, and clear focal sequencing.
  - G9 PASS — repeated same-progress captures are pixel-identical.
  - G10 PASS — travel is only 5.5% maximum and contains no scale/rotation/continuous camera motion.
  - G11 FAIL — the same Preset renders in both targets, but horizontal does not genuinely fit/reflow because the content-driven Surface exceeds the frame height.
  - G12 PASS — no background fill is declared; the composition remains an overlay.
  - A1 PASS — mark starts at 0.20, after enter end 0.07 plus buffer.
  - A2 PASS/N/A — only one mark.
  - A3 FAIL — highlight duration 0.20 normalized over 6 s is 1200 ms, well above the 250–500 ms decorative-mark band.
  - A4 PASS — the canonical amber physical highlighter is the only mark color.
  - A5 N/A — highlight is decorative, not a focal magnify/lift-out/isolate operation.

Pack aesthetic:
  - PASS. This is a faithful found-document substrate, where native X/browser physics and typography are allowed. The only channel-added emphasis is the canonical measured amber highlighter. There is no glossy channel chrome, palette wash, or inappropriate Syntax card treatment.

Findings:
  [pipeline-bug] The five action icons are not evenly spaced by visual center.
    Where: `src/lib/pipelines/surfaces/web-document/TwitterMock.svelte:200-214` (`.x-actions`); the first and last SVGs override the shared centered alignment with `justify-self: start/end`.
    Evidence: `.tmp-baselines/web-document-twitter-v3-horizontal/p0.80.png` around y=1990 and `.tmp-baselines/web-document-twitter-v3-vertical/p0.80.png` around y=2684. Measured center gaps are 599/431/431/599 px horizontal and 499/360/358/501 px vertical.
    Proposed fix: Center every SVG in its one-fifth grid cell; remove the first/last edge alignment overrides.

  [default-too-permissive] The content-driven web-document has no height-fit constraint and is clipped in horizontal.
    Where: `src/lib/pipelines/surfaces/web-document/CanvasSource.svelte:25-43` (`CARD_WIDTH_RATIO_H`, width-only layout, content-driven height).
    Evidence: `.tmp-baselines/web-document-twitter-v3-horizontal/p0.80.png` at (1920, 2159): the opaque document continues through the final canvas row, so the lower browser edge/shadow is absent; the detected settled top is only y≈13.
    Proposed tightening: Add content-aware fit/reflow that preserves the full card and action-safe margin in both orientations rather than sizing solely from width.

  [default-too-permissive] Horizontal Twitter body type exceeds the found-document cap-height ceiling.
    Where: `src/lib/pipelines/surfaces/web-document/TwitterMock.svelte:23` (`bodyFontPx = width * 0.046`) combined with `CanvasSource.svelte:26` (`CARD_WIDTH_RATIO_H = 0.62`).
    Evidence: `.tmp-baselines/web-document-twitter-v3-horizontal/p0.80.png` around (1000, 700); calculated cap height is about 77 px versus G4's 54 px maximum, and it contributes directly to vertical overflow.
    Proposed tightening: Make the Twitter mock typography/fit responsive to both target dimensions and enforce the role-specific G4 band.

  [preset-choice] The highlight draw takes 1.2 seconds, over twice the decorative-mark maximum.
    Where: `src/lib/presets/web-document-twitter.json` → `state.marks.timings[0].duration = 0.2` on a 6 s Timeline.
    Evidence: `.tmp-baselines/web-document-twitter-v3-horizontal/p0.25.png` and `p0.40.png`; the mark is still partial at 1.5 s and completes near 2.4 s.
    Suggested value: Use normalized duration about 0.07 (420 ms), within A3's 250–500 ms band.

  [rubric-gap] Q4's raw saturated-hue cap conflicts with pixel-faithful found-document chrome and photography.
    Where: quality rubric Q4; no exemption exists for substrate-native traffic lights, verified badges, or avatar photography.
    Evidence: `.tmp-baselines/web-document-twitter-v3-horizontal/p0.80.png`; `probe-hue-count.ts` reports 5 bins even though only the amber mark is an authored accent.
    Suggested rule: Add a bounded found-document/native-media exemption or a mask-based semantic palette probe while continuing to cap channel-added hues.

Recommendation: IMPLEMENTATION-FIX-REQUIRED

Rationale: raster quality, entrance behavior, exact highlight targeting, silence of the entrance, and frame determinism pass. Acceptance is blocked by a `pipeline-bug` (uneven icon spacing) and two `default-too-permissive` web-document layout defaults (horizontal clipping and out-of-band body sizing). The Preset also needs a shorter highlight draw after the renderer fixes land.
