# ADR-0037 — iMessage chrome mode: the film-insert chromeless thread

## Status

**Canon (v1 built).**

Date: 2026-07-02
Builds on: [ADR-0031](0031-imessage-interactive-surface.md) (the `imessage` interactive Surface), [ADR-0030](0030-web-document-emissive-surface.md) (per-artifact layout = content, not new Surfaces)

## Context

The `imessage` Surface (ADR-0031) is a faithful iOS Messages window — header, timestamp, composer bar, opaque page — with the conversation choreographed inside it. The highest-frequency channel use case wants the *movie* treatment instead: nothing but the bubbles, floating directly over footage, the way every Netflix show renders a character texting. The window is chrome around the same conversation; the choreography (pop-in springs, typing indicator, tapbacks, receipts) is identical. Two rendering details block simply hiding the window: the classic two-pseudo tail curl paints its concave cutout with `background-color: var(--im-page)`, and the tapback badge wears a `var(--im-page)` ring — over transparent footage both are opaque page-colored blocks.

## Decision

**Chrome is a mode on the faithful-artifact Surface, not a sibling pipeline**: `surface.chrome: 'window' | 'none'` (absent means `'window'`; renderers must read `chrome ?? 'window'` because a Zod `.default()` is not reliably applied to pre-existing runtime state — the `validateOverlayContents` precedent). `chrome: 'none'` drops the header, timestamp, composer bar, page background, border-radius, and card box from the captured DOM, keeping the bottom-anchored thread with the existing width knobs; a substrate-darken radial-gradient vignette (≤ 30% of frame, frame-pixel-sized so the budget holds across the H/V reflow, opacity riding the surface visibility ramp, no CSS `filter`) renders behind the thread for legibility. **The tail curl is repainted for transparency**: chromeless replaces the page-color-cutout technique with a single pseudo whose `radial-gradient` paints bubble color *outside* an ellipse and genuine transparency *inside* it, so the concave outer edge cuts to the footage; the tapback ring keeps its geometry but goes `border-color: transparent`.

## Considered options

- **A sibling Surface (`imessage-bare`)** — rejected: duplicates the `messages[]` content model, the schedule, the marks wiring, and the whole choreography for what is purely an appearance-of-the-window difference; ADR-0030 already established that per-artifact presentation differences are data on one Surface, not new Surfaces.
- **A `variant` on the Surface (ADR-0020 variants-as-data)** — rejected: variants encode a family's *motion shapes* (`{ id, label, defaults, motionShape }`); window-vs-none changes no motion. A dedicated named field is also self-documenting for the GUI inspector and future chromeless modes on other artifact surfaces (web-document is the obvious next candidate).
- **A Pack Role for the chrome** — rejected: a Pack is one global appearance dress (ADR-0023); window vs film-insert is a per-composition authoring intent that must vary per Preset under the same Pack.
- **Tail via CSS `mask-image` on the existing pseudos** — rejected: the mask can only cut the pseudo's own convex box; the concave outer curve of the curl comes from the second pseudo *overpainting* in page color, which is exactly the opaque block being removed.
- **Tail via an inline SVG element per bubble** — rejected: adds a DOM node per bubble in the captured tree and duplicates per-side geometry that CSS logical properties already mirror; the single radial-gradient pseudo keeps the exact same DOM shape as window mode.
- **Vignette as a composition Effect or Overlay** — rejected: the Brief's motion plan ties the vignette to the surface's own visibility ramp (it *is* part of the surface's enter/exit), and effect passes cannot know where the thread column sits; the Surface renders it in the captured DOM, frame-deterministically.

## Consequences

Existing `imessage-the-bug*` presets are untouched pixels — they carry no `chrome` field and take the `chrome ?? 'window'` path through the unchanged window-mode markup and CSS. The chromeless mode inherits every choreography feature (schedule descriptors, timeline clips, sound events, marks) for free because nothing about timing moved. The theme signal is unchanged: `paperColor` luminance still picks the light/dark bubble/meta palette, but in chromeless mode the page color itself is never painted. The transparent-tail technique (gradient-to-transparent instead of cover-paint) is the convention future chromeless modes on other artifact surfaces should reuse, and the Identity Spec now carries a `chromeless-film-insert` dimension so the Critic measures transparency between bubbles, the tail/tapback edges, and the ≤ 30% vignette budget instead of hunting for a header that intentionally is not there. One trade: the `chrome` field is `imessage`-only today and ignored by every other Surface — the same accepted asymmetry as `site` (ADR-0030) and `messages` (ADR-0031).
