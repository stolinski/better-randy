# ADR-0040 — Checklist: a half-frame progress-tracker Surface

## Status

**Canon (v1 built).**

Date: 2026-07-14
Builds on: [ADR-0031](0031-imessage-interactive-surface.md) (ordered-list content shape = its own Surface), [ADR-0037](0037-imessage-chrome-mode.md) (`chrome` mode on a Surface), [ADR-0015](0015-identity-spec-per-pipeline.md) (Identity Spec)

## Context

A creator block: the video's agenda on screen as a numbered checklist occupying half the frame beside the talking-head footage, items struck through by a red marker as the creator completes them on camera — the animated strike is the recurring completion beat. Each item must be **manually checkable** with two completed registers: **statically struck** (done before the shot opens) and **animated** (the strike draws through mid-clip on cue).

Two things make this a Surface, not a `paper` Preset — the same reasoning as ADR-0031:

1. **Content shape.** A checklist is an *ordered list of items, each with its own completion state* (`text`, `checked`, an optional strike window) — a shape the single-`body` bracket-tag model can't carry. Numbering hand-typed into a body string, checked state as `[strike]` tags, and static-vs-animated as `marks.timings[]` hacks all collapse the GUI story ("check an item off" must be a toggle, not a bracket-tag edit).
2. **Per-item timeline identity.** Every animated check-off is its own draggable clip (`checklist-{index}` rows), the way iMessage bubbles are per-message clips.

## Decision

A new **`checklist` Surface** (`SurfaceTypeSchema` member; `content.items: ChecklistItem[]`).

- **Content model.** `ChecklistItem = { text, checked, strike?: { start, duration, ease?, sound? } }`. `checked: true` with **no** window = **static** (the rule is fully drawn from frame 0 — no draw-on, no sound cue). `checked: true` **with** a window = **animated** (the rule stroke-draws over that window; the item's ink dims toward quiet as it lands). Unchecked = no rule; the GUI strips a stale window on uncheck. The panel heading reuses `content.title`.
- **The strike is the existing `strike` Annotation, not new drawing code.** The CanvasSource wraps each checked item's text in a `data-annotation-mark="strike"` span; the reused `paper` compositor (`substrate: 'flat'`, the iMessage option) draws the rule with the mark tool's hand physics — pressure variation, overshoot past the last glyph, seeded wobble. **Deliberate Syntax deviation, recorded in the Preset description:** hand energy lands on chrome here because the check-off is the block's emotional payload; a mechanical rule reads as a spreadsheet. Bounded: the card plate, border, shadow, type, and numbers all stay flat.
- **Timing lives on the item, carried through `MarkInstance`.** `listMarkInstances` emits one `strike` instance per checked item with `window: item.strike ?? 'static'` (+ the item's `sound`, + `itemIndex`). Consumers branch on it: the animation manifest pins static strikes to progress 1 and tweens animated ones over their authored window (`power1.inOut`, the pen-drag craft rule); appearance resolution skips `marks.timings[]` via the out-of-range-index idiom (item marks never consume timing entries); sound derivation emits a `scratch` cue at the item's own window (static = silent); the timeline builds `checklist-{index}` rows whose drag writes back to `item.strike` — dragging a *static* item's bar materializes the window (static→animated by direct manipulation).
- **`chrome: 'window' | 'none'` reused (ADR-0037's field, second consumer).** `'window'` (absent) = the flat channel card — plate/border/radius/stepped-shadow resolved from the Pack (`checklist.plate/.border/.radius/.shadow`, specific → core). `'none'` = bare numbered type floating on footage, each row carrying a hard no-blur offset legibility shadow (`--textShadow`). The stored values stay `window`/`none`; only the inspector label differs ("Card" for checklist).
- **Half-frame layout, orientation-aware.** Horizontal: a 38%-width column at left 56% (footage lives left), vertically centered. Vertical: an 86%-width panel from 52% of frame height (clear of the bottom caption band). Stable layout: every row reserves its space from frame 0, so rules stay pinned as check-offs land.
- **Frame-determinism.** The done-dim and strike progress are pure functions of the timeline (`strikeProgressAt` in `schedule.ts`; manifest tweens scrubbed by progress). Preview == export.
- **GUI parity (ADR-0032).** SurfaceInspector **Checklist** section (declared via `controls.items`): per-item text, checked toggle, Static/Animated select, add/remove; canvas item rows are click-to-select hit regions (`checklist-{index}` → inspector reveal, the bubble pattern); animated strikes surface on the Sound rail (`mark:{n}` cues) and in the Sound section.

## Considered options

- **A Preset on `paper` with `[strike]` marks** — rejected: no per-item checked model, numbering as copy, static strikes as zero-duration timing hacks, no half-frame claim, and check-off = editing bracket tags (GUI parity failure).
- **Strike drawn in the DOM (SVG/border line)** — rejected: duplicates the strike tool's physics badly (and CSS approaches capture poorly); the marks canvas already draws exactly this rule with the right identity, and reuse keeps one strike identity engine-wide.
- **Item strikes as `marks.timings[]` entries** — rejected: fragile document-order index coupling between checked items and timing entries; toggling an item would splice a parallel array; static-vs-animated has no honest representation there.
- **A `checklist` chrome enum of its own (`card | bare`)** — rejected: it duplicates ADR-0037's mode with new stored values; reusing `window | 'none'` keeps one field, one inspector control, and pre-existing semantics ("`none` = chromeless over footage") — only the label is per-surface.

## Consequences

- `items` joins `site` / `messages` / `chrome` as a Surface-specific content field ignored by every other Surface — the accepted ADR-0030/0031 asymmetry.
- `MarkInstance` gained optional `window` / `sound` / `itemIndex`; body/message marks are untouched (fields absent → every consumer takes its existing path).
- The syntax manifest carries the `checklist.*` Roles (plate, ink, accent, border, radius, stepped shadow, fonts, textShadow, edge/depth/light); secondary Packs ride core fallback per ADR-0024, with the CanvasSource's form fallbacks keeping a colour-only Pack sane.
- v1 ships `checklist-project-setup` (H) as the verification Preset. Open follow-up: a vertical-orientation deliverable.

## Amendment (2026-07-14) — per-item build-in entrance

Added an optional per-item `enter` window (`ChecklistItem.enter: { start, duration, ease? }`) so a checklist can **build in** — each item reveals on its own staggered schedule (opacity + slide-from-right, easeOutBack overshoot), a rundown laid out live. Absent `enter` keeps the original behaviour (present from the block entrance). Layout stays stable (every row reserves its space — a later-building item never shoves an earlier one; the iMessage reserved-space precedent). The reveal is DOM-driven in the CanvasSource (`itemReveal` off `globalProgress`, frame-deterministic), not a manifest tween — the same lane as the done-dim.

Timeline: the checklist item rows were refactored to source from `items[]` directly (not from mark instances), so one `checklist-{index}` row now carries both the item's **entrance clip** (`item.enter`) and its **strike clip** (`item.strike`) as draggable transitions — the strike still *draws* via the marks manifest, only its row moved. GUI parity: a per-item **Build in** toggle (materializes the default staggered `enter`, timed on the timeline). Ships `checklist-show-rundown` (H) — five items building in one at a time, none struck.

## Amendment (2026-07-15) — optional uploaded logo

`checklist` content may carry `logoUrl`, using the same local uploaded-image URL contract as other authorable image slots. When present, the logo replaces the text title and renders large inside a white circular chip; image failure falls back to the title. The white field is deliberate faithful-mark framing rather than Pack chrome: uploaded marks need a stable neutral contrast field across Packs and footage grades. In `chrome: "none"`, the chip retains the same hard-offset legibility shadow as bare checklist text. The Inspector owns upload/clear and the field round-trips through the shared Preset schema.
