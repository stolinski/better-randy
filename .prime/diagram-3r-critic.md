Critic report — diagram-3r-principle — 2026-08-12T23:20:34.220215+00:00

Scope:
  User composition: user-compositions/diagram-3r-principle.json
  Route: http://localhost:7263/p/diagram-3r-principle (no source=builtin)
  Duration: 10.00 s at 30 fps
  Capture browser: sanctioned flag-enabled Chrome on CDP port 9223
  Capture sweep: 38 timeline samples per orientation at progress
    0, .03, .05, .08, .10, .12, .14, .16, .18, .20, .22, .25, .28,
    .31, .35, .37, .38, .40, .45, .50, .52, .55, .56, .58, .60,
    .64, .66, .68, .71, .73, .75, .80, .85, .90, .94, .96, .98, 1.

Captures:
  - .tmp-baselines/diagram-3r-principle/horizontal/p0.00.png through p1.00.png (38 sampled frames)
  - .tmp-baselines/diagram-3r-principle/vertical/p0.00.png through p1.00.png (38 sampled frames)
  - .tmp-baselines/diagram-3r-principle/determinism/p0.90.png

Capture and determinism evidence:
  - Horizontal harness banner: canvas backing=3840x2160; probe-dimensions.ts → {"width":3840,"height":2160}.
  - Vertical harness banner: canvas backing=2160x3840; probe-dimensions.ts → {"width":2160,"height":3840}.
  - Independent horizontal recapture at 90% is byte/pixel identical to the first capture: max channel delta=0, differing channel values=0, SHA-256 pixel buffers equal.

R-rule verification (gating):
  R1 (text sharpness): At 200% on the RESPONSIBILITY node in
     .tmp-baselines/diagram-3r-principle/horizontal/p0.90.png at (1700, 570),
     observed: glyph strokes are crisp single-pixel transitions with no color fringe.
     Probe: probe-text-edge.ts --region 1700,570,1100,250 →
     {"luma_range":0.977,"max_step":0.9412,"max_step_normalized":0.9633,"fringing_px":0,"transition_count":2766}. PASS.
     Cross-orientation check on the vertical RESPONSIBILITY node in
     .tmp-baselines/diagram-3r-principle/vertical/p0.90.png at (660, 1920):
     probe-text-edge.ts --region 660,1920,900,260 →
     {"luma_range":0.977,"max_step":0.9412,"max_step_normalized":0.9633,"fringing_px":0,"transition_count":2746}. PASS.

  R2 (resampled/translated content): At 200% on the horizontal and vertical node/label regions in the same p0.90 captures, observed: no region is softer, blockier, or pixel-doubled relative to same-size neighboring text; the composition contains no sampled media asset or texture. Probe: probe-text-edge.ts outputs above show the same 0.9633 normalized edge step in both orientations. PASS.

  R3 (shadow falloff): At 400% on the outer right edge of the RESULT node's hard-offset shadow in
     .tmp-baselines/diagram-3r-principle/horizontal/p0.90.png at (1398, 1100),
     observed: the shadow remains near RGB (6,6,6) through x=1397 and jumps directly to background RGB (15–16,15–16,15–16) at x=1398, with no gaussian falloff. The shadow is a hard rectangular plate/rim, not a continuous-opacity falloff.
     Probe: probe-banding.ts --region 1380,1080,40,40 →
     {"channel":"luma","max_step":0.1692,"band_count":3,"transition_span_px":0}. FAIL.

  Per docs/critic.md, the first failing R-rule stops the Critic. R4–R8, Q1–Q18, G-rules, and Pack-aesthetic evaluation were not scored. The captures nevertheless establish native backing dimensions and deterministic pixels as requested; they do not override the R3 stop.

Findings:
  [pipeline-bug] Diagram box nodes render the Syntax Pack's zero-blur hard-offset depth as a CSS box shadow, violating R3's mandatory continuous falloff.
    Where: src/lib/platform/DiagramMount.svelte:175-185 (depth treatment converted to box-shadow); src/lib/pipelines/blocks/node/CanvasSource.svelte:56 (box-shadow paint); src/lib/packs/syntax/manifest.ts:246-248 (node hardOffset dx=8, dy=8, blur=0).
    Evidence: .tmp-baselines/diagram-3r-principle/horizontal/p0.90.png:(1398,1100); the same hard-rim treatment is visible under all three node cards in both orientations.
    Proposed fix: Repair the Diagram node depth rendering/Pack role so anything represented as a shadow has continuous gaussian-quality falloff. If the hard-offset shape is meant to be a non-shadow graphic plate, model and render it as a separate formal layer rather than through box-shadow, so it no longer makes a shadow claim under R3.

Requested composition inspection (descriptive only; not a Q/G score after the R3 stop):
  - The intended two-state explanation is clear at the settled frame: white RESULT→RESPONSE passive shortcut, yellow RESULT→RESPONSIBILITY→RESPONSE active/critical route, and large white box nodes.
  - Horizontal and vertical stages are materially different rather than scaled copies. The horizontal route reads left-to-right; vertical restages into a central stack with the passive route arcing on the right. No text, node, arrowhead, edge, title, subtitle, label, or source line is clipped in the 76-frame sweep.
  - Edge endpoints remain outside node interiors and arrowheads remain readable at the sampled transition peaks. Reveal order is coherent from title/source through passive route, then active route, with a stable hold from 75% to 94% and a smooth exit through 98%.
  - Title hierarchy is strong. The vertical subtitle wraps RESPONSE to a second line, but remains centered and readable; it does not collide with the title or AI OUTPUT label.

Sound-data inspection:
  - Automatic Diagram transitions: 28 enter/exit transition objects inspected; 28/28 contain sound={"mute":true}; 0 automatic transition sounds remain unmuted.
  - Manual cues: exactly 9. Every cue uses assetSlug="foley-tick", duration=0.014, volume=0.22.
  - Cue starts: .03, .12, .20, .28, .38, .50, .56, .64, .71. These match meaningful arrivals: title, AI output, Result, passive route, Response, active-route departure, Responsibility, active return, and active/critical label.
  - Tweet-cluster comparison: user-compositions/tweet-stack-reaction-flood.json uses the same foley-tick asset, duration 0.014, and volume 0.22. PASS.

Recommendation: IMPLEMENTATION-FIX-REQUIRED
