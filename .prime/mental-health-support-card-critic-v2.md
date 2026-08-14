Critic report — mental-health-support-card — 2026-08-13T16:23:52.710711+00:00

Scope
- Re-Critic only: the prior horizontal left title-safe failure, the prior vertical heading G4-floor failure, and regressions in exact copy, focal anchors, text sharpness, deterministic still hold, and total silence.
- No source file was edited.
- Sanctioned flag-enabled Chrome on CDP 9223 was used in both orientations. Harness banners reported native backing stores of 3840×2160 and 2160×3840.
- `node scripts/verify-presets.ts` reports `✓ mental-health-support-card.json` and `All preset validation checks passed.`

Captures
- `.tmp-baselines/mental-health-support-card-v2-horizontal/p0.25.png`
- `.tmp-baselines/mental-health-support-card-v2-horizontal/p0.50.png`
- `.tmp-baselines/mental-health-support-card-v2-horizontal/p0.75.png`
- `.tmp-baselines/mental-health-support-card-v2-horizontal/p1.00.png`
- `.tmp-baselines/mental-health-support-card-v2-vertical/p0.25.png`
- `.tmp-baselines/mental-health-support-card-v2-vertical/p0.50.png`
- `.tmp-baselines/mental-health-support-card-v2-vertical/p0.75.png`
- `.tmp-baselines/mental-health-support-card-v2-vertical/p1.00.png`

Fixed finding 1 — horizontal left title-safe
- Target title-safe rectangle: `[192,108]–[3648,2052]`.
- Runtime audit at p0.50 measures the complete Diagram text union at `x=235.6875, y=588.3656, width=2913.1125, height=969.7275`, so its left edge clears title-safe by 43.6875 px and its right edge is 3148.8000 px.
- Pixel measurement on the settled p1.00 capture finds all readable pixels inside `(238,590)–(3051,1540)`. The support-heading pixels are `(238,700)–(2061,782)`; the crisis-heading pixels are `(2320,590)–(3051,892)`.
- The runtime audit returns no issues in horizontal. PASS.

Fixed finding 2 — vertical heading G4 floor
- Required vertical Surface-title cap-height band: 76–138 px.
- Runtime audit measures `support-heading` cap-height `77.112 px` and `crisis-heading` cap-height `77.112 px` (`font-size=110.16 px`, rendered scale `1.0`). Both clear the floor by 1.112 px and remain below the ceiling.
- Exact rendered heading-pixel bounds at p1.00 are support `(628,549)–(1523,927)` and crisis `(620,2257)–(1534,2636)`.
- Regression safe-area check: actual readable pixels across the full vertical still occupy `(620,549)–(1534,3195)`, inside the platform-safe rectangle `[108,230.4]–[1965.6,3225.6]`; the bottom clears by 30.6 px. The DOM line-box union extends to y=3282.786 and makes the conservative runtime audit emit G2, but no glyph/readable pixel enters the excluded band. This is the same line-box-versus-ink distinction used in the prior Critic, not a visible regression. PASS.

Regression checks
- Exact copy: reading order still reconstructs exactly “Struggling with anxiety or depression? Visit ADAA.org for information and support. In crisis or need immediate support? Call or text 988.” Casing and punctuation match. PASS.
- Focal anchors: `ADAA.org` and `988.` remain the only large yellow text anchors in both orientations. Settled yellow glyph bounds are H ADAA `(637,1214)–(1421,1363)`, H 988 `(2600,1270)–(2995,1403)`, V ADAA `(680,1342)–(1464,1491)`, and V 988 `(877,3061)–(1272,3194)`. PASS.
- Text sharpness: at 200% on the smallest support copy in H p1.00 `(700,1500,700,80)`, `probe-text-edge.ts` returns `{"luma_range":0.8977,"max_step":0.8977,"max_step_normalized":1,"fringing_px":0.01,"transition_count":1647}`. V p1.00 `(700,1650,760,60)` returns `{"luma_range":0.8977,"max_step":0.8977,"max_step_normalized":1,"fringing_px":0,"transition_count":1905}`. Strokes remain crisp with no visible fringing. PASS.
- Native dimensions: `probe-dimensions.ts` returns `{"width":3840,"height":2160}` and `{"width":2160,"height":3840}`. PASS.
- Deterministic still hold: p0.75→p1.00 has no geometry, opacity, or content change. Only capture-level quantization noise remains: horizontal 53 channel samples differ with max delta 2/255; vertical 5 samples differ with max delta 1/255. PASS.
- Total silence: `probe-sound-map.ts` reports `cues: []`, `manualCues: []`, and muted automatic cue ids `surface:enter` and `block:support-divider:enter`; all Diagram enters also retain `sound.mute: true`. PASS.

Findings
- None in the requested Re-Critic scope.

Classification summary
- pipeline-bug: 0
- default-too-permissive: 0
- preset-choice: 0
- aesthetic-miss: 0
- rubric-gap: 0

Recommendation: ACCEPT
