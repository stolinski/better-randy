# Docu flowchart — how your code ships

**Kind:** preset
**Slug:** docu-flowchart

## Pitch

The "how X works" documentary flowchart — the pure-primitive test of ADR-0036 §6. A four-node chain (Commit → Build → Test → Deploy) of box nodes connected by edge-arrows, with one headline label carrying the piece's title voice, revealed in strict reading order via Cascade chains: the headline lands, node-1 enters, edge-1 draws out of node-1, node-2 lands where the arrowhead points, and so on down the chain. The choreographed build IS the piece — a Johnny Harris / Vox-register explainer beat for the Syntax dev-podcast feed, in the channel's marker-on-dark voice.

## Surface(s) involved

`plain` — a full-frame piece: top-level `backgroundFill` dark (`#101014`), the transparent plain surface carrying only diagram Blocks. `typography.inkColor` is a warm off-white (`#f4ecdc`) so the marker strokes (which ride inkColor) and node/label text read against the dark fill; `paperColor` stays in the backgroundFill family (`#14141a`). Body is empty — the diagram is the content.

## Content sample

Headline label (title voice, mono caps): `HOW YOUR CODE SHIPS`

Nodes, in chain order: `Commit` → `Build` → `Test` → `Deploy`

## Motion plan

The reveal grammar is the ADR-0036 Cascade chain, welded in milliseconds so the build re-times as one unit:

- **Surface** enters `{ start: 0, duration: 0.05, ease: settled }` (300 ms).
- **Headline label** welds to the surface enter end +160 ms (clears the A1 settle buffer), `settled` 330 ms.
- **node-1 (Commit)** welds to the headline end +120 ms, `settled` 300 ms.
- **edge-1** welds to node-1 end +120 ms and **stroke-draws** toward node-2, `smooth` 360 ms — the marker-pull move from the channel vocabulary.
- **node-2 (Build)** welds to edge-1 end +80 ms — the box lands where the arrowhead just pointed. The edge→node→edge pattern repeats down the chain (edges +120 ms after their source node lands, nodes +80 ms after their edge finishes drawing — A2-respecting staggers throughout).
- The last node (Deploy) lands at ~0.63 of the 6 s transport; everything **holds readable for ~1.5 s**, then elements fade out `smooth` (210–252 ms, 20–30 % shorter than their enters) ending by ~0.94, under the surface exit `{ start: 0.9, duration: 0.04, ease: smooth }`.

Timeline shape: enter → chained build (the focal slot is the chain itself, read left-to-right) → held read → group fade exit. Follow-through comes from `settled` node landings + the staggered arrivals (G8b); the vertical variant's elbow routes give the motion its arcs (G8c).

H↔V reflow is **re-authored, not squeezed** (G11): horizontal runs the four nodes on a clean band at y 0.55 across x 0.15–0.85; vertical re-stages the chain as a descent — nodes zigzag down the readable column (x 0.36 / 0.64, y 0.28 → 0.73) with elbow edges that drop first, then turn, so the motion reads top-to-bottom.

## Channel chrome notes

- **Mono signature thread** — `typography.fontFamily: mono` carries the whole piece (headline caps + node labels); the channel's identity stamp is the type itself.
- **Marker stroke voice** — edge/node/arrowhead appearance resolves through the Syntax pack's Roles (hand-drawn marker feel, Q6 deterministic imperfection); the preset authors route only.
- **Grit overlay** — composition-wide `paper-grain` in the effects chain (low density) bonds the bright ink to the dark substrate so it doesn't read as web/UI.
- **Intentional omissions**: no torn-edge collage card and no hard offset shadow — this is a full-frame diagram piece on a dark field, not a collage card; the collage system's tear/tape/shadow vocabulary doesn't apply to stroke-drawn diagram Blocks. No highlight/underline marks — there is no body text to mark.

## Engine work required

None — composes from the existing Registry (ADR-0036 diagram primitives on the `plain` surface).

## ADR required?

no — already-filed: 0036-diagram-primitives.

## Open questions

None.

## What 'done' looks like

`src/lib/presets/docu-flowchart.json` (horizontal, 3840×2160) and `src/lib/presets/docu-flowchart-vertical.json` (vertical, 2160×3840 — same content, re-authored staging) Critic-`ACCEPT` at native resolution. Verification presets: **docu-flowchart** and **docu-flowchart-vertical**. Both pass `scripts/test-round-trip.ts` (PASS, not SKIP) and `npm run verify-presets` with no findings.
