# Docu stat build — three stats land over footage

**Kind:** preset
**Slug:** docu-stat-build
**Verification presets:** docu-stat-build, docu-stat-build-vertical

## Pitch

The overlay use of the diagram primitives (ADR-0036 §6): a documentary stat beat composited straight over the host's footage. Three `stat-callout` Blocks build in reading order under one headline label — the numbers roll up slot-machine style, land, and HOLD together long enough to absorb before the piece clears the frame. It's the Johnny-Harris "here are the numbers" moment for a Syntax dev-podcast beat about JavaScript's scale, delivered as a transparent key with zero card chrome — the footage stays the substrate.

## Surface(s) involved

`plain` — transparent, `content.body` empty, carrying only `surface.diagram[]` Blocks (one `label`, three `stat-callout`). No backgroundFill anywhere; this is a keyed overlay.

## Content sample

Verbatim, as shipped in `surface.diagram[]`:

- Headline label: `JAVASCRIPT BY THE NUMBERS`
- Stat 1: `0 → 2100000000`, format `integer`, label `NPM DOWNLOADS / WEEK` (renders as 2,100,000,000)
- Stat 2: `0 → 97`, format `percent`, label `OF SITES RUN JS`
- Stat 3: `0 → 11000000`, format `integer`, label `JS DEVELOPERS`

## Motion plan

Cascade chain welded to the surface (ADR-0035): surface settles → headline label rises in (`settled`) → stat 1 → stat 2 → stat 3, each stat's enter welded `{ "block": <previous id> }` with ms offsets so the build re-times as one unit. Each stat's count rolls over its `rollStart`/`rollWindow` (~1.2–1.8 s per roll, staggered so the rolls overlap like a cascade of odometers) and then HOLDS the landed value. All three land by ~3.3 s and hold together ≈2 s before staggered fade exits (`smooth`), everything out by 0.95 of the clip. Timeline shape: enter (0–0.05) → build (0.07–0.55) → held read (to ~0.86) → exit (by 0.92).

- Element enters 300 ms `settled` (G6/G7); exits 240 ms `smooth` (20% shorter than enter).
- Lean-in moves: settled-place on the label and stat mounts; the roll itself is the stat-callout's intrinsic counter behavior (the roll is the show — enter is a plain fade by design).
- Lean-out note: no stroke-draw or tear-on — there is no card and no edge to draw; the piece is pure number choreography over footage.

Vertical is re-authored, not squeezed: single stacked column inside the platform-safe middle band, tighter 120 ms cascade offsets, headline scaled to the narrower measure.

## Channel chrome notes

- **Mono signature thread**: carried by the stat values and captions themselves — the stat-callout pipeline renders JetBrains Mono tabular numerals and mono uppercase captions, and the headline label is the mono caption voice. The whole piece IS the mono thread.
- **Palette**: values resolve to the pack accent `#fabf47` (yellow primary as focal accent); captions/headline in `#ffffff` ink to read over footage. Two hues total — under the Q4 cap.
- **Intentional omissions**: no torn-paper collage card, no hard offset shadow, no tape, no grit effect, no backgroundFill — this is a transparent key over the host's footage (ADR-0036 §6 stat-build register); collage chrome would claim a card that doesn't exist. The footage supplies the substrate and the audio.

## Engine work required

None — composes from the existing Registry (`plain` surface + ADR-0036 diagram Blocks, all shipped).

## ADR required?

already-filed: 0036-diagram-primitives

## Open questions

*(none — ready to /author)*

## What 'done' looks like

`src/lib/presets/docu-stat-build.json` (3840×2160) and `src/lib/presets/docu-stat-build-vertical.json` (2160×3840) Critic-`ACCEPT` at native resolution. Both pass `scripts/test-round-trip.ts` and `npm run verify-presets` clean.
