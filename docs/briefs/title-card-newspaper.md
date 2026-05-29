# Title card — newspaper

**Kind:** pipeline
**Slug:** title-card-newspaper
**Verification preset:** title-card-newspaper

## Pitch

A full-frame newspaper-style chapter title card that sits between topic
segments inside a long-form Syntax video. Replaces the current in-camera or
DaVinci-text title with a Hiviz-stamped intact newspaper page carrying the
chapter headline at display scale. The title is the *only* content on the
card — kicker, byline, and dateline slots are intentionally absent so the
headline reads as a display-headline, not a Surface-title with chrome.

Lands because every Syntax video breaks into 2–4 topic segments and the
transitions are currently inconsistent in chrome — host-frame text, plain
cards, sometimes no transition at all. A standardized opener trains the eye
and makes long episodes scannable. The newspaper material claim (warm
printed paper, halftone, ink bleed, heavy slab/serif display) gives the
divider the strongest channel signature — reads as found media, not a
template.

Slug uses the `title-card-<surface>` family naming so future variants
(`title-card-pullquote`, `title-card-web-article`) can sit alongside as
distinct visual styles sharing the same role.

## Surface(s) involved

**newspaper** — a new Surface, not yet in the Registry. The Surface models an
**intact printed newspaper page** (clean printed edges), distinct from a torn
clipping. The CanvasSource auto-scales the title between a tight
Surface-title size (when kicker / byline / date / body are present) and a
Display-headline size (when the title is alone, as in this preset). A future
Brief may add a separate `newspaper-clipping` Surface (or a tear-edge shader
applied via composition) for the torn-from-paper variant; the two are
different material claims and shouldn't be conflated. The verification
preset is the gate that proves the Surface renders at native 4K. Once it
`ACCEPT`s, the Surface unlocks a family of newspaper-shaped presets (op-eds,
classifieds, news headlines) in follow-up Briefs.

## Content sample

Verbatim copy the Producer ships in `src/lib/presets/title-card-newspaper.json`:

- **title:** `Why Bun Quietly Replaced npm` (display, wraps to two lines)

Title-only by design. No kicker, byline, dateline, or body. Format-agnostic
— the title carries everything.

## Motion plan

Total runtime: ~2.8s. Focal slot: title's strongest noun ("Bun").

```
0.00 → 0.30s   settled-place  — newspaper card settles in from below
                                (vertical slide driven by paperVisibility)
0.10 → 0.45s   settled-place  — title arrives at full ink with card
0.20 → 0.70s   halo-bloom-up  — warm yellow halo (#fabf47, ~0.15 alpha,
                                gaussian falloff) rises behind the title
                                focal word
0.85 → 2.40s   hold           — halo at full, full composition holds
2.40 → 2.80s   exit           — smooth fade + halo dim
```

**Lean-out deviation noted:** brightness-reveal is *deliberately omitted*
even though it is the channel's canonical reveal move. Reason: aesthetic.md
reserves brightness-reveal for *spoken-content text* (passages a viewer
reads along to). A chapter-divider title is a label, not spoken content —
glance-readable, not read-along. Halo-bloom-up + settled-place do the
focal-arrival work without misapplying the spoken-content vocabulary.

**Second deviation:** the title cap-height exceeds G4's Horizontal
Surface-title band (60–110 px) by design — the title-only configuration
takes the Display-headline role the rubric doesn't yet codify. Critic-filed
rubric-gap. Producer carries both deviations into the Preset's `description`
so the Critic doesn't re-flag.

## Channel chrome notes

Pared-down chrome — the title-only composition leans on the substrate,
shadow, and tape rather than text chrome.

- **Mono signature thread:** _none_ — the title-card variant strips the
  mono chrome that would normally satisfy this rule. Intentional deviation
  for the title-card role; a future newspaper-clipping preset would
  re-introduce kicker / byline / dateline. Producer notes this in the
  Preset's `description` so the Critic doesn't re-flag as
  `aesthetic-miss`.
- **Hard offset shadow:** 12 px at 4K, no blur, in the card's
  ink/foreground color `#1a1612` (NOT channel-yellow — aesthetic.md's
  "foreground color" references Syntax's `--c-fg`, the dark ink, not the
  yellow accent).
- **Card edges:** clean printed edges (no tear). The newspaper Surface is
  an intact printed page, not a torn clipping. aesthetic.md § Collage
  System / Cut behavior ("Tear, don't crop") is scoped to the channel's
  torn-collage-card *layer*, not the underlying paper substrate.
- **Registration jitter:** n/a — no saturated highlighter / strike marks.
- **Grit overlay:** composition-wide via
  `effects.frame: [{ type: 'paperGrain' }]`.
- **Washi tape:** one strip, top-left corner of card. ~280 px length ×
  ~84 px width at 4K (real washi-tape proportions, not a ribbon), −25°
  rotation, yellow at ~0.6 alpha multiply with grain texture. Midpoint
  anchored at the card's top-left corner; half the tape extends off the
  card so on composite the tape reads as taping the card to the
  underlying footage.

**Newspaper-specific physics** (declared on the Surface Pipeline via
`shaderPass`, awaits compose-pipeline invocation):

- Warm-white substrate (~`#f0e8d6`).
- Halftone dot screen at body sizes.
- Ink bleed at glyph edges (sub-pixel dilate + soft blur).
- Slight camera angle: 1–3° rotation, seeded per-instance.
- Heavy slab or bold serif display (Playfair Display 900).

**Placement:**

- Card: centered, ~70% frame width, ~62% frame height, 1–3° seeded
  rotation. Bbox area lands ~48% — inside T1's 45–75% horizontal-landscape
  band.
- Title: vertically centered in card (the `data-density="title-only"`
  layout switch). Cap-height ~213 px at 4K (Playfair Display 900 at title
  size ratio 0.115 × card width).
- Tape: top-left corner of card, midpoint at corner, ~half extends
  off-card.

## Engine work required

Adds one Surface Pipeline, one Overlay Pipeline, one schema field, one
schema enum extension, and one shader pass. Producer ships all of it
alongside the verification preset.

```
1. newspaper Surface Pipeline
   src/lib/pipelines/surfaces/newspaper/index.ts
   src/lib/pipelines/surfaces/newspaper/CanvasSource.svelte
   — declarative SurfaceRenderer with type: 'newspaper'
   — body type: heavy slab/serif display
   — substrate color #f0e8d6
   — 1–3° camera angle (seeded from preset id)
   — title font-size auto-scales 0.058 → 0.115 of card width based on
     count of non-title slots present (kicker / byline / date / body)
   — title-only density switches layout from grid to flex-center for
     vertical balance

2. Newspaper paper-physics shader pass
   src/lib/pipelines/shader-passes/newspaper-physics.ts
   — halftone dot screen at body sizes
   — ink bleed at glyph edges (sub-pixel dilate + blur)
   — declarative via SurfaceRenderer.shaderPass (ADR-0008); compose-
     pipeline invocation deferred (same posture as ADR-0005's overlay
     shaderPass) — engine work outside this Brief's scope

3. Engine schema extensions (src/lib/platform/engine-schema.ts)
   — SurfaceTypeSchema enum: ['paper', 'plain', 'newspaper']
   — SurfaceContentSchema: add `kicker: z.string().optional()`
   — isNewspaperSurface() type guard

4. washi-tape Overlay Pipeline
   src/lib/pipelines/overlays/washi-tape/index.ts
   src/lib/pipelines/overlays/washi-tape/CanvasSource.svelte
   — OverlayRenderer with type: 'washi-tape'
   — content schema: { color?, rotation? (±5–25°), length? }
   — multiply blend (~0.6 alpha), grain texture
   — width ratio 0.30 of length (real washi proportions)

5. Registry registration (src/lib/platform/pipelines/index.ts)
   — surfaces: add `newspaper`
   — overlays: add `washiTape`
```

## ADR required?

`yes` — two ADRs:

- **ADR-0008: newspaper-surface-pipeline** — why newspaper is its own
  Surface rather than a `paper` variant (different material physics:
  halftone, ink bleed, heavy slab/serif display vs clean grain).
  Halftone + ink-bleed shader design. Extension of ADR-0005's
  `shaderPass` pattern from `OverlayRenderer` to `SurfaceRenderer`.
  `SurfaceContent.kicker` schema addition. Title-size auto-scale based
  on slot density.
- **ADR-0009: washi-tape-overlay** — tape modeled as an Overlay (not an
  Effect, not chrome baked into the Surface). Independently reusable
  across future Briefs. Content schema, rotation/length params,
  multiply-blend physics.

## Open questions

_None._ Brief is ready to `/author`.

## What 'done' looks like

```
- src/lib/pipelines/surfaces/newspaper/index.ts
- src/lib/pipelines/surfaces/newspaper/CanvasSource.svelte
- src/lib/pipelines/shader-passes/newspaper-physics.ts
- src/lib/pipelines/overlays/washi-tape/index.ts
- src/lib/pipelines/overlays/washi-tape/CanvasSource.svelte
- src/lib/platform/engine-schema.ts            (updates)
- src/lib/platform/pipelines/index.ts          (registry updates)
- docs/adr/0008-newspaper-surface-pipeline.md
- docs/adr/0009-washi-tape-overlay.md
- src/lib/presets/title-card-newspaper.json    (the verification preset)
- /critic title-card-newspaper returns ACCEPT
```

Delete trigger: `/critic title-card-newspaper` returns `ACCEPT` with no
`pipeline-bug` or `default-too-permissive` findings.
