Critic report — web-document-twitter — 2026-08-12T22:16:06+00:00

Scope: independent v4 review of `src/lib/presets/web-document-twitter.json` at
`http://localhost:7263/p/web-document-twitter?source=builtin`, using the sanctioned
CanvasDrawElement Chrome on CDP 9223. Both orientations were reviewed. Source was not modified.

Captures:
  - `.tmp-baselines/web-document-twitter/horizontal/p0.00.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.02.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.04.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.07.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.10.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.25.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.50.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p0.75.png`
  - `.tmp-baselines/web-document-twitter/horizontal/p1.00.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.00.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.02.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.04.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.07.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.10.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.25.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.50.png`
  - `.tmp-baselines/web-document-twitter/vertical/p0.75.png`
  - `.tmp-baselines/web-document-twitter/vertical/p1.00.png`
  - deterministic repeats: `.tmp-baselines/web-document-twitter/determinism-a/p0.50.png`, `.tmp-baselines/web-document-twitter/determinism-b/p0.50.png`

R-rule verification (gating):
  R1 (text sharpness): At 200% on the tweet body in the horizontal settled frame at
     `.tmp-baselines/web-document-twitter/horizontal/p0.50.png` (820, 620), glyph edges are crisp
     and do not bloom. Probe: `probe-text-edge.ts --region 820,620,1600,650` →
     `luma_range=0.9497, max_step_normalized=0.9486, fringing_px=0.09, transition_count=17569`.
     Vertical at (430, 1600): `luma_range=0.93, max_step_normalized=0.9789,
     fringing_px=0.11, transition_count=20341`. PASS.
  R2 (final-scale resampling): At 200% on avatar, badge, and browser address text in the same
     horizontal frame at (820, 350), raster and vector details remain sharp at final scale with no
     double edge. Probe: same text-edge outputs above; normalized max steps are 0.9486/0.9789. PASS.
  R3 (shadow falloff): At 400% on the clean lower shadow edge in
     `.tmp-baselines/web-document-twitter/horizontal/p0.50.png` (1500, 2040), the shadow resolves
     smoothly without a hard rim. Probe: `probe-banding.ts --region 1500,2040,800,110` →
     `max_step=0.0039, band_count=1.54, transition_span_px=0`; vertical lower edge at (700, 2720)
     → `max_step=0.0039, band_count=1, transition_span_px=0`. PASS.
  R4 (edge antialiasing): At 400% on the avatar circle and rounded browser/card corners in the
     horizontal settled frame at (730, 73), curves are antialiased without visible stair steps.
     Probe: `probe-edge-aa.ts` returned `hard_stairsteps=0`; its chosen corner region contained no
     qualifying full edge columns (`coverage_ratio=null`), so visual inspection is authoritative. PASS.
  R5 (tonal banding): At 400% on the neutral exterior and lower card/shadow transition in the
     settled captures at horizontal (1500, 2040) and vertical (700, 2720), the flat fields are even
     and the shadow contains no posterized rings. Probe: the R3 banding runs returned max-step
     0.0039 in both orientations. PASS.
  R6 (native resolution): On the complete clipped canvases, probe:
     `probe-dimensions.ts` → horizontal `{"width":3840,"height":2160}`, vertical
     `{"width":2160,"height":3840}`. PASS.
  R7 (codec artifacts): At 200% on body text and the yellow highlight in both settled PNG captures
     at horizontal (820, 850) and vertical (430, 1750), no ringing, blocking, or mosquito noise is
     visible. Probe: not implemented for the capture-only lane; no encoded export was supplied. PASS
     for preview/native rendering only.
  R8 (do not hide pipeline defects in Preset data): No R1–R7 failure is being avoided by a Preset
     value. The remaining requested-action-icon defect below is correctly routed to renderer code,
     not hidden in JSON. PASS.

Requested-change verification:
  - Bottom hairline: wholly absent in both orientations. The region below the timestamp through the
    card foot is uninterrupted true black until the rounded card edge/shadow: horizontal
    `.tmp-baselines/web-document-twitter/horizontal/p0.50.png` (1900, 1980), vertical
    `.tmp-baselines/web-document-twitter/vertical/p0.50.png` (1080, 2680). PASS.
  - Action icons: FAIL. The reply/repost/like/bookmark/share footer row is absent, but the header
    overflow action (`···`) remains visible at horizontal (2975, 454) and vertical (1950, 1400).
    “All action icons” is therefore not satisfied.
  - Hospital-stress highlight: the highlight covers exactly “Ended up in hospital today from stress.”
    in both orientations, with no spill into adjacent paragraphs. It is the single dominant warm
    focal mark and remains legible with dark ink. PASS.
  - Muted fade + settle: frames p0.00→p0.02→p0.04→p0.07 show a restrained opacity/vertical settle,
    with no audio cue authored (`sound.mute: true`), then a stable hold. `probe-temporal-energy.ts`
    returned `verdict=pass`, settled energies 0.10306 horizontal and 0.10579 vertical, with no
    non-monotonic dip beyond 25%. PASS.
  - Determinism: two independent horizontal p0.50 captures are pixel-identical.
    `probe-frame-diff.ts` reports `mean_delta=0, changed=false`; its overall “fail” only reflects that
    the tool expects an animated/alpha-bearing multi-frame export, not repeat-frame determinism. PASS.
  - Safe areas/reflow: horizontal readable content is comfortably title-safe. Vertical readable
    content stays inside the top 6%, bottom 16%, and right 9% UI exclusions; the card becomes one
    wider readable column centered in the middle field rather than a horizontal crop. PASS.

Q1–Q18:
  Q1 PASS — browser frame and X status commit to one faithful web-document identity.
  Q2 PASS — no decorative texture is claimed or needed.
  Q3 PASS — restrained card shadow is directionally consistent.
  Q4 PASS with note — the highlight is the dominant saturated field; the tiny browser traffic lights
     and verification badge are semantic substrate details. Probe (`--downsample 4`) reports five
     hue clusters in each orientation: horizontal pixel counts 8502/1052/185/105/53, vertical
     5873/748/131/76/39. They do not compete perceptually at viewing distance.
  Q5 PASS — browser, X panel, avatar, and physical highlight obey their identities.
  Q6 N/A — no hand-made chrome is claimed; highlight geometry is deterministic.
  Q7 PASS — name weight, body color, muted handle/date establish hierarchy without size theatrics.
  Q8 PASS — body measure and line-height read cleanly in both orientations.
  Q9 PASS — `probe-ink-coverage.ts` reports quiet ratios 0.4219 horizontal and 0.5948 vertical.
  Q10 PASS — the hospital-stress highlight is the sole hero beat.
  Q11 PASS — browser/card corners and avatar circle agree with their materials.
  Q12 PASS — no effect stack; one focal mark only.
  Q13 N/A — no additive effect ordering conflict.
  Q14 PASS — every sampled still holds; no awkward intermediate crop or collision.
  Q15 PASS — the surface fades/settles without a pop; the highlight draws once and holds intentionally.
  Q16 PASS — shadow is restrained and smooth at native scale.
  Q17 PASS — body/date hierarchy stays below maximum surface contrast where appropriate.
  Q18 PASS — one substrate type family is visible.

G-rules:
  G1 PASS — native 3840×2160 and 2160×3840 captures.
  G2 PASS — readable text remains in the 5% title-safe area.
  G3 PASS — vertical readable content avoids platform UI exclusion bands.
  G4/G4-density PASS — found-document body and metadata remain readable, body-like, and properly
     differentiated in both orientations.
  G5 PASS — light text on true black and dark ink on the yellow highlight clear the required contrast.
  G6 PASS — 420 ms enter is close to the channel's ~420 ms preference; the six-word decorative mark
     uses 1.2 s and leaves a long absorption hold.
  G7 PASS — `settled` is correct for surface entry; `smooth` is correct for the editorial mark.
  G8 PASS — opacity plus restrained upward settle directs attention without theatrical motion.
  G9 PASS — repeated p0.50 captures have mean pixel delta 0.
  G10 PASS — no flashing, strobing, or unsafe motion; motion is brief and low amplitude.
  G11 PASS — one Preset genuinely reflows to a centered, single-column vertical document.
  G12 PASS — no background fill is authored; exterior remains the neutral-footage proxy in screenshot
     capture, while the web document itself is the only opaque region.

Syntax Pack aesthetic:
  PASS. This is a found web-document substrate, so X/browser verisimilitude takes precedence over
  Syntax card chrome. The measured `#fabf47`-family hospital highlight is explicitly the Pack's
  web-document canon exception. Motion is flat, decisive, and free of gloss.

Findings:
  [pipeline-bug] The header overflow action remains despite the request to remove all action icons.
    Where: `src/lib/pipelines/surfaces/web-document/TwitterMock.svelte:70` (`x-more` is hardcoded and
    has no Preset-level control).
    Evidence: `.tmp-baselines/web-document-twitter/horizontal/p0.50.png`:(2975,454) and
    `.tmp-baselines/web-document-twitter/vertical/p0.50.png`:(1950,1400).
    Proposed fix: remove the hardcoded overflow affordance from this Twitter rendering state, or add
    a real schema-backed visibility option and set it off for this Preset. Do not work around it with
    clipping or color matching.

  [rubric-gap] Capture-only R7 verification cannot prove the encoded deliverable is artifact-free.
    Where: R7 verification protocol.
    Suggested rule: require an encoded export/decode artifact when codec quality is in review, or
    explicitly scope R7 to the native render when no export is supplied.

Recommendation: IMPLEMENTATION-FIX-REQUIRED

Verdict: The bottom hairline and footer action row are gone; composition, spacing, highlight, muted
fade/settle, native sharpness, safe-area reflow, and determinism pass. The literal request that **all**
action icons be absent does not pass because the header overflow action is still rendered by the
Twitter Surface pipeline. This is not fixable in the Preset JSON today.
