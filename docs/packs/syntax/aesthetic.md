# Supers Aesthetic

The channel-specific look that the rubrics (`animation-rubric.md`, `quality-rubric.md`) deliberately don't carry. The rubrics judge whether a preset is *well-made*; this doc says **which well-made the channel wants**.

Where each question lives:

- *Is this preset well-rendered?* → `quality-rubric.md` (R-rules).
- *Is this preset well-composed?* → `quality-rubric.md` (Q-rules).
- *Is this preset well-paced?* → `animation-rubric.md`.
- *Does this preset look like the channel?* → this doc.

**Source vs. binding.** The palette and type system are seeded from the Syntax.fm website brand vars (`syntaxfm/website` → `src/styles/variables.css`). They are **suggestions, not hard rules** — surfaces are allowed to deviate when the content needs it. The channel's binding constraints live in the **Collage System** section; that's the layer that distinguishes the look.

---

## Channel Voice

Supers overlays exist for a coding-focused YouTube channel (Syntax) running a **torn-paper zine collage aesthetic on photographic substrate**. The voice is:

- **Opinionated and direct.** No hedged copy, no "in this video we'll explore" — the overlay states the point.
- **Bright, saturated, graphic.** Not muted, not pastel, not minimalist white-space-heavy.
- **Hand-assembled.** Torn edges, tape, marker, registration off-set. The overlay reads as something somebody made on a desk, not something a template generated.
- **Mono signature thread.** Every composition carries at least one element set in mono (kicker, source URL, date stamp, watermark). Mono is the channel's identity stamp.
- **High contrast between substrate and collage.** The substrate (photo, newspaper, web doc) reads as a found document; the collage layer reads as the channel's interpretation of it.

---

## Palette

Seeded from Syntax brand vars. Five saturated brand hues plus neutrals. The channel uses **yellow as the dominant primary**; the second and third hues are picked from {teal, green, red, purple} per content.

| Role | Suggested value | Use for |
| --- | --- | --- |
| Yellow primary | `#fabf47` | Highlighter, focal accent, atmospheric halo (low alpha), kicker chips |
| Teal | `#00fff5` | Underline marks, accent borders, "now/active" cue |
| Green | `#beff00` | Positive marks (check, agreed, included), success accents |
| Red | `#ff474e` | Strike marks, negative emphasis, error / disagreement |
| Purple | `#362d59` | Deep accent, dark substrate plate, atmospheric tint |
| Black | `#000` | Ink (body on light substrate) |
| White | `#fff` | Paper (light substrate) |
| Gray | `oklch(50% 0.02 270deg)` | Dimmed body ink (dim-rest reveal, faded tails) |

**Per-role usage**:

- **Substrate fill** (photo / paper / web): the substrate's own texture; no flat color fills.
- **Body ink**: black on light substrate, white on dark substrate, sub-maximum contrast per Q17.
- **Focal ink** (active word / focal phrase): full-strength foreground.
- **Dimmed ink** (surrounding context during focal-dim-others; faded unread / past tails): 35–40% ink against substrate.
- **Highlighter band over text**: `#fabf47` ~0.7 alpha multiply.
- **Underline / circle mark**: `#00fff5`.
- **Strike / negative mark**: `#ff474e`.
- **Atmospheric halo behind focal text on dim substrate**: `#fabf47` ~0.15 alpha, soft gaussian falloff.
- **Channel chip / kicker plate**: `#fabf47` or `#ff474e` background, white ink, mono caps.

**Saturated-hue cap**: Q4 still binds — ≤ 3 saturated hues visible at once. Yellow is one slot; the others come from the remaining palette based on content.

**Never used in this channel**:

- Pastel desaturated versions of the brand colors (mutes identity).
- Pure RGB primaries (`#ff0000`, `#0000ff`, `#ffff00`) — also a Q5 anti-pattern.
- Apple-keynote-style muted blue/gray gradients.

**Deviation rule**: a preset may reach outside this palette when the underlying surface needs it (a found newspaper clipping carries its own ink color; a real photographic substrate carries its own ambient). The collage layer chrome stays in palette regardless.

---

## Type System

Seeded from Syntax brand: **mono is the channel's signature thread**, present as labels in every composition. Surface body and display text are *surface-specific*.

**Channel mono** (signature thread):

- Suggested: Operator Mono. Fallback chain: JetBrains Mono Variable, IBM Plex Mono.
- Weight range 400–700; italic available.
- Used for: kicker chips, source URLs, date stamps, channel watermark, file-path labels, code annotations, newspaper dateline.

**Surface display & body**: chosen per surface to fit the substrate's claim — newspaper headline gets a heavy slab/serif, pullquote-on-photo gets a serif, modern web article gets a sans, etc. See each surface entry below.

**Annotation handwriting** (for hand-written-claiming marks — margin notes, scribbles): a variable hand-script font (Caveat, Patrick Hand) or a custom hand path with Q6 deterministic imperfection.

Q18 caps families at 2 per composition: that's the channel mono plus the surface's body/display. A third family belongs only when the composition explicitly mixes two surfaces (e.g. a newspaper clipping torn onto a pullquote-on-photo, each carrying its own type).

---

## Surface Vocabulary

The materials the channel claims. Each surface has a substrate, a physics list it must produce, and the channel chrome layered on it. Cross-reference with the **Material Physics Reference** appendix (to be added to `quality-rubric.md`).

### Pullquote-on-photo

Reference: `docs/inspo/pullquote/quote.png`, `letter-by-letter.png`.

- **Substrate**: photographic image, vignetted 40–60% at edges for text contrast.
- **Body type**: serif (Charter, EB Garamond, Times). White or off-white, sub-maximum contrast.
- **Focal reveal**: brightness reveal over pre-laid-out passage. Past tail at full ink, active word at full + warm halo, future tail at 35–40% ink.
- **Atmospheric halo**: yellow at ~0.15 alpha, soft gaussian, centered on active focal word.
- **Attribution**: bottom-right, mono small caps, ≤ 4 words.

### Newspaper clipping

Reference: `docs/inspo/newspaper/body.png`, `heading.png`.

- **Substrate**: aged off-white paper (warm white, ~`#f0e8d6`), with paper grain (multi-scale noise), halftone dot at body sizes, ink bleed at glyph edges.
- **Slight camera angle**: 1–3° rotation; slight perspective skew acceptable.
- **Registration jitter**: ink offset 1–3px on saturated marks (yellow highlighter, red strike).
- **Body type**: condensed serif (Old Standard, Times), justified, narrow columns (~28–36 chars per column).
- **Display type**: heavy slab or bold serif (Playfair Display, Roboto Slab, Old Standard Black).
- **Mark**: yellow highlighter with hand-tool physics — wobbly long edges, streak texture along stroke, occasional overshoot past word boundary.
- **Chrome** (mono): section name in caps, dateline, byline.

### Modern web article

Reference: `docs/inspo/website/headline.png`.

- **Substrate**: clean off-white card (`#fdfdfd`) with subtle multi-zone shadow per Q16.
- **Body type**: sans (Inter, system-sans).
- **Display type**: heavy sans (Inter 800, system-bold).
- **Required chrome** (without these, the surface reads as Figma mock):
  - Red section chip (e.g. `POLITICS`).
  - "EXCLUSIVE" or category label.
  - Byline with author name.
  - Published timestamp.
  - Comments-count chip (rounded pill with icon).
  - Embedded video block beneath headline when applicable.
- **Channel layer**: torn from this surface into a collage card with hard offset shadow.

### Photographed frame

Reference: `docs/inspo/website/perspective.png`.

- **Substrate**: photo of a screen / page / surface, perspective-warped.
- **Real lens DoF**: focal element sharp, surrounding elements blurred by real depth-of-field. This is the *only* surface context where DoF is allowed — flat compositions still reject it per the quality-rubric anti-pattern.
- **Grain layer**: low-density camera grain over the whole frame.
- **Camera angle**: 5–15° off-axis rotation.

### Collage card (the channel layer)

The distinguishing layer. Cards torn from any of the above surfaces are layered into the composition with channel chrome. See **Collage System** below.

---

## Collage System

This is the channel's distinguishing layer and the rubrics deliberately can't carry it. **Torn paper, layered on photographic substrate, with hard offset shadows and mono labels.**

### Cut behavior

- **Tear, don't crop.** Cards always have torn edges, never axis-perfect rectangular cuts.
- **Tear path**: irregular jitter ~3–8% of the card's smaller dimension. Deterministic per Q6 / G9 (seeded, not random at render time).
- **Fiber edge**: torn edge carries a 1–2px white interior fiber visible against the substrate.
- **No rounded corners on torn cards.** Rounded corners belong to a different material claim (a manufactured chip, a button).

### Layering

- **Substrate behind**: the substrate (photo, paper, web doc) is visible *behind* the torn edge — the tear reveals the substrate, not a uniform dark fill.
- **Z-order** (bottom → top): substrate → photographic shadow (Q16 multi-zone) → card body → card-layer hard offset shadow → marks → chrome labels → tape → grit overlay.

### Shadow — two kinds, never on the same element

- **Hard offset shadow** on collage cards. Reference: Syntax `--s-graphic: -4px 4px 0 var(--c-fg)`. Offset 8–15 px at 4K, **no blur**, in foreground color. Reads as risograph / screen-print offset.
- **Photographic shadow** (multi-zone Q16) on underlying surfaces (the photo behind the card, the paper clipping itself). Different layer, different physics.

### Tape

- Optional washi-tape strips anchor card corners.
- Semi-transparent (~0.6 alpha multiply), slight rotation (5–25°), grain texture.
- Tape color: palette pulls at low saturation (yellow, teal, red).

### Registration jitter

- Saturated marks (yellow highlighter, red strike) offset 1–3 px from the underlying ink. Simulates risograph misalignment.
- Deterministic per Q6 / G9.

### Mark layer

- Highlighter / marker strokes draw **over** the card, in the channel layer.
- Highlight color: `#fabf47` ~0.7 alpha multiply.
- Stroke draws across the segment per `stroke-draw` motion (ink saturates along path over time, never a faded-in stamp).
- Q5/Q6 physics: wobble along the stroke, streak texture, occasional overshoot past the word boundary.

### Mono labels

Every collage card carries **at least one** mono label. Without it, the card is generic.

- **Kicker** (above title): mono caps, brand-yellow or brand-red plate behind, 32–48 px cap-height at 4K.
- **Source URL** (below body): mono lowercase, 32–40 px cap-height at 4K.
- **Date stamp**: mono caps, bottom-right or top-right corner.
- **File-path / code annotation**: mono, low-contrast, for code-themed overlays.

### Grit overlay

- ~10–15% opacity grit (multi-scale paper noise) over the entire composition.
- Bonds the collage layer to the substrate; prevents brand-bright accents from reading as web/UI.
- Reference: Syntax `--c-bg-grit-light` / `--c-bg-grit-dark`.

---

## Motion Vocabulary Preferences

Once `G13 Motion Vocabulary` lands in the animation rubric, this section says which moves the channel leans in vs. out. Until then, treat the list below as the channel's preferences.

**Lean in (required when the move applies)**:

- **brightness-reveal** for spoken-content text — pre-laid-out passage, words brighten as spoken, faded tails on both sides.
- **focal-dim-others** whenever a focal mark activates — surrounding context drops to 35–40% ink for the focal's duration.
- **halo-bloom-up** on focal text over dim or photographic substrate — warm yellow halo at ~0.15 alpha rises with the focal.
- **substrate-darken** on text overlaid on photographic substrate — localized vignette under the text, ≤ 30% of frame.
- **stroke-draw** for highlighter / marker marks — ink saturates along the stroke path over time.
- **tear-on** for torn-paper card entry — paper enters with a torn-edge wipe, not a slide.
- **tape-down** when tape anchors a card corner — small scale overshoot per `settled` ease.
- **settled-place** for collage-card body entry.

**Lean out (avoid unless content explicitly justifies)**:

- Typewriter pop-in per-word reveal (replaced by brightness-reveal).
- Faded-in stamp marks (replaced by stroke-draw).
- Generic slide-from-edge cards (replaced by tear-on for collage cards).
- Bouncy ease on body text or factual content.
- Full-frame camera moves (push / snap) on collage compositions — those belong to news/explainer surfaces, not collage.

---

## Reference Reel

The canon. The inspo files in `docs/inspo/` are the starting reference; channel additions live below.

| File / link | Take from it |
| --- | --- |
| `docs/inspo/pullquote/quote.png` | Substrate vignette + warm focal halo + serif body + faded tail |
| `docs/inspo/pullquote/letter-by-letter.png` | Brightening reveal over pre-laid-out passage |
| `docs/inspo/pullquote/sansserif.png` | Dim-the-rest tonal masking on continuous body |
| `docs/inspo/pullquote/serif.png` | Same masking move with serif body |
| `docs/inspo/pullquote/headlinetitle.png` | Card-over-darkened-footage; modern news headline card |
| `docs/inspo/newspaper/body.png` | Newsprint physics + highlighter as hand tool |
| `docs/inspo/newspaper/heading.png` | Newspaper masthead chrome + headline-on-paper claim |
| `docs/inspo/website/headline.png` | Modern web-article chrome (section chip, byline, comment count, embedded video) |
| `docs/inspo/website/perspective.png` | Photographed frame with real lens DoF |
| *Channel additions* | *TBD — Scott adds.* |

---

## Anti-Aesthetic

Looks that read wrong for **this channel specifically**, distinct from craft anti-patterns in the quality rubric.

- **Pastel / muted palettes.** Pulls brand identity.
- **Soft Apple-keynote gradient washes.** The channel is bright/saturated/graphic, not calm-tech.
- **Compositions with no mono.** Missing the signature thread reads off-brand.
- **Soft photographic (gaussian) shadows on the collage layer.** Collage gets hard offset; gaussian belongs only on underlying surfaces.
- **Axis-perfect rectangular cards** as the collage layer. Cards tear; they don't crop.
- **Pure brand-bright colors without grit grounding.** Reads as web/UI; grit pulls it back to physical media.
- **Helvetica / Arial / Inter as the only typeface family.** Fine as a surface body, never the sole identity.
- **Gaussian blur applied as decorative atmosphere.** Blur is reserved for photographed-frame DoF; collage gets grit + tear + hard shadow instead.
- **Generic stock motion-template "swooshes."** Already in the quality-rubric anti-patterns; also wrong for this channel.

When in doubt: *would this composition pass on Syntax's feed without looking like someone else's channel?*
