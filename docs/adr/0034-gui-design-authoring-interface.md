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

### 2a. Timeline clip model — unified bar with integrated fade handles

Each overlay row renders as **one continuous clip bar** spanning from `enter.start` to `exit.start + exit.duration`. The bar has three visual zones:

```
[≈≈≈ enter ramp |════════ solid ════════| exit ramp ≈≈≈]
 ^    ^                                  ^              ^
 left outer      left inner fade         right inner    right outer
 (enter.start)   (enter.duration)        (exit.dur)     (clip end)
```

- **Left outer edge** — trim clip start; drags `enter.start`.
- **Left inner fade handle** — drags the enter/solid boundary; adjusts `enter.duration`.
- **Body** — moves the whole clip; shifts `enter.start` and `exit.start` together.
- **Right inner fade handle** — drags the solid/exit boundary; adjusts `exit.duration`.
- **Right outer edge** — trim clip end; drags `exit.start + exit.duration`.

No `enter` → bar starts solid with only a right ramp (if `exit` exists). No `exit` → bar ends solid. Text-animation rows follow the same shape using their `enter` only (no exit in schema today). Audio-cue rows are point markers, not bars.

This replaces the current two-block model (enter clip + connector + exit clip) which makes overlays look like disconnected fragments instead of one thing with bookend transitions. The ramp-in / ramp-out gradient styling already in `TimelineTrackView` maps directly onto the zone fill — only the structural model changes. Built in the task `p8b3mn5q` (blocked on `itjli1g9`).

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

A color-grading-suite logic: the instrument is monochrome and quiet so the picture is the only thing you see. DaVinci Resolve is the tonal reference but the target is more intentionally designed — cleaner, more modern, more minimal.

- **Layout**: three zones — **inspector on the right** (persistent rail), **timeline-outline full-width at the bottom**, **canvas filling the center**. No left panel (layer-list-is-timeline merge, §2). No top menu bar — composition name sits as a quiet label in the outline gutter header; a minimal nav affordance (back chevron or equivalent) returns to the **Preset picker** (§8). **Timeline height**: fixed `220px` in portrait; resizable (drag handle) in landscape where it shares vertical space with the canvas.
- **Chrome**: dark, neutral, recessive — near-black panel backgrounds, subtle borders, monochrome labels. **No Syntax brand colors in the tool chrome.** No decorative gradients. No boxes within boxes — inspector sections use spacing and dividers, not nested bordered cards.
- **Tool accent palette** (three colors, used sparingly for interactive state only):
  - **Yellow `#FFD608`** — primary selection: selected clip bar outline ring, active row highlight in the outline gutter, focused input border.
  - **Cyan `#2DE8EE`** — playhead line across the timeline.
  - **Red `#E6322A`** — destructive actions only: remove / delete buttons, error states.
- **Canvas framing**: transparent overlays render over a **dark checkerboard** by default, with an optional **reference still / clip backdrop** so an overlay is judged over real footage as it'll be used; full-frame segments/bumpers fill the frame. Fit-to-window with zoom.
- **Canvas controls bar**: a thin toolbar strip between the canvas and the timeline-outline. Three clusters:
  - **Left** — transport: play/pause (and any future transport controls).
  - **Center** — current time / frame display.
  - **Right** — canvas-framing controls: **orientation toggle** (single icon-only button; icon shows the current state — horizontal or vertical composition rectangle; click to switch; no accent color needed, the icon geometry is the indicator), fit-to-window, zoom level readout, checkerboard / backdrop toggle.
  - The **scrubber drag line** stays in the timeline track area — it is a timing-edit interaction, not a playback control. Export stays in the inspector root (composition-level action, not canvas-framing). Canvas controls bar is kept lean; additional tools added here as the tool grows.

### 8. Preset picker — the home screen

A dedicated screen shown before the editor (and navigable back to from the editor). Shows two sections:

- **Starter templates** — corpus presets, read-only; clicking one opens the editor and fork-on-first-edit applies.
- **Your compositions** — user forks from the user store; clicking one opens the editor directly. Each fork shows a delete affordance (fork management). Rename may follow.

The back affordance in the editor lives in the **outline gutter header** — a slim row above the layer rows containing a back chevron and the composition name (`← [name]`). The inspector rail is purely a properties surface; nothing navigational lives there. No standalone top bar.

### 9. Inspector visual structure — sections not cards

Inspector sections are separated by **spacing + a single 1px divider with an inline all-caps label** (e.g. `TRANSPORT`, `PACK`, `ENTER`, `EXIT`) flush left — not bordered cards. Fields hang below with consistent left-edge alignment. Progressive disclosure via a plain chevron toggle on the section label. No expand/collapse animation, no nested borders.

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
- `TimelineTrackView` is redesigned from the current two-block enter/exit model to the **unified clip bar** (§2a): one bar per overlay layer, five drag handles, ramp zones integrated into the bar ends.
- A **DOM editing-overlay** over the scaled canvas (handles) + screen→4K→schema coordinate mapping, for position/scale.
- An **inspector shell** that dispatches per-type editors, including the root inspector (transport / Pack / Effects) and the per-Layer Sound-kit picker ([ADR-0033](0033-sound-design-motion-emitted-cues.md)).
- The **visual design** is specified (§7); the styling task (`uno1jth1`) builds it — no longer gated on a design pass.
- Tracked in dex; see [`roadmap.md`](../roadmap.md) § GUI design.
