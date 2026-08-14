Critic report — tweet-stack-reaction-flood — 2026-08-12T20:45:44Z

Scope
- Preset: `src/lib/presets/tweet-stack-reaction-flood.json`
- Route: `http://localhost:7263/p/tweet-stack-reaction-flood?source=builtin`
- Pack: `syntax`
- Sanctioned capture path only: flag-enabled Chrome on CDP port 9223 via `scripts/launch-cdp-chrome.sh` and `scripts/cdp-capture.mjs`.
- The gray field in screenshots is the harness's neutral-footage proxy behind this transparent composition; it is not a painted Surface.

Captures
- Horizontal native sequence: `.tmp-baselines/tweet-stack-reaction-flood-horizontal/p0.00.png`, `p0.05.png`, `p0.12.png`, `p0.20.png`, `p0.30.png`, `p0.40.png`, `p0.50.png`, `p0.60.png`, `p0.70.png`, `p0.80.png`, `p0.89.png`, `p0.90.png`, `p0.94.png`, `p0.98.png`, `p1.00.png`.
- Vertical native sequence: `.tmp-baselines/tweet-stack-reaction-flood-vertical/p0.00.png`, `p0.05.png`, `p0.12.png`, `p0.20.png`, `p0.30.png`, `p0.40.png`, `p0.50.png`, `p0.60.png`, `p0.70.png`, `p0.80.png`, `p0.89.png`, `p0.90.png`, `p0.94.png`, `p0.98.png`, `p1.00.png`.
- Exit detail: `.tmp-baselines/tweet-stack-reaction-flood-horizontal-detail/p0.90.png` through `p0.98.png` at 0.01 progress / 100 ms intervals.

R-rule verification (gating)

R1 (text sharpness): At 200% on the smallest date metadata in the first horizontal card in `.tmp-baselines/tweet-stack-reaction-flood-horizontal/p0.89.png` at (740, 650), observed crisp single-pixel stroke transitions without doubling or color fringe. Probe: `probe-text-edge.ts --region 740,650,380,100` → `{"luma_range":0.4477,"max_step":0.4365,"max_step_normalized":0.975,"fringing_px":0.09,"transition_count":508}`. On the vertical final-card date at (330, 2950), Probe → `{"luma_range":0.4376,"max_step":0.4365,"max_step_normalized":0.9974,"fringing_px":0.12,"transition_count":710}`. PASS.

R2 (resampled/transformed sharpness): At 200% on rotated card text and X glyphs around (760, 390) horizontal and (340, 800) vertical in the settled `p0.89.png` captures, transformed content remains as sharp as the unrotated-looking final card; no softer, blocky, or pixel-doubled card is visible. Probe: `probe-text-edge.ts` on horizontal text → `max_step_normalized=0.9987, fringing_px=0.08`; vertical → `max_step_normalized=0.9987, fringing_px=0.05`. PASS.

R3 (shadow quality): At 400% on the shadow-only falloff immediately left of the upper pile in `.tmp-baselines/tweet-stack-reaction-flood-horizontal/p0.89.png` at (610, 420), and the equivalent vertical region at (120, 900), observed a continuous soft falloff without a hard outer rim or visible staircase. Probe: horizontal `probe-banding.ts --region 610,420,65,220` → `{"channel":"luma","max_step":0.0039,"band_count":1.4,"transition_span_px":null}`; vertical `--region 120,900,60,300` → `{"channel":"luma","max_step":0.0039,"band_count":1.51,"transition_span_px":null}`. PASS.

R4 (edge antialiasing): At 400% on the longest rotated upper-card edge and rounded corner in `.tmp-baselines/tweet-stack-reaction-flood-horizontal/p0.89.png` at (680, 280), and vertical at (185, 680), observed smooth fractional coverage across the oblique boundary; no hard single-pixel staircase. Probe: not required by the measurable-rule set; visual inspection at native pixels. PASS.

R5 (tonal banding): At 200% on the largest uniform neutral-footage region in each settled `p0.89.png` at (100, 100), observed a continuous flat tone with no posterized bands. Probe: `probe-banding.ts --region 100,100,400,400` → horizontal `{"channel":"luma","max_step":0,"band_count":1,"transition_span_px":null}`; vertical identical. PASS.

R6 (native resolution): Horizontal `.tmp-baselines/tweet-stack-reaction-flood-horizontal/p0.89.png` at (0, 0): Probe `probe-dimensions.ts` → `{"width":3840,"height":2160}`, target 3840×2160. Vertical `.tmp-baselines/tweet-stack-reaction-flood-vertical/p0.89.png`: `{"width":2160,"height":3840}`, target 2160×3840. The harness banners also reported exact 4K backing stores, and R1 shows native sharpness rather than upscale softness. PASS.

R7 (compression artifacts): At 400% around the white body-text/dark-card edges at (760, 500) horizontal and (330, 2820) vertical, observed no ringing, mosquito noise, macroblocks, or chroma bleed. These are lossless PNG capture frames. Probe: not yet implemented. PASS.

R8 (do not hide pipeline defects in Preset values): No R-rule failure was found or hidden by a Preset adjustment. PASS.

Craft verification (Q1–Q18)
- Q1 PASS — faithful X Dim artifacts consistently use one found-document identity.
- Q2 N/A — no authored texture treatment.
- Q3 PASS — card/shadow lighting is coherent across the pile.
- Q4 PASS — restrained neutral X palette. Probe on both settled `p0.89.png` frames: `probe-hue-count.ts` → `{"saturated_hue_count":0,"clusters":[]}`.
- Q5 PASS — the cards obey found-document/card physics; overlap and shadow order remain coherent.
- Q6 N/A — no element claims a hand-made mark.
- Q7 PASS — display name, handle, body, date, and action chrome retain a clear weight/color hierarchy.
- Q8 PASS — body measures and line-height remain readable in both orientations; no awkward single-word wraps were observed.
- Q9 PASS — horizontal quiet space is 56.22% and vertical quiet space is 50.11%. Probe: `probe-ink-coverage.ts` → horizontal `{"channel":"luma","ink_ratio":0.4378,"quiet_ratio":0.5622}`; vertical `{"channel":"luma","ink_ratio":0.4989,"quiet_ratio":0.5011}`.
- Q10 PASS — the newest/frontmost reaction is the focal reading target at each beat; the final Dima card is fully readable.
- Q11 PASS — all X cards agree on radius and border treatment.
- Q12 PASS — no composition-wide Effect stack.
- Q13 N/A — no additive/transforming Effect ordering.
- Q14 PASS — sampled arrival, hold, and reverse-exit stills remain coherent compositions. The overly long motion envelope is separately classified below.
- Q15 FAIL — each card's derived exit tween is about 576 ms, well beyond G6's 180–280 ms exit band, producing long translucent ghost cards from `.tmp-baselines/tweet-stack-reaction-flood-horizontal-detail/p0.91.png` through `p0.97.png`.
- Q16 PASS — card shadows have a soft multi-zone-looking falloff; R3 provides numeric evidence.
- Q17 PASS — white body ink and muted metadata stay below clipping and maintain tonal detail against the dark cards.
- Q18 PASS — the found-document rendering does not introduce an uncontrolled type-family mix.

Animation and overlay verification
- G1 PASS — native 4K, 30 fps.
- G2 PASS — the complete horizontal pile occupies approximately x=677–3159, y=270–1930, inside 5% title-safe for readable content.
- G3 PASS — the vertical pile occupies approximately x=181–1975 including shadow and y=672–3149; readable text and focal chrome remain outside the top 6%, bottom 16%, and right 9% platform-UI bands. The small shadow excursion near the right boundary is decorative, not readable content.
- G4 PASS — found-document body and metadata remain in the intended document-scale hierarchy and visibly grow for vertical.
- G4-density PASS — the tweets read as document bodies, not title signage.
- G5 PASS — body white on X Dim card is high contrast; muted metadata remains legible on its opaque card even over the neutral footage proxy.
- G6 FAIL — arrival and exit duration bands are violated. With `pileWindow=0.75`, the renderer derives `arrivalSpan=max(0.08, 0.75×0.46)=0.345`, which is 3.45 seconds on this 10-second Preset, not TS2's 250–400 ms. With `exit.duration=0.08`, each card derives `exitSpan=0.08×0.72=0.0576`, or 576 ms, not 180–280 ms.
- G7 MIXED — cubic deceleration is semantically sound for landing, but `sharp` on this long authored exit envelope reads as a prolonged reverse scatter rather than a decisive departure.
- G8 PASS in direction/rotation/follow-through vocabulary; duration prevents the intended decisive read from fully succeeding.
- G9 PASS — repeated seek evidence is deterministic: horizontal and vertical `p0.80.png` equal `p0.89.png` pixel-for-pixel; `p0.00.png` equals `p1.00.png`; `p0.98.png` equals `p1.00.png`.
- G10 PASS — no full-frame zoom/pan or flashing.
- G11 PASS — vertical becomes one Y-dominant column, with larger cards and shared copy; horizontal becomes a two-column cluster.
- G12 PASS — empty start/end frames retain the transparent composition's neutral-proxy appearance; no requested background was painted.
- TS1 PASS — card arrival starts are distinct.
- TS2 FAIL — the renderer's 3.45-second per-card arrival means cards 1–7 are covered by newer cards before their transform reaches its landed pose. They are readable enough to catch the reaction gist while entering, but they do not “land in 250–400 ms.” The final pile is fully still from `p0.80.png` through `p0.89.png`.
- TS3 PASS — exactly eight cards; safe-area results above.
- TS4 PASS — all post content is baked into the Preset; no live network dependency.
- TS5 PASS — the final/top Dima card is fully readable at settle in both orientations. In vertical, the other seven correctly communicate gist through exposed name/header bands rather than pretending to be simultaneously readable bodies.

Syntax Pack aesthetic
- PASS — these are found-document substrates, so faithful X Dim physics and typography are allowed. No gloss, flare, gradient atmosphere, purple tint, or stray channel chrome was added. No `aesthetic-miss` finding.

Findings

[default-too-permissive] Tweet-stack arrival duration scales from the total pile window, allowing multi-second “landings” that violate TS2 and cause vertical cards 1–7 to be occluded before they actually settle.
  Where: `src/lib/pipelines/overlays/tweet-stack/tweet-stack-motion.ts:69-74` (`arrivalSpan` defaults to `max(0.08, window * 0.46)`).
  Evidence: `.tmp-baselines/tweet-stack-reaction-flood-vertical/p0.20.png` through `p0.70.png`; `.tmp-baselines/tweet-stack-reaction-flood-horizontal/p0.12.png` through `p0.70.png`. At 10 seconds and `pileWindow=0.75`, the computed per-card landing is 3.45 seconds versus TS2's 250–400 ms.
  Proposed tightening: derive/cap `cardArrivalWindow` from absolute composition seconds so every card lands in 250–400 ms independently of the total flood window; keep stagger spacing separate from landing duration.

[preset-choice] The authored exit duration makes each reverse-exit card linger for about 576 ms, over twice G6's maximum, creating a long translucent ghost-scatter instead of a decisive exit.
  Where: `src/lib/presets/tweet-stack-reaction-flood.json:113-118`, especially `exit.duration: 0.08`; derivation at `tweet-stack-motion.ts:86-91` uses 72% per card.
  Evidence: `.tmp-baselines/tweet-stack-reaction-flood-horizontal-detail/p0.91.png` through `p0.97.png`, especially (2550, 1420) at `p0.93.png`; vertical `.tmp-baselines/tweet-stack-reaction-flood-vertical/p0.94.png`.
  Suggested value: after the arrival implementation is corrected, use an overall exit duration near `0.035` on this 10-second Preset (350 ms overall, approximately 252 ms per card with the current 72% derivation), then re-capture the reverse stagger.

Recommendation: IMPLEMENTATION-FIX-REQUIRED

Reason: The R-rules pass, safe areas pass, the settled final/top card is readable, and exit determinism is correct. However, the engine's tweet-stack arrival default cannot satisfy TS2 for this valid 10-second Preset because it couples card landing duration to the total pile window. That gating `default-too-permissive` finding requires an implementation change before Preset retuning and re-review. The exit duration is a separate Producer-addressable `preset-choice`.
