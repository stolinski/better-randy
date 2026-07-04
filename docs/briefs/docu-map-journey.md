# Docu map journey — where your deploy goes

**Kind:** preset
**Slug:** docu-map-journey
**Verification presets:** docu-map-journey + docu-map-journey-vertical

## Pitch

The ADR-0036 §6 signature piece: the ANIMATED MAP. There is no map primitive — this
is pin nodes + arced edges + labels art-directed over an image substrate (the depth
stage's backdrop plane standing in for aerial footage). The content is the Syntax
dev-podcast register's version of a travel map: a deploy's journey across three
points — LOCAL → CI → EDGE — each pin dropping in, each arc drawing to the next pin
like a flight line. It proves the "same shot, art-directed, nothing built twice"
claim from ADR-0036 §2 with the classic documentary travel-map build.

## Surface(s) involved

`plain` — a transparent surface carrying only diagram Blocks, composited on the
depth stage (`stage.type: "depth"`) over the `atmosphere-warm` backdrop image
(ADR-0029). On the depth stage the surface plane must not rely on a painted
environment pass, so `plain` is the correct surface; the backdrop plane makes the
piece full-frame (opaque export lane, `backgroundFill` as the backstop).

## Content sample

Verbatim, as shipped in `surface.diagram[]`:

- Headline label: `WHERE YOUR DEPLOY GOES`
- Pin nodes: `LOCAL`, `CI`, `EDGE`
- Caption labels (horizontal): `git push origin main` · `build + tests pass` ·
  `live in 300 cities`
- Caption labels (vertical, trimmed ~30% per G11): `git push` · `build + tests` ·
  `live worldwide`

## Motion plan

The classic travel-map build, welded as one Cascade chain (ADR-0035):

1. Surface enters (0 → 0.05, `settled`).
2. Headline label fades on, welded to surface end +140 ms.
3. Pin `LOCAL` drops in (`settled` pop, 300 ms), welded to the headline start
   +160 ms; its caption follows the pin's end +80 ms.
4. Arc `LOCAL → CI` stroke-draws (480 ms, `smooth`), welded to the pin's end
   +100 ms — the arc anchors to the pin, per the brief's reveal grammar.
5. Pin `CI` drops in welded to the arc's end +80 ms; caption +80 ms after the pin.
6. Arc `CI → EDGE` draws +100 ms after `CI` lands; pin `EDGE` +80 ms after the
   arc; its caption +80 ms after.
7. Everything is landed by ~3.2 s and holds ≥ 1.9 s (≥ 1.5 s floor).
8. Element exits are short `smooth` fades staggered in travel order, all ending
   by ~0.95; surface exit starts at 0.88.

Camera: `stage.camera` slow push (`amount` 0.35, `smooth`) — real parallax between
the pins and the backdrop. Focus holds the near plane sharp (`focusZ` 0,
`aperture` 0.4, `band` 0.15) so the backdrop melts while the diagram stays crisp.
Both edges carry `route: "arc"` with an explicit `control` point so the bows read
as travel lines, `direction: "forward"` for the arrowheads. Follow-through: the
`settled` pin drops; arcs are the composition's literal arcs (G8c).

The vertical variant re-authors the journey down the frame (LOCAL top → CI middle
→ EDGE bottom, Y-led motion per G11), same primitives, same cascade chain, all
readable content inside the G3 bands (top 6% / bottom 16% / right 9% clear).

## Channel chrome notes

- Ink `#f4ecdc` over the warm backdrop — arc strokes ride `inkColor` and read as
  chalk-on-atlas lines against `atmosphere-warm`; `backdrop.contrast` 0.35 darkens
  the centre for legibility (G5).
- Pin/edge/arrowhead appearance resolves through the Syntax pack's Roles
  (hand-drawn marker feel) — stroke is appearance, never schema (ADR-0036 §4).
- Intentional omissions: no torn-edge collage card and no washi tape — this is a
  full-frame docu-map shot over footage-like substrate, not a collage card; the
  diagram layer itself is the channel's interpretation of the "found" aerial
  image. No mono kicker chip — the headline label is the single display voice and
  the pack's label chrome carries the signature thread.

## Engine work required

None — composes from the existing Registry (diagram Blocks on `plain`, depth
stage + backdrop image substrate, Cascade welds).

## ADR required?

already-filed: 0036-diagram-primitives + 0029-image-substrate-on-depth-stage.

## Open questions

(none)

## What 'done' looks like

`src/lib/presets/docu-map-journey.json` and
`src/lib/presets/docu-map-journey-vertical.json` Critic-`ACCEPT` at native
resolution; both pass `scripts/test-round-trip.ts` and `npm run verify-presets`.
