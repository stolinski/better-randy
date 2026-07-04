# Docu timeline build — the road to ES modules

**Kind:** preset
**Slug:** docu-timeline-build
**Verification presets:** docu-timeline-build, docu-timeline-build-vertical

## Pitch

A documentary-register timeline build for the Syntax dev-podcast voice: three eras of JavaScript module loading drawn as `timeline-segment` spans along one axis, each carrying its own era caption, with year-marker `label` elements at the era boundaries and a single dot-form `node` marking the present. The segments stroke-draw on left-to-right in strict chronological sequence via Cascade welds — the chronological draw IS the piece. It is also the H↔V reflow stress case of ADR-0036 §6: the vertical sibling re-authors the SAME primitives down a vertical rail by repositioning endpoints, never reshaping.

## Surface(s) involved

`plain` — a transparent surface carrying only diagram Blocks, made full-frame by a top-level `backgroundFill` of dark `#0f1116`. Segment strokes and label ink ride `typography.inkColor` warm off-white `#f4ecdc`; `content.body` is empty.

## Content sample

Verbatim, as shipped in `surface.diagram[]`:

- Title label: `THE ROAD TO ES MODULES`
- Segment 1 label: `SCRIPT TAGS` (span 1995 → 2009)
- Segment 2 label: `BUNDLER ERA` (span 2009 → 2015)
- Segment 3 label: `ESM ERA` (span 2015 → now)
- Boundary year labels: `1995`, `2009`, `2015`, `NOW`
- Present marker: one `node`, `form: "dot"`, at the `NOW` end of the axis.

## Motion plan

- **stroke-draw** — each `timeline-segment` reveals by stroke-draw over its enter window (ADR-0036 §4), `ease: "smooth"`, draw durations 0.08 of the 6 s transport (480 ms — draws, deliberately longer than label pops).
- **settled-place** — labels and the dot node land with `ease: "settled"` pops in the G6 band (0.05–0.055 → 300–330 ms).
- **Cascade chronology** — the reveal grammar of ADR-0036 §5: title welds to surface end; segment 1 welds to the title's end; segment 2 anchors to segment 1's end, segment 3 to segment 2's end (each +160 ms); each boundary-year label anchors to its segment's start or end (+80–120 ms); the dot node anchors to segment 3's end (+200 ms). All offsets ≥ 80 ms, chain acyclic.
- **Timeline shape** — surface enter 0–0.05 → title at 0.07 → chronological draw 0.145–0.52 → everything landed and held ~1.7 s → staggered left-to-right exits from 0.80, all element exits done by 0.91 → surface exit 0.88–0.92.
- **Focal slot** — the axis itself; the dot node at `NOW` is the landing beat.
- Vertical sibling: same primitives, same weld chain, endpoints repositioned onto a vertical rail (x 0.5, y spans stacked top→bottom) so the draw direction becomes Y-motion (G11); year markers move beside the joints, type scales up.

## Channel chrome notes

- **Mono signature thread** — `typography.fontFamily: "mono"`; every label (title, era captions, year markers) is set in the channel mono. The year stamps are the signature thread.
- **Intentional omissions** (docu-diagram register, ADR-0036 — not the collage system): no torn edges, no tape, no hard offset shadow, no registration jitter, no grit `paper-grain` effect. This is a clean dark full-frame graphic piece; stroke/node/label appearance resolves through the Syntax pack's Roles, never the schema. These omissions are carried in the preset `description` so the Critic does not re-flag them as `aesthetic-miss`.

## Engine work required

None — composes from the existing Registry (`surface.diagram[]` primitives, ADR-0036 schema already landed).

## ADR required?

already-filed: 0036-diagram-primitives

## Open questions

None.

## What 'done' looks like

`src/lib/presets/docu-timeline-build.json` and `src/lib/presets/docu-timeline-build-vertical.json` Critic-`ACCEPT` at native resolution (3840×2160 / 2160×3840). Both pass `scripts/test-round-trip.ts` and `npm run verify-presets` with no findings.
