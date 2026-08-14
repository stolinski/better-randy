Critic report — web-document-twitter — 2026-08-12T22:00:23.741430+00:00

Scope
- Preset: `src/lib/presets/web-document-twitter.json`
- Route: `http://localhost:7263/p/web-document-twitter?source=builtin`
- Pack: `syntax`
- Capture path: sanctioned flag-enabled Chrome on CDP port 9223 only; harness reported `FLAG(copyElementImageToTexture in GPUQueue)=true`.
- Reviewed against `docs/critic.md`, `docs/quality-rubric.md`, `docs/animation-rubric.md`, `docs/packs/syntax/aesthetic.md`, and `docs/CONTEXT.md`.

Captures
- Horizontal native 3840×2160: `.tmp-baselines/web-document-twitter-horizontal/p0.00.png`, `p0.03.png`, `p0.07.png`, `p0.10.png`, `p0.20.png`, `p0.30.png`, `p0.40.png`, `p0.50.png`, `p0.75.png`, `p1.00.png`.
- Vertical native 2160×3840: `.tmp-baselines/web-document-twitter-vertical/p0.00.png`, `p0.03.png`, `p0.07.png`, `p0.10.png`, `p0.20.png`, `p0.30.png`, `p0.40.png`, `p0.50.png`, `p0.75.png`, `p1.00.png`.
- Extra vertical temporal boundary check: `.tmp-baselines/web-document-twitter-vertical-probe/p0.49.png`, `p0.50.png`, `p0.51.png`, `p0.74.png`, `p0.75.png`, `p0.76.png`, `p0.99.png`, `p1.00.png`.

R-rule verification (gating)
- R1 text sharpness: At 200% on the tweet body in `.tmp-baselines/web-document-twitter-horizontal/p0.50.png` at (820, 550), observed crisp native glyph edges without blur. Probe: `probe-text-edge.ts` → luma_range=0.9594, max_step_normalized=0.9399, fringing_px=0.08, transition_count=26944. PASS.
- R1 text sharpness: At 200% on the vertical tweet body in `.tmp-baselines/web-document-twitter-vertical/p0.50.png` at (170, 1450), observed crisp native glyph edges. Probe: luma_range=0.9533, max_step_normalized=0.9591, fringing_px=0.11, transition_count=26096. PASS.
- R2 final-scale sharpness: At 200% on the locally baked avatar, verified badge, browser address, and action glyphs in `.tmp-baselines/web-document-twitter-vertical/p0.50.png` around (165, 1300), observed no enlargement blur or chromatic fringe; the body-edge metrics above remain far above the 0.3 fuzzy threshold after vertical reflow. PASS.
- R3 shadow falloff: At 400% on the left outer card shadow in `.tmp-baselines/web-document-twitter-horizontal/p0.50.png` at (680, 300), observed a continuous soft falloff with no visible hard rim or stair-step. Probe: `probe-banding.ts` → max_step=0.0353, band_count=4.00. PASS.
- R3 shadow falloff: At 400% on the left outer card shadow in `.tmp-baselines/web-document-twitter-vertical/p0.50.png` at (45, 1200), observed the same continuous falloff. Probe: max_step=0.0353, band_count=3.99. PASS.
- R4 edge anti-aliasing: At 400% on the vertical avatar circle in `.tmp-baselines/web-document-twitter-vertical/p0.50.png` at (165, 1300), observed smooth fractional coverage rather than a hard pixel staircase. Probe: `probe-edge-aa.ts` → hard_stairsteps=0, smooth_pixels=101, coverage_ratio=1.0. PASS.
- R5 tonal continuity: At 200% across the true-black card field and bottom shadow in `.tmp-baselines/web-document-twitter-horizontal/p0.50.png` at (900, 2040), observed no posterization. Probe: `probe-banding.ts` → max_step=0.0039, band_count=1.00. The vertical bottom region at (200, 2800) also returned max_step=0.0039. PASS.
- R6 native dimensions: At 100% on the full captures, `probe-dimensions.ts` returned 3840×2160 for `.tmp-baselines/web-document-twitter-horizontal/p0.50.png` and 2160×3840 for `.tmp-baselines/web-document-twitter-vertical/p0.50.png`. No smaller intermediate or upscale was observed. PASS.
- R7 codec/capture artifacts: At 200% on fine address-bar text, avatar detail, body text, and the six action icons in both p0.50 captures, observed no macroblocking, ringing, or mosquito noise. The PNG evidence is lossless. PASS.
- R8 classification: No R failure was hidden as Preset data; all R rules passed, so no `pipeline-bug` is required. PASS.

Q-rule verification
- Q1 identity: The piece consistently reads as a pixel-faithful modern X post inside a browser frame. The true-black X field, X secondary gray, blue verification mark, address, and native action glyphs agree. PASS.
- Q2 texture: No decorative texture is applied to a digital found-document substrate; this is intentional and correct. PASS.
- Q3 light: The card/browser shadow is coherent and there are no competing light effects. PASS.
- Q4 palette restraint: `probe-hue-count.ts` returns saturated_hue_count=5 in both `.tmp-baselines/web-document-twitter-horizontal/p0.50.png` and `.tmp-baselines/web-document-twitter-vertical/p0.50.png` (45°, 15°, 195°, 135°, 75° bins). Literal X/browser semantic colors and the photographic avatar cause the strict numeric excess. FAIL under the current wording; classified below as `rubric-gap` because the bound Syntax aesthetic explicitly requires web documents to be pixel-faithful and found substrates to keep their own physics.
- Q5 physical/formal identity: The substrate behaves as a digital browser/X document; the mark behaves as a physical highlighter over it. PASS.
- Q6 deterministic imperfection: The only hand-made claim is the highlight mark; its slanted, imperfect band is deterministic across identical held frames. PASS.
- Q7 hierarchy: Author weight, body copy, muted handle/date/icons, blue verification, and yellow focal mark create hierarchy without gratuitous scale jumps. PASS.
- Q8 type measure/leading: Horizontal and vertical lines remain comfortably readable; no orphaned micro-column, collision, or clipped descender is present. PASS.
- Q9 negative space: `probe-ink-coverage.ts` returns ink_ratio=0.6078 / quiet_ratio=0.3922 horizontal and ink_ratio=0.4263 / quiet_ratio=0.5737 vertical. Both clear the ≥30% quiet-space requirement. PASS.
- Q10 focal point: The only focal event is “Health comes first.” under the single yellow highlight. PASS.
- Q11 edges/corners: Browser bar, card corners, divider, and icon strokes share a coherent modern UI vocabulary. PASS.
- Q12 effect discipline: No effects are declared; the one support mark is restrained. PASS.
- Q13 stack order: The highlighter sits beneath readable ink and does not cover the body glyphs. PASS.
- Q14 still-frame hold: Every inspected frame is editorially usable; entrance samples remain coherent and the long final hold is stable. PASS.
- Q15 animate in/out: No composition-wide effect is declared. The highlight resolves smoothly into a held editorial state; no pop was observed. PASS.
- Q16 shadow zoning: The browser/card shadow has a close contact region and softer outer falloff without a ghost rectangle. PASS.
- Q17 contrast: Primary copy is near-white on true black; X secondary metadata/icons use the platform's established `#71767b` role on black. All required copy is readable in both orientations. PASS.
- Q18 type families: The found-document substrate uses one X-appropriate sans family; no competing display family appears. PASS.

G-rule and motion verification
- G1 native authoring: Horizontal 3840×2160 and vertical 2160×3840 verified by dimensions probe. PASS.
- G2 safe zones: Horizontal card bounds are approximately (730,20)–(3112,2142); all essential tweet content is inset inside the card. No body text or action glyph clips. PASS.
- G3 vertical UI safe zones: Vertical card bounds are approximately (86,1032)–(2073,2813), centered well away from top/bottom platform UI zones; essential content and all actions remain protected. PASS.
- G4/G4-density: Author, body, date, address, and action roles remain legible at native delivery scale; the body retains body-copy density rather than caption density. PASS.
- G5 contrast: True-black X surface with near-white body copy provides strong contrast; muted platform metadata remains readable, and the yellow mark leaves dark ink legible. PASS.
- G6 duration: The surface enter occupies progress 0.00–0.07 (0.42 s of a 6 s Timeline); the mark develops over progress 0.20–0.40 (1.2 s), followed by a useful hold. PASS.
- G7 ease: The surface uses `settled`; the highlight uses `smooth`; both match their semantic jobs. PASS.
- G8 motion principles: Surface movement establishes the document, then the highlight directs attention. Motion is restrained, staged, and does not compete with reading. PASS.
- G9 deterministic/frame-addressable: Timeline seeks landed at exact expected times. Horizontal mean pixel delta was 0.06947 from p0.00→p0.03, 0.00635 from p0.03→p0.07, 0 through the settle, 0.00319 and 0.00299 through the mark, then 0 across the hold. Vertical showed the same staged pattern (0.07355, 0.01035, then 0.00223/0.00214 for the mark). Extra 0.49/0.50/0.51 and 0.99/1.00 captures remained stable. PASS.
- G10 motion safety: No flashing, rapid oscillation, high-frequency zoom, or unsafe spatial sweep occurs. PASS.
- G11 genuine reflow: One Preset renders both targets. Horizontal uses a broad nearly full-height browser card; vertical uses a centered, shallower card with rewrapped body measure. The content is not clipped or merely scaled from horizontal. PASS.
- G12 transparency: The Preset does not declare a composition background fill. The X true-black is confined to the requested browser/document card; neutral proxy footage remains visible around it. PASS.

Requested-content checks
- Modern X treatment: true-black post field, `#e7e9ea`-role primary copy, muted secondary copy/icons, X-blue verified badge, true-black dividers and modern six-action footer are visibly present. PASS.
- Rob Hallam text: The render contains exactly the supplied text-only post: “I'm done with them fucking with us. / Ended up in hospital today from stress. / Stayed up all night pushing my limits too hard, thinking it would be removed. / Health comes first. / Do better @AnthropicAI”. No inline media is rendered. PASS.
- Locally baked avatar: `static/web-document-twitter/robj3d3.png` exists at 400×400 and is visibly used beside Rob Hallam in both orientations. PASS.
- Footer grouping/spacing: Reply, repost, like, and views form an evenly distributed engagement group; bookmark and share form a tight utility group at the far edge, with a visibly larger inter-group gap. No icon collision occurs. PASS.
- Marks: The single measured Syntax highlighter (`#fabf47`, intensity 0.62) grows beneath “Health comes first.” and holds without obscuring the ink. PASS.

Findings
- [rubric-gap] Q4 has no exception or evaluation rule for semantic colors inside a pixel-faithful found-document substrate.
  Where: `docs/quality-rubric.md` Q4 versus `docs/packs/syntax/aesthetic.md` § Substrate Vocabulary and § Palette.
  Evidence: `.tmp-baselines/web-document-twitter-horizontal/p0.50.png`:(793,107) and `.tmp-baselines/web-document-twitter-vertical/p0.50.png`:(138,1104); `probe-hue-count.ts` reports five saturated hue bins, driven by faithful browser traffic controls, X verification blue, and locally baked photographic avatar.
  Suggested rule: State whether semantic colors and photographic hues inside a literal found-document substrate are exempt, region-scoped, or palette-counted; otherwise the pixel-faithful web-document requirement and Q4 cannot both be satisfied.

No `pipeline-bug`, `default-too-permissive`, `preset-choice`, or `aesthetic-miss` findings.

Recommendation: ACCEPT
