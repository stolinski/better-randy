# Diagram primitives — art-directed docu diagrams as Blocks

> **Status: Shipped** — grilled 2026-07-01/02, built 2026-07-03/04 (dex epic `phd3zd26`): schema (`surface.diagram[]`), five Block pipelines + Identity Specs, GUI parity (rows / canvas drag / per-type inspector / cascade picker), and the four-piece demo set (`docu-map-journey`, `docu-flowchart`, `docu-stat-build`, `docu-timeline-build`, each H+V) through Critic ACCEPT. The Critic loop drove three engine corrections (odometer carry, capture-safe digit rolls, transparent-ink legibility halo) plus orientation-aware segment-caption placement. Glossary: **Diagram primitive** in [`CONTEXT.md`](../CONTEXT.md).

Supers gets a **five-primitive diagram vocabulary** — `node`, `edge-arrow`, `label`, `stat-callout`, `timeline-segment` — living as **Blocks on any Surface**, positioned **explicitly** in composition space and revealed with **stroke-draw + Cascade**. The register is high-end YouTube documentary (Johnny Harris / Vox): every primitive is placed deliberately and revealed in choreographed order. **Auto-layout is rejected** — mermaid-style layout reads as documentation, not documentary; at most a future compile-*into*-primitives authoring shortcut.

## §1 Context

Only `paragraph` exists in the Block layer; explainer content (flowcharts, maps, timelines, stat builds) has no vocabulary at all — the biggest content-coverage gap for a dev/doc channel. The corpus-v2 demo lanes (2026-07 grill) named docu-diagram pieces a wanted deliverable kind.

## §2 Vocabulary — five primitives, map is a demo

| Primitive | Claims | Notes |
|---|---|---|
| `node` | a labeled point/box in the diagram | pin, box, or dot form — appearance via Roles |
| `edge-arrow` | a directed connection between two nodes | see §4 routing |
| `label` | free text annotating a position | the diagram's caption voice |
| `stat-callout` | a number that builds | reuses the counter roll behavior |
| `timeline-segment` | a spanned interval with endpoints | the H↔V reflow stress case |

**No map primitive.** An animated map is node-pins + arced edges + labels composited over an **image substrate** (the `jhxe2k5w` primitive) — the same shot, art-directed, with nothing built twice. Real geo support (projections, lat/lng, zoom choreography) rejected as a rabbit hole that buys nothing over hand-placed pins.

## §3 Home — Blocks on any Surface

Diagram primitives are **Blocks**: discrete content units on a Surface, in the Surface's coordinate space, positioned by explicit composition-space fractions (GUI-draggable). This works **full-frame** (paper / chapter-card substrate) and **over footage** (a transparent surface carrying only diagram Blocks — the stat-build overlay case).

- Rejected — *new Overlay types*: a 12-node flowchart becomes 12 loose overlays with no shared coordinate space, and an edge that connects two nodes has no home.
- Rejected — *dedicated diagram Surface* (the iMessage pattern): walls diagrams off from composing with other content, and every new diagram kind tempts a new Surface.

Primitives carry `id`, `type`, explicit position, content, and standard timing (`enter`/`exit` sugar, **Cascade** anchor, ADR-0035 keyframe channels where they apply). Edges reference node ids. **Field placement (decided in the schema task): `surface.diagram[]`** — a diagram group on the Surface, not a top-level `blocks[]`. It matches this section's model (primitives live in the Surface's coordinate space), and the group is pure JSON so `presetToWireFormat`'s surface spread carries it losslessly under the byte-identical round-trip gate (unlike `content.body`, which round-trips through text). Cascade anchors gain `{ block: id }`; timeline rows are `block-{id}`. Channel split: DOM primitives (`node` / `label` / `stat-callout`) take the full ADR-0035 channel set; stroke-drawn primitives (`edge-arrow` / `timeline-segment`) expose `opacity` only — their reveal is the stroke-draw scalar, and a transform channel fighting the drawn path is the double-motion mystery ADR-0035 §2 bans.

## §4 Edges — authored route, Pack-resolved stroke

- **Route is content**: endpoints (node refs or explicit points) + one optional control point → straight, elbow, or quadratic **arc** (the map money shot). Authored, never auto-routed.
- **Stroke is appearance**, resolved through Roles per pack: `syntax` = hand-drawn marker feel (Q6 deterministic imperfection), `editorial-mono` = clean printed rule, `crt-terminal` = phosphor plotter line. Arrowhead form is a Role. A hand-wobbled arrow under CRT is an aesthetic-miss by that pack's own anti-list — which is exactly why the stroke can't be baked into the primitive.
- **Draw-on reveal** reuses the annotation stroke-draw machinery (`src/lib/annotations/`, mark progress scalar).

## §5 Reveal grammar

Cascade (ADR-0035) is the choreography: reading-order builds (node → edge draws to → next node) declared as anchor chains, re-timing as one unit with sound cues welded. Node/label entrances use the pack's motion vocabulary; `stat-callout` counts up on its window; edges stroke-draw. Multi-step emphasis (a node pulsing once when named) is ADR-0035 keyframe territory, not new machinery.

## §6 Demo set (corpus v2)

All four chosen: **animated map** (primitives over image substrate — the signature), **flowchart** ("how X works", the pure-primitive test), **stat build** (transparent surface over footage), **timeline build** (H↔V reflow stress). Each a deliverable through Critic ACCEPT.

## §7 Consequences

- Five Block pipelines with Identity Specs (`graphic` kind; stroke/node appearance dims `viaPack`, motion intrinsic) — the registry gate applies as everywhere.
- New pack Roles (edge stroke, node form, arrowhead) join all pack manifests — lands cleanly only after the pack-contract work (core-vocabulary enforcement, epic `wscbvu5k`).
- GUI: diagram Blocks join the timeline outline as rows and get canvas drag + a per-type inspector (the ADR-0034 machinery, extended).
- Depends on ADR-0035 shipping first; epic `phd3zd26` stays blocked on `4i8gx2i7`.
