# ADR-0034 — GUI design: the authoring interface (three zones, timeline-as-outline, hybrid manipulation)

Status: **Designed, not built** — interaction model **+ visual design** (§7); construction is dex epic `jz2yykvi`.
Date: 2026-06-26
Relates to: [ADR-0032](0032-gui-agent-parity-authoring.md) (GUI parity — the data model this interface sits over), [ADR-0011](0011-text-animation-orchestration.md) (timeline tracks + ControlPanel sections precedent), [ADR-0033](0033-sound-design-motion-emitted-cues.md) (the per-Layer Sound-kit picker lives in the Layer inspector)

## Context

[ADR-0032](0032-gui-agent-parity-authoring.md) specified the GUI's **data model** (fork-on-edit, persistence, lossless round-trip) but explicitly *not* the interface. This ADR specifies the **interaction model** — the structure and behavior of the authoring UI. It does **not** specify the visual design (layout proportions, hierarchy, component styling, the actual look); that is a follow-up pass.

Today `/p/[slug]` renders one `<Workspace>` shell: a WebGPU canvas that is **preview-only** (no selection or manipulation), a `ControlPanel` of **global** grouped form-controls (nothing is "selected"), a timeline (tracks + scrubber + draggable rail clips), and an `ExportPanel`. Design system is Graffiti tokens.

The engine's nature constrains the design: a **tasteful, constrained vocabulary with smart defaults — not a freeform node compositor**. The interface must be *capable* (agent-parity: author anything) yet *restrained* (less UI).

## Decision

### 1. Hybrid manipulation — inspector-complete, canvas does position + scale

The **inspector is the complete editing surface**: the whole Preset schema for the selected element, plus the non-spatial things (timing, effects, content, sound). **On-canvas direct manipulation is a fast-path for the spatial subset only** — position (drag) + scale (handles) — two-way-bound to the inspector. Everything else is inspector-only. (Rotation and broader direct-manipulation are deferred.)

### 2. The timeline *is* the layer outline

Every Layer is temporal, so the layer list and the timeline are **one panel with two regions**:

- an **outline gutter** (left) — layer names, hierarchy (Surface ▸ Blocks ▸ Annotations · Overlays · Text-animations · Audio cues), selection, and add / remove / reorder;
- a **track area** (right) — each row's timing / keyframes.

This collapses "layer list + timeline" into one surface (the restraint win) and matches the After Effects / Premiere model.

### 3. Selection model

- Click a timeline row → the inspector shows that Layer (a per-type inspector).
- Click off (deselect) → the inspector shows the **composition root**: `transport`, the active **Pack**, and the **Effects** chain — the non-temporal, composition-level properties.
- Canvas-click selects spatial Layers, mirroring the row selection so the outline and canvas stay in sync.

### 4. Per-type inspectors + progressive disclosure

The inspector renders a **curated editor for what's selected** — an Overlay's inspector ≠ a text-animation's ≠ the root's. Smart defaults keep each minimal; advanced fields disclose on demand. That is how it stays "everything and more" (full schema parity) without a sprawling form. The **Sound-kit picker appears in a Layer's inspector** (per [ADR-0033](0033-sound-design-motion-emitted-cues.md)'s per-Layer kit), not the root.

### 5. Three zones

Canvas (preview + position/scale manipulation) · timeline-outline · inspector. Built on Graffiti tokens; **autosave** (no save button — [ADR-0032](0032-gui-agent-parity-authoring.md)); no refresh buttons, no explanatory text; every panel must be load-bearing (both the timeline-outline and the inspector are).

### 6. It is the interface over the parity data model

Selection / inspector edit the same `engineState` that [ADR-0032](0032-gui-agent-parity-authoring.md) persists; on-canvas transforms write the same schema fields. One composition model — the GUI is a structured, designed editor over the same Preset the agent writes.

### 7. Visual design — dark, recessive, canvas-first

A color-grading-suite logic: the instrument is monochrome and quiet so the picture is the only thing you see.

- **Layout** (chosen from skeletons): three zones in the motion-tool arrangement — **inspector on the right** (persistent rail), the **timeline-outline full-width at the bottom**, the **canvas filling the center**. The layer-list-is-timeline merge (§2) means there is no left panel.
- **Chrome**: **dark, neutral, recessive** — near-black / charcoal on Graffiti tokens; the canvas content carries the only light and color. No channel aesthetic in the tool itself (it would compete with the work being judged).
- **Canvas framing**: transparent overlays render over a **dark checkerboard** by default, with an optional **reference still / clip backdrop** so an overlay is judged over real footage as it'll be used; full-frame segments/bumpers fill the frame. An **H ↔ V orientation toggle** on the canvas (pieces reflow and safe-areas differ — load-bearing, not a nicety). Fit-to-window with zoom.

## Out of scope (deliberately)

- Direct manipulation beyond position + scale (rotation, path editing).
- Create-from-blank, multi-select, the product-document model — see [ADR-0032](0032-gui-agent-parity-authoring.md)'s deferred list.

## Alternatives rejected

- **Inspector-only** (no canvas manipulation) — position/scale are genuinely spatial; dragging beats typing offsets.
- **Full direct-manipulation canvas** (drag everything) — the canvas is a WebGPU target needing a DOM editing overlay + coordinate mapping; a sprawling manipulation surface is the freeform-compositor the engine rejects and it fights restraint.
- **Separate layer-list panel + timeline** — every Layer is temporal, so they are the same thing; one panel is leaner and standard.
- **Schema-generated generic inspector** (auto-form every field) — generic and ugly; per-type curated inspectors hit the quality bar and stay minimal via progressive disclosure.

## Consequences

- A **selection store** + a hit-test / geometry layer for canvas selection of spatial Layers.
- The timeline gains an **outline gutter** with structural editing (add / remove / reorder) — the home for [ADR-0032](0032-gui-agent-parity-authoring.md)'s structural coverage.
- A **DOM editing-overlay** over the scaled canvas (handles) + screen→4K→schema coordinate mapping, for position/scale.
- An **inspector shell** that dispatches per-type editors, including the root inspector (transport / Pack / Effects) and the per-Layer Sound-kit picker ([ADR-0033](0033-sound-design-motion-emitted-cues.md)).
- The **visual design** is specified (§7); the styling task (`uno1jth1`) builds it — no longer gated on a design pass.
- Tracked in dex; see [`roadmap.md`](../roadmap.md) § GUI design.
