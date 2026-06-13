# Hiviz Animation Rubric

This document is the rubric agents use when designing or reviewing a hiviz preset. Every preset shipped from `src/lib/presets/` must satisfy the **General Rules** unless the rule explicitly carves out an exception. Each **Overlay Rule** applies to the specific overlay type named in its heading.

Every rule has three parts:

- **Rule** — the measurable threshold or required behavior.
- **Why** — the production reason for the rule (legibility, broadcast safety, platform constraint, perceptual cue).
- **How to apply** — the preset-engine field(s) to set, or the pipeline behavior to verify.

Field paths refer to the `hiviz@1` preset schema in [`docs/preset-format.md`](preset-format.md). When a rule says "the engine clamps this," it means schema validation already enforces it and the agent does not need additional logic.

### Who enforces what (per [ADR-0025](adr/0025-static-linter-checks-safety-and-readability-only.md))

Two layers — do not re-merge them. See [`CONTEXT.md`](CONTEXT.md) → *Preset linter*.

- **Static linter (`lintPreset`, the build gate)** — objective, JSON-computable **video-safety + readability** only, hard errors: G2 / G3 (safe zones), G5 (contrast), G6 pre-mark *floor* and post-mark read-window, A1 (mark before surface settles), A3 (timing with no segment), L1 (lower-third Y-band), L4 *floor* (min hold to read), G10 (vestibular, warn). `lintPresetVisual` adds the render-measured readability checks (G4 cap-height floors, G4-density measure).
- **Critic (this doc, judged by eye)** — all motion *taste*: G6 enter/exit duration bands + exit:enter ratio, G7 ease semantics, A2 stagger, the G6 pre-mark *ceiling*, A3 mark-duration bands, L3 (centered reads as title card), L4 hold *ceiling*, G4 cap-height *ceilings* (signage), title:body ratio, T1 card mass. These are **not** gated — a preset is not rejected at build for them; the Critic flags them against the render.

---

## General Rules

These apply to every preset regardless of overlay type or surface.

### G1. Author at the final delivery resolution

- **Rule** — Horizontal presets render at 3840×2160 (UHD 4K, 16:9). Vertical presets render at 2160×3840 (UHD 4K, 9:16). Frame rate is 30 fps unless the preset explicitly opts into 60 fps for fast motion.
- **Why** — YouTube long-form is mastered at 16:9 and YouTube Shorts is mastered at 9:16 1080×1920 minimum, 2160×3840 ideal. Authoring at the delivery resolution avoids the soft, anti-aliased look that comes from upscaling 1080p overlays, and keeps every margin/font-size rule below expressed in pixels of the actual output frame.
- **How to apply** — `transport.orientation` selects the aspect, and the pipeline produces 4K output. Set `transport.fps` to 30 unless there is a stated motion-clarity reason to choose 60.

### G2. Respect the safe zones for the target aspect ratio

- **Rule** — Treat the inner 90% of the frame as the **title-safe** rectangle (5% margin all sides) and the inner 93% as the **action-safe** rectangle (3.5% margin). All readable text must sit inside title-safe. Decorative geometry may cross into action-safe but must not touch the frame edge. On 9:16 (Shorts/Reels/TikTok), the safe rectangle is further constrained by platform UI — see G3.
- **Why** — SMPTE ST 2046-1 defines action-safe at 93% and title-safe at 90% for 16:9 production. Even on modern flat-panel TVs and streaming, ~4% overscan still appears in some playback paths. Honoring the standard prevents clipped names, dates, and source URLs.
- **How to apply** — When placing an overlay via `overlays[].position.rect`, keep `x ≥ 0.05`, `y ≥ 0.05`, `x + width ≤ 0.95`, `y + height ≤ 0.95`. For `anchor` + `offset` placement, the minimum offset from any frame edge is 5% of the corresponding dimension (192 px at 3840 wide, 108 px at 2160 wide for 4K vertical).

### G3. Honor platform UI safe zones on vertical

- **Rule** — On `transport.orientation === 'vertical'`, no readable content (text, focal annotation, or callout) may sit in:
  - the top ~6% of the frame (notification/notch + creator handle area),
  - the bottom ~16% of the frame (channel info, music ticker, description),
  - the right ~9% of the frame (like/comment/share rail).
- **Why** — YouTube Shorts, TikTok, and Instagram Reels all overlay platform UI on the same regions. At 1080×1920 those bands are roughly 120 px (top), 300–400 px (bottom — bottom grows when description is expanded, so design for the expanded state), and 96–120 px (right). Anything important that lands under those bands is unreadable for the majority of viewers.
- **How to apply** — For `overlays[].position.anchor`:
  - `top-*` anchors need `offset.y ≥ 0.06 × frameHeight` (≈230 px at 4K vertical).
  - `bottom-*` anchors need `offset.y ≥ 0.16 × frameHeight` (≈615 px at 4K vertical).
  - `*-right` anchors need `offset.x ≥ 0.09 × frameWidth` (≈195 px at 4K vertical).
  - For `surface` content on vertical, the readable column must stay inside roughly `x: [0.05, 0.91]` and `y: [0.06, 0.84]` of the frame.

### G4. Cap-height floors — split by role × surface

The right size for a piece of text depends on **what job it does**, not on its tag name. The same `<p>` element is a different thing inside a lower-third (primary information delivery) versus inside a paper card (atmospheric context surrounding the focal mark). Apply the band that matches the role.

- **Rule** — At 4K, every rendered text element must hit its cap-height **band** for its role × surface combination. A band has both a minimum and a maximum — text far above the floor is also wrong (oversized body reads as signage, not paper).

  | Role × surface | Horizontal band (cap-height px) | Vertical band (cap-height px) |
  | --- | --- | --- |
  | **Overlay primary** (lower-third title, caption) | 96–144 | 120–180 |
  | **Overlay secondary** (lower-third subtitle, caption-2) | 80–112 | 96–136 |
  | **Surface title** (paper / plain card title slot) | **60–110** | 76–138 |
  | **Surface body** (paper / plain card body, marked or unmarked) | **32–56** | 44–72 |
  | **Surface label** (source / kicker / byline / date label, footer) | **24–48** | 32–60 |

Note on band sources: the **binding source** for surface titles and bodies is empirical — real research-paper / document footage on YouTube renders body at roughly **40–55 px cap-height at 4K** and title at roughly **80–110 px**. The published bands (32–56 body, 60–110 title) bracket those observations with a small headroom margin so presets aren't forced to hit the exact center. A second-pass sanity-check derivation from print typography (title ~14–17 pt, body ~9–11 pt × ~4 for 4K × ~0.7 viewing-distance scale) lands at ~25–31 px body / ~40–48 px title — close enough to confirm the empirical floor isn't arbitrary, but slightly *below* the empirical observation. When the two sources disagree the empirical observation wins because it matches the visual target the rule actually exists to enforce: cards that read as photographic documents, not as signage. Overlay text uses broadcast lower-third standards which are larger because the overlay IS the message. The earlier rubric mistake was applying broadcast-overlay floors to surface body — that produced cards that looked like signage, not paper.

Note on marked focal text: a highlighted/underlined/circled phrase inside surface body uses the *same* cap-height as surrounding body. Visual emphasis comes from the mark stroke, not larger type — a research paper does not enlarge the highlighted phrase, it draws a highlight stroke over it.

  Cap-height is computed at runtime as `fontSize × capHeightRatio(font)`, where `capHeightRatio` is the font's measured cap-height ratio (default 0.70 for sans/serif, 0.68 for condensed, 0.72 for mono). The linter reads cap-height directly off the rendered DOM via the visual audit harness — do not approximate from font-size alone.
- **Why** — Overlay text and surface body text are different jobs. An overlay caption IS the message; it must be large enough that the viewer can read it without effort. Surface body inside a paper card is **atmospheric context** — the viewer skims it, the highlighted phrase is what they actually read. Forcing 64 px body cap-height on a paper card produces ~3-word lines that sprawl four lines for a single sentence; the card stops looking like paper and starts looking like a typographic slide. Real research-paper/document footage on YouTube renders body at roughly 40–55 px cap-height at 4K, which gives 7–10 words per line — the typographic measure where dense bodies feel like documents. The upper bounds in each band exist for the same reason: a 100 px paper body would look like signage.
- **How to apply** — The surface pipeline sets font sizes proportional to the card's render width. The linter's runtime check measures the actual rendered cap-height at 4K and fails the preset if any text role falls outside its band. If a preset's content is too dense to fit at the required size, **shorten the content** before shrinking type below the band floor; if the body looks oversized inside the card, **tighten the body ratio** before reducing content.

### G4-density. Bodies must read as bodies

Cap-height is one dimension of legibility. The other two are **measure** (how many characters per line) and **leading** (line-height). When a body of text fails on those axes it reads as a slide, not a document — even with cap-height in band.

- **Rule** — For every paragraph block of body text (surface body and overlay body):

  | Property | Band |
  | --- | --- |
  | Characters per line (measure) | **45–80** |
  | Line-height — serif body | **1.28–1.42** |
  | Line-height — sans / condensed / mono body | **1.32–1.50** |
  | Lines per paragraph (rendered) | **1–8** (≥ 9 lines means the paragraph is doing too much) |
  | Title : body cap-height ratio (per surface) | **1.5–2.5** |

- **Why** — Bringhurst's *Elements of Typographic Style* lands the "ideal measure" at 45–75 characters; broadcast practice extends to ~80 before the eye loses its place. Serif body at line-height < 1.28 collides ascenders/descenders; > 1.42 disconnects lines into floating slabs. Sans needs slightly more leading for clarity. A body paragraph that wraps to nine or more rendered lines stops reading as a paragraph and reads as a list of fragments. Title-to-body ratio below 1.8 flattens the hierarchy (you can't tell what's primary); above 3.0 makes the title dominate so heavily it overshadows the focal content.
- **How to apply** — The visual audit harness measures, per paragraph: rendered `getBoundingClientRect()` dimensions, count of line-boxes (via `Range.getClientRects()` or computed `lineHeight`), computed `line-height`, and character count to derive characters-per-line. The title : body ratio is computed from the per-role cap-heights. Out-of-band values fail the preset.

### G5. Maintain 4.5:1 contrast against every frame the text covers

- **Rule** — The contrast ratio between text color and the local background (paper, surface, or transparent-over-footage) must be ≥ 4.5:1 for body text and ≥ 3:1 for large text (≥ 96 px / ≥ 60 px bold). For overlays sitting on transparent output (delivered as a key over footage), assume a worst-case mid-gray (#7f7f7f) background and verify against that.
- **Why** — WCAG 2.2 AA contrast thresholds (4.5:1 / 3:1) are the floor for legibility under normal viewing. Hiviz exports are transparent and will be composited over unknown footage, so we cannot rely on the surface color the agent picks. Verifying against a mid-gray neutral is the standard "worst case" check.
- **How to apply** — When choosing `typography.inkColor` against `typography.paperColor`, hit 4.5:1. For overlay text drawn directly on transparent (e.g. a future overlay variant with no chrome), require an additional legibility treatment (semi-transparent plate, drop shadow ≥ 4 px blur at 60% opacity, or a stroke ≥ 2 px) — single-color text on transparent is rejected.

### G6. Animation duration baseline

- **Rule** — Default durations for any single tween:
  - **Enter** — 250–400 ms (`duration` of 0.05–0.08 on a 5 s preset, 0.04–0.06 on an 8 s preset).
  - **Exit** — 180–280 ms, always 20–30% shorter than the matching enter.
  - **Mark / emphasis — scales with the marked content.** A marker stroke is a physical gesture: a 1-word highlight is fast; an 18-word highlight is a long pull. The band is `[max(250, words × 60), max(500, words × 90)]` ms for **decorative** marks (highlight, underline, strike, circle, box, side-note) and `[max(450, words × 60), max(800, words × 110)]` ms for **focal** marks (magnify, lift-out, tear-out, isolate, callout). Words is the marked segment's word count. Both bands cap at 1500 ms.

    | Marked words | Decorative band (ms) | Focal band (ms) |
    | --- | --- | --- |
    | 1 | 250–500 | 450–800 |
    | 5 | 300–500 | 450–800 |
    | 10 | 600–900 | 600–1100 |
    | 18 | 1080–1500 | 1080–1500 |
    | 25 | 1500–1500 | 1500–1500 |

  - **Hold-on-screen — split into pre-mark and post-mark windows, per mark.**
    - **Pre-mark window (establishment) — title is a glance, not a read.** Between `surface.enter.end` and the **first** mark's `start`, the viewer needs ~**0.7–1.2 s** flat to register the title and locate the focal area. Titles, kickers, and bylines are *glanceable* — they take in as visual shapes, not as words read sub-vocally at 200 wpm. The 200 wpm reading model applies to **body content the viewer is expected to read line-by-line**, not to short top-of-card identifiers. If the surface also has body text the viewer is expected to scan before the mark, add that body's read time on top.
    - **Post-mark window (absorption), per mark** — between the mark's `end` and the next event that disrupts it (next mark start, or `surface.exit.start`), the viewer must be able to read the marked segment **1.5×** at 200 wpm. Required seconds = `markedWords × 60 / 200 × 1.5`. This is the editorial moment: the viewer needs time to absorb the focal phrase with its emphasis.
    - For overlay-only content (captions, lower-thirds with no marks), the overlay's screen-time must satisfy 2× reading of the overlay's content. The 2× rule is preserved for caption/lower-third hierarchy only.
- **Why** — UI animation research (NN/g, Material Design, Val Head) converges on 250–500 ms as the band where small UI motion feels intentional but not sluggish. Marker strokes are a different category — they're a continuous physical gesture across measurable distance, and their natural duration scales with stroke length. 60–110 ms per word maps to ~3–4 words per second of stroke, which is roughly how a person physically marks paper. The asymmetric enter/exit (longer in, shorter out) reflects that the brain accepts arrival but resents lingering. The 1.5× post-mark rule replaces the broadcast 2× rule because the marked phrase has already been seen during the establish phase — the post-mark window is for re-reading with the emphasis, not first-pass comprehension. Captions still get 2× because each new caption is unfamiliar content.
- **How to apply** — All `start`/`duration` fields in `surface.enter`/`exit`, `overlays[].enter`/`exit`, and `marks.timings[i]` are normalized 0..1 of `transport.durationSeconds`. Convert: `durationSecondsForTween = normalizedDuration × transport.durationSeconds`. Pick the normalized values so the absolute milliseconds land in the bands above. When a preset can't satisfy the post-mark window, **shorten the marked phrase** — don't shrink the type and don't shorten the mark stroke.
- **Relationship to [Q15](quality-rubric.md#q15-effects-animate-in-and-out--never-pop)** — G6's absolute ms bands are the no-pop perceptual floor Q15 references. On presets long enough that 10% of an element's on-screen time exceeds G6's ms ceiling, G6 binds (a 7 s on-screen surface still gets a 180–280 ms exit, not a 700 ms one). On short presets where 10% of element lifetime lands inside G6's band, both rules agree by construction.

### G7. Ease semantics — pick the curve for the job

- **Rule** — Use the hiviz `Ease` vocabulary deliberately. The mapping is fixed in `engine-schema.ts`:

  | Ease | GSAP curve | Use for |
  | --- | --- | --- |
  | `smooth` | `power3.out` | Default. Most exits. Marks that should settle without theatrics. |
  | `settled` | `back.out(1.2)` | Surface/overlay entries. A small overshoot reads as "placed with intent." Do not use on exits. |
  | `sharp` | `expo.out` | Snap-in callouts, beat-synced emphasis marks, anything that needs to feel cut, not slid. |
  | `bouncy` | `elastic.out(1, 0.5)` | Playful flourishes only. Strikes, circles where a wobble adds personality. Never on body text or lower-third typography. |

- **Why** — Ease is the largest single carrier of "personality" in motion. `power3.out` is the broadcast-safe default because it decelerates without flair. `back.out` is the YouTube/explainer house style for cards landing — the overshoot is what makes a lower-third look "designed" rather than "faded in." `expo.out` is what makes emphasis feel like a beat hit. `elastic` is loud and earns its place only when the content is itself playful.
- **How to apply** — Set `ease` on every timing block. Do not leave it to the engine default unless the default is the right choice. When in doubt: `enter: 'settled'`, `exit: 'smooth'`, `mark: 'smooth'` for editorial content, `mark: 'sharp'` for explainer/news content.

### G8. Apply the relevant principles of animation

The 12 Disney principles all apply, but five carry the weight for motion graphics overlays:

- **G8a. Anticipation** — Before a large motion, allow a tiny counter-motion or pre-pose (e.g. a lower-third dips down 4–8 px before flying up). Encoded as a brief lead-in tween on the same property, ≤ 80 ms.
- **G8b. Follow-through** — After the main move ends, allow the easing to overshoot and settle (`settled`/`bouncy`) or let secondary elements (subtitle line, source URL) arrive 60–120 ms after the primary headline. Encoded by staggering `start` values across overlay tweens.
- **G8c. Arcs** — Movement along straight lines reads as mechanical. When sliding a card in from off-frame, prefer a path that curves slightly (X distance > 0 with a small Y component) over pure axis-aligned slides. For shaders/transforms, this means combining translate + a small rotate or translate-X with a translate-Y bias.
- **G8d. Secondary action** — A primary mark (e.g. a circle) gets a secondary action (the line weight thickening over the last 80 ms; a faint pen-pull-back). Secondary action must end before the primary tween ends — it supports the moment, it does not extend it.
- **G8e. Slow-in/slow-out (ease)** — Linear motion is forbidden. Every tween uses one of the four named eases. Linear is only acceptable for continuous deterministic motion (a scrolling ticker on a background paper, where ease would visibly speed up and slow down).
- **Why** — These five are what separates a "fade in / fade out" overlay from one that reads as designed. Skipping arcs and follow-through is the single most common failure mode of AI-generated motion presets.
- **How to apply** — When composing a preset, an agent should be able to point to which tween realizes each of arc, anticipation, follow-through, and secondary action. If a preset has none of those, it is unfinished.

### G9. Frame-addressable and deterministic

- **Rule** — Every animated value must be derivable from the timeline `progress` (`0..1`) alone. No `Math.random()` at render time, no `Date.now()`, no `performance.now()` reads inside `pipeline.render({...})`. Randomness for paper grain, jitter, hand-drawn wobble, etc. is allowed only if seeded from `progress` (or a stable per-mark index).
- **Why** — Hiviz preview and export call the same `renderAt(timestamp)`. If a preset's appearance depends on wall-clock state, the exported video drifts from preview and exports re-run on the same input produce different files. The whole timeline architecture in `src/lib/platform/timeline.svelte.ts` exists to guarantee this.
- **How to apply** — Pipelines must read all randomness from a seeded source. Presets must not contain fields that imply non-deterministic motion. If a preset asks for "natural variation," it gets it via per-mark seed + frame index, not real randomness.

### G10. Respect reduced motion when delivered to the browser; honor motion safety at all times

- **Rule** — Even though hiviz output is a baked video and the viewer's browser cannot apply `prefers-reduced-motion` to it, two motion-safety constraints still apply at authoring time:
  - **No full-frame zoom/pan exceeding 25%** in less than 600 ms. Large fast translations of the whole composition are the dominant vestibular trigger.
  - **No flashing.** Avoid alternating fills/strokes faster than 3 Hz on regions ≥ 25% of the frame. WCAG 2.3.1 (three-flash threshold) is the broadcast floor.
- **Why** — Over a third of adults have experienced vestibular symptoms. The same gestures (whip pans, fast zooms, strobing color shifts) that trigger discomfort on the web trigger it on video as well. A preset shipped from hiviz will end up on a 50" TV or a phone in someone's hand — design for both.
- **How to apply** — When a tool exposes camera moves (`surface.camera`: `'push' | 'snap' | 'none'`), `push` is allowed within these limits; `snap` must be ≤ 200 ms. Reject preset choices that combine `snap` with a high `backgroundVisibility` change in the same beat — the brain reads that as two simultaneous large motions.

### G11. Vertical vs horizontal — change the staging, not just the aspect

- **Rule** — A vertical preset is not a horizontal preset with `orientation: 'vertical'`. The differences are mandatory:
  - **Motion direction prefers Y over X.** Cards/lower thirds enter from the bottom edge or the top edge, not the side. Horizontal slides on 9:16 read as "edge twitches."
  - **One readable column.** No multi-column layouts. The single column lives between roughly `x ∈ [0.06, 0.94]` of the frame.
  - **Larger type, fewer words.** Apply the higher minimums from G4 and trim copy by ~30% versus the horizontal version.
  - **Subject lives in the middle 60% vertically.** Top and bottom bands belong to platform UI (G3); important focal annotations (magnify, lift-out, callout) must center inside `y ∈ [0.20, 0.80]`.
  - **Faster pacing.** Vertical content is consumed in shorter sessions; preset `transport.durationSeconds` should default to 4–7 s, vs. 6–12 s for horizontal long-form.
- **Why** — TikTok/Reels/Shorts engagement data shows native vertical outperforms cropped-horizontal at >90%. The platform-specific staging — center-weighted, Y-motion, short — is what "native vertical" actually means. Reusing horizontal staging on 9:16 produces the cropped-look the algorithm down-ranks.
- **How to apply** — Today a horizontal preset and its vertical sibling are authored as separate JSON files (e.g. `quote-magnify` ↔ `quote-vertical`); don't toggle `orientation` and assume the same composition holds. (Genuine single-Preset reflow is roadmapped — see [`roadmap.md`](roadmap.md).)

### G12. Transparent output is the contract

- **Rule** — No preset may paint an opaque full-frame background unless the surface explicitly requires it (`surface.type === 'paper'` renders its own card chrome; everything else stays clear). Decorative full-frame tints, vignettes, or gradient washes are rejected unless the preset's stated purpose is a "fill" overlay.
- **Why** — Hiviz exists to produce keyable overlays for Resolve/Premiere/Final Cut. An opaque background defeats the entire delivery format. Preserving alpha is the project's hardest constraint.
- **How to apply** — Frame-level `effects.frame` entries must not stack to alpha = 1 across the full frame. WebGPU render passes use `clearValue: [0, 0, 0, 0]` and the canvas context uses `alphaMode: 'premultiplied'` — keep it that way.

---

## Per-Overlay Rules

### Lower Thirds

A lower third is a name/source/identity tag pinned to the lower portion of the frame. The `lower-third` overlay type in the engine carries `{ kicker, title, subtitle? }`.

- **L1. Vertical band: bottom 18–28% of frame on horizontal; bottom 22–34% on vertical (above the platform UI band from G3).**
  - **Why** — The conventional "lower third" is literally the lower third of the frame, but modern broadcasting compresses to roughly 20% of frame height because faces and B-roll subjects sit lower in widescreen framing. On vertical, the band shifts up because the bottom 16% is platform UI.
  - **How to apply** — For 4K horizontal (2160 tall): top of the lower-third lives at `y ≈ 0.62–0.72` (≈1340–1555 px from top), height ≈ 0.10–0.18 of frame. For 4K vertical (3840 tall): top at `y ≈ 0.62–0.74` (≈2380–2840 px), height ≈ 0.10–0.16, and the entire block must clear the 0.84 line.

- **L2. Horizontal extent: ≤ 60% of frame width on horizontal, ≤ 90% on vertical.**
  - **Why** — On 16:9, a lower third spanning more than 60% competes with the subject and looks like a chyron banner. On 9:16, the frame is narrower so the same readable block is a larger fraction of width — letting it run to 90% is fine and necessary for type size.
  - **How to apply** — Constrain `overlays[].position.rect.width` accordingly, or for `anchor + offset` positioning, set right-edge padding to match.

- **L3. Anchor to a corner, not centered.**
  - **Why** — Centered lower-thirds read as title cards. Corner-anchored (`bottom-left` for English, `bottom-right` for cultures where that suits) is the broadcast convention because it leaves the opposite corner free for logos/bugs and balances the composition.
  - **How to apply** — `overlays[].position.anchor: 'bottom-left'` by default; override only with intent.

- **L4. On-screen time: 4–6 seconds for typical "Name / Title / Affiliation"; up to 8 seconds if the subtitle line is dense.**
  - **Why** — Industry convention. Under 3 s and the viewer hasn't finished reading; over 8 s and it overstays. The 4–6 s band is what news, podcast clips, and explainer YouTube channels converge on. For longer copy, the 2× reading-rule (G6) governs.
  - **How to apply** — `screenTime = transport.durationSeconds × (overlay.exit.start − (overlay.enter.start + overlay.enter.duration))`. Pick `enter.start` and `exit.start` to land in that window.

- **L5. Enter from below; exit by sliding or fading down/out, not up.**
  - **Why** — A lower third entering from the top reads as a notification, not a name plate. Slide-up entry + slide-down (or scale-down + fade) exit is the convention. On vertical, "below" can also be from the side opposite the action rail.
  - **How to apply** — The engine handles transform via the pipeline. Pick `enter.ease: 'settled'` (back overshoot reads "placed") and `exit.ease: 'smooth'` (decelerate out, no overshoot).

- **L6. Hierarchy: kicker (smallest, all-caps), title (largest, weight 600–800), subtitle (mid, weight 400–500).**
  - **Why** — A three-line stack with one weight reads as a paragraph. Differentiated weights and casing make the name pop and the affiliation recede.
  - **How to apply** — `typography.fontFamily: 'condensed'` or `'sans'` is preferred over `'serif'` for the lower-third stack at video viewing distance. `kicker` cap-height ≈ 50% of title cap-height; `subtitle` cap-height ≈ 60% of title.

- **L7. Maximum two lines of subtitle.**
  - **Why** — Beyond two lines, the lower-third becomes a card and should be re-classified as a Title Card (see below). Three-line subtitles also fail the 2× reading-rule at 4 s screen time.
  - **How to apply** — Reject preset content that wraps `subtitle` to a third line at the chosen type size.

### Title Cards & Chapter Markers

A full-frame or near-full-frame card introducing the video, a section, or a chapter. Hiviz currently models this via `surface.type: 'paper'` with a `title` slot; future overlay variants may add a dedicated `title-card` type.

- **T1. Card visual mass — presence first, area second, with bleed allowed.**

  A card must feel like a real document on a desk, not a postage stamp floating in space. Two presence checks, then an area sanity check.

  - **Presence: longer-dim occupancy.** The card's *longer dimension* (height for portrait, width for landscape, either for near-square) must occupy at least:
    - **Horizontal frame (paper surface): ≥ 0.85** of the matching frame dimension.
    - **Horizontal frame (other surface types): ≥ 0.70**.
    - **Vertical frame: ≥ 0.85**.

  - **Bleed permitted.** A portrait card on a horizontal frame *may extend past the bottom of the frame* — the bleed is the visual rhyme that says "this is a real sheet of paper, you're looking at the top of it." The constraints when bleeding:
    - The card's top edge must sit at `y ≤ frameHeight × 0.05` (top of frame, with a small breathing margin).
    - All *readable text* must remain inside the title-safe rectangle (G2). The bleed area must contain no readable text — only paper chrome.
    - The bleed length must be **≤ 30%** of the card's height. Beyond that the card stops feeling like a document and starts feeling like a backdrop.
    - The longer-dim occupancy check is computed against the **visible** card rect (clipped to frame), not the laid-out rect — so bleed counts as 100% occupancy on that axis.

  - **Area band by orientation × card aspect (sanity check, applied after presence):**

    | Orientation | Card aspect (W:H) | Visible-area band (% of frame) |
    | --- | --- | --- |
    | Horizontal 16:9 | Near-square (0.8–1.2) | 40–70 |
    | Horizontal 16:9 | Portrait (≤ 0.8, e.g. A4 = 0.707) | 38–60 |
    | Horizontal 16:9 | Landscape (≥ 1.2) | 45–75 |
    | Vertical 9:16 | Portrait (≤ 0.8) | 50–80 |
    | Vertical 9:16 | Near-square / landscape | 35–60 |

  - **Why** — The earlier version (0.70 occupancy, A4 portrait at 26–45%) was a mathematical compromise that produced renders looking like notes pinned in space. Real document-on-camera footage either (a) fills the frame substantially (the wider end of the area band, often via bleed) or (b) is centered between focal elements where its full presence reads. The bleed allowance lets A4 papers feel anchored to the bottom of frame — a recognizable "paper on desk" composition — while preserving title-safe for the readable content. 0.85 horizontal occupancy on paper translates to a card that fills the frame vertically with the bleed convention, which is what 4K research-paper/document overlay footage looks like in published video work.

  - **How to apply** — In the pipeline: compute the laid-out card rect, then the *visible* rect by intersecting with the frame. Visible width × visible height drives area; visible longer-dim drives occupancy. If `cardRect.bottom > frame.height`, the bleed length is `cardRect.bottom - frame.height` and the card layout must guarantee no readable text in `y ∈ [frame.height, cardRect.bottom]`. The pipeline's existing card-layout code (`src/lib/pipelines/surfaces/paper/CanvasSource.svelte`) is the place to introduce the bleed mode.

- **T2. Headline: 5–9 words; subheadline (if present): 8–14 words.**
  - **Why** — Cap-height of a title card is large enough that >9 words wrap awkwardly, and the viewer's eye treats a card as a single read, not a paragraph.
  - **How to apply** — Author content with these limits. Long source/citation lines belong in the `source` or `dateLabel` slots, not the headline.

- **T3. Enter 300–500 ms; hold 1.5–4 s; exit 250–400 ms.**
  - **Why** — A title card carries more visual mass than a lower third, so its motion can take slightly longer. But hold ≥ 4 s on a 6 s short reads as a still frame.
  - **How to apply** — On a 5 s vertical preset: `enter.duration ≈ 0.07`, hold ≈ 0.55, `exit.start ≈ 0.85`, `exit.duration ≈ 0.07`.

- **T4. Use `camera: 'push'` for editorial / cinematic, `'snap'` for explainer / news, `'none'` for typographic / pull-quote.** *(Note: `surface.camera` is not yet wired to the render path — see [`roadmap.md`](roadmap.md).)*
  - **Why** — Camera moves change the read. A slow `push` says "consider this"; `snap` says "here's the data"; `none` says "the words are the show." Pick per the content's voice.
  - **How to apply** — `surface.camera` field.

### Callouts & Annotations

These are the mark layer: highlight, underline, strike, circle, box, side-note (decorative) and magnify, lift-out, tear-out, isolate, callout (focal). They sit on body text.

- **A1. Marks must arrive after the underlying text is fully on-screen.**
  - **Why** — A mark animating onto text that is still flying in fights for attention and produces two competing readings. The mark should feel like a deliberate gesture on a placed page.
  - **How to apply** — For each `marks.timings[i].start`, ensure `start > surface.enter.start + surface.enter.duration + 0.02` (a small buffer). Mark `start` typically lands at 0.18–0.50.

- **A2. One emphasis at a time; stagger ≥ 120 ms between marks.**
  - **Why** — Simultaneous emphasis flattens the hierarchy. The eye can track one new mark per ~200 ms; staggering by ≥ 120 ms preserves the sense that someone is annotating in real time.
  - **How to apply** — Sort `marks.timings` by `start` and ensure consecutive `start` values differ by ≥ 0.04 on a 3 s preset, ≥ 0.025 on a 5 s preset, ≥ 0.015 on an 8 s preset.

- **A3. Decorative marks: 250–500 ms; focal marks: 450–800 ms.**
  - **Why** — A highlight is a stroke of a marker — fast. A magnify/lift-out reorganizes the page — needs longer to be readable. These durations match the perceptual weight of each operation.
  - **How to apply** — `marks.timings[i].duration` normalized to those millisecond bands per G6.

- **A4. Color choice: highlight/underline/strike colors come from a 3-color palette per preset; never per-mark random.**
  - **Why** — Mark color is one of the loudest signals in the frame. Random per-mark color reads as noise. Three colors max (a warm highlight, a cool underline, a contrast strike) holds the composition together.
  - **How to apply** — `marks.defaults[style]` sets the palette; only override `marks.timings[i].color` when the third color is needed for a single critical mark (see `research-paper-critique.json` for the canonical example).

- **A5. Focal marks (magnify, lift-out, tear-out, isolate, callout) must dim the surrounding context.**
  - **Why** — The whole point of "focal" is suppression of everything else. A magnify that doesn't dim the rest of the page is just a zoom.
  - **How to apply** — Pipelines for focal marks lower `surface.backgroundVisibility` for the mark's duration, or use the composition shader's suppression term. Verify in the rendered preset.

### Pop-ups & B-roll Overlays

Image-with-caption pop-ins, source citations, stat reveals, side-of-frame info cards. Hiviz does not yet have a dedicated `pop-up` overlay type — these rules govern future variants and any current preset that approximates them with `lower-third` + `surface`.

- **P1. Anchor to an edge or corner, never centered.**
  - **Why** — A centered pop-up blocks the underlying footage. Edge-anchored leaves a usable 60%+ of the frame for the host's footage.
  - **How to apply** — Use `top-right` / `bottom-right` (or left mirrors). For vertical, prefer `top-*` since `bottom-*` is encumbered by platform UI.

- **P2. Width ≤ 35% of frame on horizontal, ≤ 70% on vertical.**
  - **Why** — Same logic as L2 — the pop-up must coexist with the host's footage, not replace it.

- **P3. On-screen time tied to spoken duration. 2–5 s for a stat or quote, up to 7 s for a citation with reader-required precision.**
  - **Why** — Pop-ups support a voiceover beat. If the host moves on, the overlay should be gone before the next beat lands.
  - **How to apply** — Apply the 2× reading rule (G6) as the floor and the spoken-beat duration as the ceiling.

- **P4. Enter with `settled`, exit with `smooth`. No bouncy on pop-ups.**
  - **Why** — Pop-ups carry information (a number, a citation, an image). `bouncy` distracts from that information. `settled` says "here it is"; `smooth` says "and now we move on."

### Captions & Subtitles

Spoken-word captions for the host audio. Not yet a first-class overlay type — these rules govern the open-captions case that future tools will produce.

- **C1. Single line preferred; two lines maximum.**
  - **Why** — Broadcast caption standards (BBC, Netflix) cap at two lines. Three-line captions block too much of the frame and exceed reading-speed bandwidth.

- **C2. ≤ 42 characters per line.**
  - **Why** — Professional broadcast standard; longer lines force the eye to track horizontally and lose place.

- **C3. Each caption stays on screen for the spoken duration of the words, but never less than 1 s and never more than 7 s.**
  - **Why** — Reading speed is ~180 wpm; sub-1 s captions can't be read; >7 s captions outlast the spoken phrase and confuse the viewer.

- **C4. Sans-serif typeface, weight ≥ 600, with a 4–6 px stroke or 60% opacity plate behind the text.**
  - **Why** — Captions sit on unknown footage. The stroke/plate is what makes them legible against bright or busy backgrounds (G5). Sans-serif and heavy weight survive the small letter sizes that captions land at.

- **C5. Position: centered horizontally, bottom 15–25% of frame on horizontal; on vertical, bottom 22–34% (above the platform UI band).**
  - **Why** — Caption convention is bottom-centered. Vertical raises the band for the same platform-UI reason as L1.

---

## Authoring Checklist

When an agent finishes a preset, the agent must verify the following before considering the preset shipped. This list is the literal pass/fail rubric.

1. **G1** — Orientation set; fps is 30 unless justified.
2. **G2** — All readable content inside the 90% title-safe rectangle, measured at the 4K render size by the visual audit harness.
3. **G3** — On vertical, no readable content in the top 6%, bottom 16%, or right 9%.
4. **G4** — Every rendered text role hits its cap-height floor for the orientation (body / title / caption / kicker per the G4 table), measured at 4K by the visual audit harness.
5. **G5** — Text/background contrast ≥ 4.5:1 (3:1 for large text); transparent-target overlays carry a legibility treatment.
6. **G6** — Every `enter`/`exit` ms lands in band; `enter` > `exit` by 20–30%. Every mark `duration` lands in the scaled decorative/focal band for its segment word count. The pre-mark window satisfies 1× read of the establish content; every post-mark window satisfies 1.5× read of its marked segment (captions / lower-thirds with no marks use the 2× rule on their own screen-time).
7. **G7** — Every timing block has an explicit `ease`. The chosen ease matches the job per the table in G7. `settled` never appears on an exit.
8. **G8** — At least one of arc, anticipation, follow-through, or secondary action is present and identifiable in the pipeline-rendered animation (verified by inspecting the pipeline source, not the JSON).
9. **G9** — No timing field implies non-deterministic motion.
10. **G10** — No camera move or color flip exceeds the vestibular/flash floors.
11. **G11** — If the preset has a vertical sibling, the staging is genuinely rethought (motion direction, copy length, type size), not just a re-orientation toggle.
12. **G12** — Transparent output preserved end-to-end.
13. **Per-overlay rules (L1–L7, T1–T4, A1–A5, P1–P4, C1–C5)** — every overlay in the preset satisfies the rules for its type. T1 uses the aspect-aware area band table from T1.

A preset that fails any of the above is not done. There is no "good enough" tier below this rubric — those failures are what make AI-generated overlays look AI-generated.

## Verification

Two tools enforce this checklist:

- **`scripts/verify-presets.ts`** — static linter. Runs against each preset JSON. Catches every rule whose data is in the preset itself (G1, G5, G6, G7, G10, A1, A2, A3, L1, L3, T2, T4, C2 etc.) plus G3 overlay anchor checks. Errors fail the script.
- **`scripts/audit-presets-visual.ts`** — runtime audit harness. Drives `/p/<slug>` in Chrome with the `chrome-devtools` MCP, measures the source DOM at 4K-equivalent dimensions, and checks the pixel-level rules (G2 placement, G4 cap-heights, T1 card mass). Errors fail the script.

A preset is **not shippable** until both scripts report clean. The static linter alone is necessary but not sufficient — pixel-level rules require the visual harness.
