# Critic report — tweet-stack-reaction-flood — 2026-08-12T20:55:23+00:00

## Recommendation

**REVISE** — the rendered implementation meets the requested motion, avatar, black-card, scale, edge-placement, reflow, and still-end behavior, with **zero `pipeline-bug` and zero `default-too-permissive` findings**. One Preset metadata sentence still falsely promises a reverse exit. A non-gating rubric conflict is also recorded because TS5 assumes every tweet stack reverse-exits while this requested edit intentionally ends on a still hold.

## Capture setup and evidence

Sanctioned flag-enabled Chrome only, CDP port 9223 (`FLAG(copyElementImageToTexture in GPUQueue)=true`). Route: `http://localhost:7263/p/tweet-stack-reaction-flood?source=builtin`.

Native horizontal captures (3840×2160):

- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.00.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.04.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.05.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.06.png` (requested 0.063; t=0.63 s)
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.07.png` (requested 0.075; t=0.75 s)
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.08.png` (requested 0.076; t=0.76 s)
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.10.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.16.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.25.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.50.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.75.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.80.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.85.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.88.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.90.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.94.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.98.png`
- `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p1.00.png`

The same progress set was captured vertically under `.tmp-baselines/tweet-stack-reaction-flood-v2-vertical/` at 2160×3840.

Checks also run:

- `npm exec vitest run src/lib/pipelines/overlays/tweet-stack/tweet-stack.test.ts` → **9/9 passed**.
- `npm run verify-presets` → `tweet-stack-reaction-flood.json (fixture — schema + semantics)` passed; all Preset validation passed.
- Local avatar inventory → eight baked JPEGs exist under `static/tweet-stack-reaction-flood/`; seven are 400×400 and one is 267×267. All eight render as distinct photographic portraits, not initials or broken-image fallbacks, in both settled captures.

## Requested-change verification

| Requested behavior | Evidence | Verdict |
|---|---|---|
| No animate-out; cards remain at end | Horizontal and vertical `p0.85`, `p0.88`, `p0.90`, `p0.94`, `p0.98`, and `p1.00` are visually unchanged. Pixel placement and opacity remain settled through the endpoint. | PASS |
| Zoom-land, not side travel | First card occupies its final x/y pose throughout `p0.06` → `p0.08`; only scale/opacity resolves. Unit test also asserts identical x/y before and after landing. | PASS |
| Snappy 260 ms entries | First arrival starts at 0.50 s (`p0.05` empty at the exact start), is visibly scaling at 0.63 s (`p0.06`), is effectively settled at 0.75 s (`p0.07`), and reaches the exact settled state at 0.76 s (`p0.08`): 260 ms. Test `caps card zooms to an absolute broadcast timing window` passes. | PASS |
| Actual locally baked X avatars | Every `avatarUrl` is a root-local `/tweet-stack-reaction-flood/*.jpg`; all eight files exist and all eight distinct portraits render in `p0.85` in both orientations. No live X request is needed. | PASS |
| True black X cards | Settled card interiors are `#000` (sampled luma 0); faithful X dim chrome is visible. | PASS |
| Larger cards close to edges | Horizontal settled geometry spans approximately x=369..3470 and y=68..2090; vertical spans approximately x=80..2080 while readable pixels stay out of platform UI bands. | PASS |
| No clipping / legibility loss | No card is frame-clipped. Horizontal cards retain readable bodies. In vertical, earlier cards are intentionally occluded as reaction gist; the topmost/final Dima card remains fully readable, satisfying TS5. | PASS |

## R-rule verification (gating)

- **R1 text sharpness:** At 200% on the Gabe body text in `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.85.png` at (430,330), glyph strokes are crisp with no soft halo. Probe: `probe-text-edge.ts` → `{"luma_range":0.8997,"max_step":0.8997,"max_step_normalized":1,"fringing_px":0.01,"transition_count":6894}`. **PASS**.
- **R2 transformed-content sharpness:** At 200% on the rotated final Dima body in `.tmp-baselines/tweet-stack-reaction-flood-v2-vertical/p0.85.png` at (250,2760), text and portrait remain sharp at final scale. Probe: `probe-text-edge.ts` → `{"luma_range":0.8997,"max_step":0.8997,"max_step_normalized":1,"fringing_px":0,"transition_count":9664}`. **PASS**.
- **R3 shadow falloff:** At 400% on the isolated upper-left card edge in `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.85.png` at (450,100), the shadow/edge falloff is smooth without a hard luminous rim. Probe: `probe-banding.ts` → `{"channel":"luma","max_step":0.0395,"band_count":1.55,"transition_span_px":10.5}`. **PASS**.
- **R4 non-axis edge anti-aliasing:** At 400% on the rotated Gabe top edge in `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.85.png` at (500,167), coverage resolves over four intermediate luma samples (106.0 → 74.6 → 44.3 → 25.4 → 0), with no one-pixel staircase. `probe-edge-aa.ts` returns no classified columns (`coverage_ratio:null`) because the sanctioned capture flattens transparency against #7f7f7f while that probe's HIGH threshold is 224; the direct pixel sequence is the applicable numeric observation. **PASS**.
- **R5 tonal banding:** At 400% on the empty neutral field in `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.85.png` at (0,0), the field is uniform with no posterized steps. Probe: `probe-banding.ts` → `{"channel":"luma","max_step":0,"band_count":1,"transition_span_px":null}`. **PASS**.
- **R6 native resolution:** Probe: horizontal `{"width":3840,"height":2160}`; vertical `{"width":2160,"height":3840}`. **PASS**.
- **R7 compression artifacts:** At 200% on avatars, curved card borders, and X/action icons in both `p0.85.png` captures, no ringing, macroblocking, or mosquito noise is visible. These are lossless PNG CDP captures; no separate encoded export was requested. **PASS for captured render**.
- **R8 pipeline-root-cause rule:** No R-rule failure was found and no Preset tweak is being proposed to hide a render defect. **PASS**.

## Q-rule walk

| Rule | Result | Observation |
|---|---|---|
| Q1 identity | PASS | Every card uses one faithful X Dim artifact identity. |
| Q2 texture | PASS / N/A | No decorative texture is claimed. |
| Q3 light | PASS | One restrained, consistent card shadow treatment. |
| Q4 palette | PASS | Authored chrome is black/white/gray. Full-frame hue probe reports six tiny clusters (`15, 225, 195, 345, 45, 75`) solely from the eight baked photographic avatars; they are found-document content, not six authored accent hues. |
| Q5 physics | PASS | Flat digital X cards rotate/stack consistently and occlude as cards. |
| Q6 imperfection | PASS / N/A | No handmade claim. Pose variation is deterministic. |
| Q7 hierarchy | PASS | Name weight, muted handle/date, white body, and icon chrome establish hierarchy without size abuse. |
| Q8 measure/leading | PASS | Body measure and 1.45 line-height remain readable in both orientations. |
| Q9 negative space | PASS | Probe at densest `p0.85`: horizontal `ink_ratio=0.3574`, quiet `0.6426`; vertical `ink_ratio=0.4034`, quiet `0.5966`. Both exceed the 30% quiet floor. |
| Q10 focal point | PASS | Each beat makes the newest/top card the focal target. |
| Q11 edges | PASS | Rounded border, black field, and restrained shadow agree across every card. |
| Q12 effect discipline | PASS | No composition Effects. |
| Q13 layering | PASS | Shadows remain below cards; later cards occlude earlier cards correctly. |
| Q14 still-frame hold | PASS | Every sampled frame is composed; final six samples are a stable hold. |
| Q15 enter/exit continuity | PASS with rubric note | Entries continuously scale/fade over 260 ms. No disappearance is authored; the user explicitly requires the composition to end still. See rubric-gap finding. |
| Q16 shadows | PASS | Soft multi-zone CSS shadow has a smooth measured falloff. |
| Q17 contrast | PASS | Text uses X's slightly sub-white ink over true black rather than full-white glare. |
| Q18 type families | PASS | One system sans family. |

## G-rule and tweet-stack walk

- **G1:** PASS — native 4K horizontal/vertical, 30 fps.
- **G2:** PASS — readable content remains title-safe; only decorative card corners/shadows approach action-safe.
- **G3:** PASS — vertical readable content stays below top 6%, above bottom 16%, and left of the right-side 9% UI band. The final card footer/actions remain above y=3226.
- **G4:** PASS — horizontal found-document body font is ~56.8 px CSS with observed cap height in the 30–54 px band; vertical body is ~70.3 px with cap height in the 40–70 px band. Metadata scales proportionally into its 18–34 / 24–44 px bands.
- **G5:** PASS — near-white X ink on `#000` is comfortably above 4.5:1 and cards carry their own legibility plate over unknown footage.
- **G6:** PASS — each enter is exactly 260 ms, inside 250–400 ms. No exit is authored by explicit user direction.
- **G7:** PASS — the pipeline's deterministic cubic smooth-out supplies a sharp, decelerating placement. The Preset schema has no per-card ease field.
- **G8:** PASS — small alternating rotation plus scale settle supplies follow-through/secondary placement character without side travel.
- **G9:** PASS — poses and reveal depend only on global progress and card index.
- **G10:** PASS — no full-frame camera motion or flashing.
- **G11:** PASS — one Preset genuinely reflows: horizontal is a two-column reaction field; vertical is a Y-dominant pile with a fully readable top card.
- **G12:** PASS — transparent plain Surface is preserved; the gray seen in captures is the sanctioned neutral-footage proxy, not a painted composition background.
- **TS1:** PASS — eight unique arrival starts.
- **TS2:** PASS — each card lands in 260 ms and the complete pile holds completely still.
- **TS3:** PASS — eight cards; readable regions are safe in both orientations.
- **TS4:** PASS — post copy and avatars are baked locally; share URLs are metadata only.
- **TS5:** PASS for reading target — the fully landed top Dima card is readable in both orientations; explicit no-exit intent conflicts only with TS5's final phrase. See rubric gap.

## Syntax Pack aesthetic

The X card is found-document substrate and correctly keeps its own black platform physics under the Pack. There is no invented Syntax chrome, glossy gradient, glow, or ambient wash. The result is flat, decisive, and artifact-faithful. **No `aesthetic-miss` finding.**

## Findings

### [preset-choice] The description still promises a reverse exit that the requested composition no longer performs

- **Where:** `src/lib/presets/tweet-stack-reaction-flood.json`, top-level `description` (`"hold without drift, and reverse out"`).
- **Evidence:** `.tmp-baselines/tweet-stack-reaction-flood-v2-horizontal/p0.85.png` through `p1.00.png` and the matching vertical frames remain identical; there is correctly no reverse exit.
- **Suggested value:** Describe the still end hold instead of claiming the cards reverse out.

### [rubric-gap] TS5 assumes every tweet stack reverse-exits, but a deliberate edit-point hold is a valid requested ending

- **Where:** `docs/animation-rubric.md` TS5 and Q15's unconditional “in AND out” wording.
- **Suggested rule:** Add a carve-out for compositions explicitly authored to remain settled through the endpoint, provided there is a sufficient stable read hold and no pre-end pop/disappearance.

## Finding counts

- `pipeline-bug`: **0**
- `default-too-permissive`: **0**
- `preset-choice`: **1**
- `aesthetic-miss`: **0**
- `rubric-gap`: **1**

**Recommendation: REVISE** (metadata-only Preset revision; rendered implementation is accepted).
