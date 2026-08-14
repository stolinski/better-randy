# Critic report — web-document-twitter — 2026-08-12T22:24:02+00:00

Independent review of the current `src/lib/presets/web-document-twitter.json` and current `web-document` Twitter renderer. Prior reports were not used as evidence.

## Verdict

**IMPLEMENTATION-FIX-REQUIRED**

The requested content, highlight, sound, reflow, sharpness, safety, and deterministic-frame checks pass. The gate remains closed because the shared Twitter renderer makes horizontal found-document metadata larger than G4 permits (`default-too-permissive`). Two rubric conflicts are also recorded: a faithful X/browser substrate measures five saturated hue clusters under Q4, and the explicitly requested editorial tail hold conflicts with Q15's unconditional exit rule.

## Captures

Sanctioned flag-enabled Chrome, CDP port 9223, corpus URL `http://localhost:7263/p/web-document-twitter?source=builtin`:

- Horizontal entrance/mark/hold: `.tmp-baselines/web-document-twitter-v5-horizontal/p0.00.png`, `p0.04.png`, `p0.07.png`, `p0.20.png`, `p0.24.png`, `p0.28.png`, `p0.50.png`, `p1.00.png`
- Vertical entrance/mark/hold: `.tmp-baselines/web-document-twitter-v5-vertical/p0.00.png`, `p0.04.png`, `p0.07.png`, `p0.20.png`, `p0.24.png`, `p0.28.png`, `p0.50.png`, `p1.00.png`
- Fine entrance sweep: `.tmp-baselines/web-document-twitter-v5-horizontal-entrance/p0.01.png` through `p0.07.png`
- Determinism repeats: `.tmp-baselines/web-document-twitter-v5-horizontal-repeat/p0.24.png`, `.tmp-baselines/web-document-twitter-v5-vertical-repeat/p0.24.png`

Harness banners reported `FLAG(copyElementImageToTexture in GPUQueue)=true`, horizontal `backing=3840x2160`, and vertical `backing=2160x3840`.

## Requested checks

- **No footer rule/icons/spacing:** PASS. `TwitterMock.svelte` ends after the date metadata; both hold renders contain no separator rule, reply/repost/like/bookmark/share row, or reserved blank footer band.
- **No clipping:** PASS. The full browser card, text, highlight, avatar, date, and menu remain visible in both orientations. Horizontal readable content stays within title-safe; vertical readable content stays clear of the top, bottom, and right platform UI bands. Evidence: horizontal and vertical `p0.50.png`.
- **Horizontal body cap height:** PASS. Rendered body font size is `76.1856px`; G4's specified `0.70` sans cap ratio gives **53.33px**, inside the found-document body band **30–54px**. Vertical is `91.4112 × 0.70 = 63.99px`, inside **40–70px**.
- **Only the hospital-stress sentence highlighted:** PASS. `p0.28.png` and `p0.50.png` show exactly “Ended up in hospital today from stress.” marked; no adjacent sentence or paragraph receives mark ink.
- **Highlight draw is 480ms:** PASS. `0.08 × 6s = 0.48s`; the mark is absent at `p0.20` (1.20s start), partially drawn at `p0.24` (1.44s), and complete at `p0.28` (1.68s).
- **Both automatic Foley cues muted:** PASS. `probe-sound-map.ts` returned `cues: []`, `mutedCueIds: ["surface:enter", "mark:0"]`, `manualCues: []`.
- **Fade plus restrained upward settle:** PASS visually. `p0.00` is clear; the fine sweep shows the card accumulating opacity while its top moves from y=322 at ~0.05s to y=280 at ~0.11s, y=257 at ~0.16s, then y=250 at rest. Motion is monotonic, small, and decelerating, with no scale pop or lateral twitch.
- **Native sharpness / safety / determinism:** PASS except for the separate horizontal metadata G4 ceiling finding below. Same-frame repeat SHA-256 values are byte-identical: horizontal `23690273…` and vertical `d4f03e57…`.

## R-rule verification (gating)

- **R1 text sharpness:** At 200% on the horizontal body in `.tmp-baselines/web-document-twitter-v5-horizontal/p0.50.png` at (820,850), stroke transitions are crisp with no doubled edge. Probe: `probe-text-edge.ts --region 820,850,1200,600` → `{"luma_range":0.9303,"max_step":0.9104,"max_step_normalized":0.9786,"fringing_px":0.11,"transition_count":14090}`. **PASS.** The smaller date at (820,1680) also returns normalized step `0.9904`, fringing `0.1px`.
- **R2 resampling:** At 200% on the locally baked avatar and browser card in horizontal `p0.50.png` at (820,580), the avatar and same-scale DOM text remain sharp rather than pixel-doubled or upscaled. The body edge probe above remains `0.9786`; vertical body probe at (150,1550) returns normalized step `0.9789`, fringing `0.11px`. **PASS.**
- **R3 shadow falloff:** At 400% on the card's right-side screen halo/shadow in horizontal `p0.50.png` at (3113,500), the falloff is visually continuous with no hard outer rim. Probe: `probe-banding.ts --region 3113,500,60,1200` → `{"channel":"luma","max_step":0.0196,"band_count":5,"transition_span_px":null}`; the maximum one-pixel step is far below Q16's 0.30 ceiling. **PASS.**
- **R4 edge AA:** At 400% on the avatar's circular edge in horizontal `p0.50.png` at (820,580), coverage is smoothly anti-aliased. Probe: `probe-edge-aa.ts --region 820,580,250,250` → `{"channel":"luma","hard_stairsteps":0,"smooth_pixels":97,"coverage_ratio":1,"polarity":{"empty_top":97,"full_top":0}}`. **PASS.**
- **R5 tonal banding:** At 200% on the empty black post region in horizontal `p0.50.png` at (2600,1300), tone is stable with no posterized ramp. Probe: `probe-banding.ts --region 2600,1300,300,200` → `{"channel":"luma","max_step":0.0039,"band_count":1,"transition_span_px":0}`. Vertical at (1700,2200) returns the same `max_step=0.0039`. **PASS.**
- **R6 native resolution:** Horizontal dimensions probe → `{"width":3840,"height":2160}`; vertical → `{"width":2160,"height":3840}`. Harness backing stores match, and R1 sharpness is native. **PASS.**
- **R7 compression:** At 400% around the white-on-black body edge and amber mark edge in both `p0.50.png` captures, the lossless PNG evidence has no ringing, mosquito noise, macroblocks, or chroma bleeding. Probe: not yet implemented for still PNG compression. **PASS.**
- **R8 no preset masking of render defects:** No R1–R7 failure was hidden by a Preset adjustment. Probe: not applicable. **PASS.**

## Q-rule walk

- **Q1–Q3:** PASS. Every element reads as one coherent emissive X/browser artifact; material and light treatment agree.
- **Q4:** **CONFLICT / finding.** Full-frame hue probe returns 5 clusters in both orientations. Horizontal: `{"saturated_hue_count":5,"clusters":[{"hue_deg_center":45,"pixel_count":62645},{"hue_deg_center":15,"pixel_count":15329},{"hue_deg_center":195,"pixel_count":2694},{"hue_deg_center":135,"pixel_count":1656},{"hue_deg_center":75,"pixel_count":722}]}`. These arise from the amber highlighter, source avatar, X blue badge, and faithful browser controls.
- **Q5–Q8:** PASS. Platform substrate physics, hierarchy, line-height (`1.4`), and readable measure are coherent. Short one-line tweet paragraphs are source-authentic rather than a narrowed layout defect.
- **Q9:** PASS. Horizontal probe → `{"channel":"luma","ink_ratio":0.4707,"quiet_ratio":0.5293}`; vertical → `{"channel":"luma","ink_ratio":0.4052,"quiet_ratio":0.5948}`, both above the 30% quiet floor.
- **Q10–Q14:** PASS. The hospital-stress sentence is the sole focal beat; edge language and effect stack are restrained; all captured progress frames hold intentionally (including clear frame at zero).
- **Q15:** **CONFLICT / finding.** The entrance and mark are continuous, but the surface intentionally holds through `p1.00` with no exit.
- **Q16–Q18:** PASS. Screen halo is smooth and layered, text is sub-white (`#e7e9ea`) on black, and the found document uses one system-sans family.

## G-rule walk

- **G1–G3:** PASS. Native 4K targets and readable safe zones hold in both orientations.
- **G4 body:** PASS at **53.33px horizontal** and **63.99px vertical**. **G4 metadata:** FAIL horizontally; see finding.
- **G4-density / G5:** PASS for the found tweet layout. Sans leading is `1.4`; text is high contrast on the opaque X panel.
- **G6:** Mark duration (480ms for 7 words), pre-mark establishment (780ms), and post-mark absorption (4.32s available vs 3.15s required) pass. The 420ms surface enter matches Syntax's stated “enter ~420ms” but exceeds G6's generic 400ms ceiling by 20ms; see rubric conflict.
- **G7–G8:** PASS. `settled` is semantically appropriate; the fade/upward deceleration and physical stroke draw provide slow-out, placement follow-through, and secondary focal action without stock-template bounce.
- **G9:** PASS. Repeated same-progress renders are byte-identical in both orientations.
- **G10:** PASS. Travel is only 5.5% of frame height, no zoom, pan, or flash.
- **G11:** PASS. One Preset genuinely reflows to a single wider vertical column with Y-direction motion and shared copy.
- **G12:** PASS. No background fill or stage is declared; the composition remains an overlay. The neutral gray in PNGs is the documented screenshot flattening proxy, not painted Preset background.

## Syntax aesthetic

PASS. A found X document keeps platform-native typography, palette, avatar, badge, and browser physics as required by “Substrate ≠ chrome.” The measured `#fabf47` physical highlighter is the one loud authored mark. Motion is a fast restrained placement plus stroke draw; there is no gloss, flare, collage chrome, or decorative footer chrome.

## Findings

### [default-too-permissive] Horizontal Twitter metadata exceeds the G4 found-document metadata ceiling

- **Where:** `src/lib/pipelines/surfaces/web-document/TwitterMock.svelte:24-25,52,67,70,76` and `src/lib/pipelines/surfaces/web-document/CanvasSource.svelte:56,69`
- **Evidence:** `.tmp-baselines/web-document-twitter-v5-horizontal/p0.50.png` at author/handle/date/address regions around (1050,620), (1050,700), (840,1715), and (1050,330).
- **Measurement:** At 2380.8px card width, author font `71.424px × 0.70 = 50.00px`, handle/date `64.2816px × 0.70 = 45.00px`, and browser address `57.1392px × 0.70 = 40.00px`. G4's horizontal found-document metadata band is **18–34px**. Vertical metadata remains in its 24–44px band.
- **Proposed tightening:** Give the horizontal Twitter/browser metadata ratios their own bounded values so author, handle/date, menu, and address cap heights stay ≤34px without changing the already-correct body ratio or vertical reflow.

### [rubric-gap] Q4 has no faithful-found-document substrate treatment

- **Where:** `docs/quality-rubric.md` Q4 versus `docs/packs/syntax/aesthetic.md` “Substrate ≠ chrome” and “Web documents.”
- **Evidence:** Both `p0.50.png` captures; numeric hue probes above return 5 clusters.
- **Suggested rule:** State whether source-authentic platform controls, verified badges, and photographic avatar hues inside a found-document substrate count toward the three-hue authoring cap. The current strict cap conflicts with the Pack's pixel-faithful artifact requirement.

### [rubric-gap] Q15's unconditional exit conflicts with an explicitly authored editorial tail hold

- **Where:** `docs/quality-rubric.md` Q15 versus this Preset's declared editorial hold and `web-document/index.ts` hold-last-frame contract.
- **Evidence:** `.tmp-baselines/web-document-twitter-v5-horizontal/p1.00.png` and vertical `p1.00.png` remain fully present, continuously, with no pop.
- **Suggested rule:** Either require an explicit tail-hold declaration that exempts intentionally extendable transparent overlays, or state that all corpus Presets must fade out even when the delivery brief requires a hold.

### [rubric-gap] Syntax calls a 420ms entrance G6-compatible while G6 caps entrances at 400ms

- **Where:** `docs/packs/syntax/aesthetic.md` Motion Vocabulary versus `docs/animation-rubric.md` G6.
- **Evidence:** `src/lib/presets/web-document-twitter.json:49` → `0.07 × 6s = 420ms`; entrance sweep paths above.
- **Suggested rule:** Align the Pack's nominal entrance duration or add an explicit tolerance to G6. The rendered entrance itself is smooth and restrained.

## Recommendation

**IMPLEMENTATION-FIX-REQUIRED.** Tighten the horizontal Twitter/browser metadata sizing in the shared renderer, then re-run the Critic. The core requested Twitter composition behavior passes; the remaining non-renderer items require rubric-owner decisions rather than silent reinterpretation.
