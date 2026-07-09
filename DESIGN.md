---
name: Supers
description: A dead-neutral instrument deck — achromatic chrome where the only color on screen is a state light, so the canvas is the only picture.
colors:
  primary: "#E8E8EA" # instrument text — labels, values, icons
  muted: "#8A8A90" # secondary text — section labels, metadata, disabled
  neutral: "#131315" # the deck — default panel background
  neutral-recessed: "#0C0C0E" # wells — inputs, track area, canvas surround
  neutral-raised: "#1A1A1D" # lifted steps — clip bars, hover rows, buttons
  border: "#26262A" # hairlines — panel seams, dividers, input edges
  selection: "#FFD608" # yellow light — selected clip ring, active row, focused input border
  time: "#2DE8EE" # cyan light — the playhead line and nothing else
  danger: "#E6322A" # red light — destructive fills and icons, error states
  danger-text: "#F0453D" # AA-passing red for danger text on dark surfaces
  success: "#3DBF6E" # green light — completion only (export done, valid state)
typography:
  display:
    fontFamily: Archivo
    fontSize: 6rem
    fontWeight: 900
    lineHeight: 0.95
  section-label:
    fontFamily: Archivo
    fontSize: 0.72rem
    fontWeight: 600
    letterSpacing: 0.08em
  label:
    fontFamily: Archivo
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.3
  body-md:
    fontFamily: Archivo
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  value-mono:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 600
    lineHeight: 1.3
  timecode:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 600
    letterSpacing: 0.02em
rounded:
  sm: 2px
  md: 4px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  panel:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
  input:
    backgroundColor: "{colors.neutral-recessed}"
    textColor: "{colors.primary}"
    typography: "{typography.value-mono}"
    rounded: "{rounded.sm}"
    padding: 6px
  button:
    backgroundColor: "{colors.neutral-raised}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 6px
  button-danger:
    backgroundColor: "{colors.neutral-recessed}"
    textColor: "{colors.danger-text}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 6px
  button-danger-confirmed:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.neutral-recessed}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 6px
  clip-bar:
    backgroundColor: "{colors.neutral-raised}"
    rounded: "{rounded.sm}"
  section-label:
    textColor: "{colors.muted}"
    typography: "{typography.section-label}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  playhead:
    backgroundColor: "{colors.time}"
    width: 1px
  status-success:
    textColor: "{colors.success}"
    typography: "{typography.value-mono}"
---

## Overview

Supers chrome is a **dead-neutral instrument deck**. The tool is a
color-critical motion-graphics editor, so the chrome is strictly achromatic —
zero hue in any panel, border, or text — and recessive: the canvas is the only
picture, and the instrument lights are the only color on screen. The tonal
reference is DaVinci Resolve, but cleaner, more modern, more intentionally
designed — never a clone of its bevels and gray-on-gray button soup.

The distinctive angle: **color is never decoration; every hue on screen is a
state with exactly one meaning.** Yellow is selection. Cyan is time. Red is
danger. Green is completion. A screenshot of Supers is identifiable by its four
lights on an otherwise silent monochrome deck — like channel lights on
broadcast hardware.

**Scope:** this file governs the tool chrome (the GUI) only. The look of
rendered output is owned entirely by Packs (`docs/packs/<pack>/aesthetic.md`)
and must never inherit chrome tokens — and no Pack brand color may appear in
the chrome.

Built for two users with equal force: the design-literate GUI author, who gets
a dense precision instrument with no marketing gloss that gets out of the way;
and the repo agent, for whom every value here is committed and unambiguous —
there are no "designer's discretion" gaps to guess at.

## Colors

Achromatic neutrals plus four signal lights. The neutral ladder carries all
structure; the lights carry all state.

- **Primary `#E8E8EA`** — instrument text: labels, values, icons.
- **Muted `#8A8A90`** — secondary text: section labels, metadata, disabled states.
- **Neutral `#131315`** — the deck: default panel background.
- **Neutral-recessed `#0C0C0E`** — wells: inputs, the timeline track area, canvas surround.
- **Neutral-raised `#1A1A1D`** — lifted steps: clip bars, hovered rows, buttons.
- **Border `#26262A`** — hairlines: panel seams, section dividers, input edges.
- **Selection `#FFD608`** — the yellow light: selected clip bar outline ring,
  active row highlight in the outline gutter, focused input border. Never a fill
  behind text.
- **Time `#2DE8EE`** — the cyan light: the playhead line across the timeline,
  and nothing else.
- **Danger `#E6322A`** — the red light: destructive fills and icons, error
  states. For red *text* on dark surfaces use `danger-text #F0453D`, which
  clears WCAG AA.
- **Success `#3DBF6E`** — the green light: completion only. An export that
  finished, a state that validated. It reads as a status LED, not a
  celebration. Ordinary "working correctly" is silent — no green for defaults.

Each light has exactly one meaning and appears only in its role. There is no
info blue, no warning orange. Anything needing attention is red or plain text.

## Typography

Two voices, mirroring real hardware: **the label is engraved in sans, the
value is on the LCD in mono.**

- **Archivo** (400–600) is the structural voice — every UI label, button,
  section header, and prose string. Section labels are all-caps 600 with
  0.08em tracking.
- **JetBrains Mono 600** is the instrument voice, reserved strictly for values:
  timecodes, frame numbers, coordinates, numeric field inputs. If it isn't
  data, it isn't mono.
- **Archivo Black Italic (900)** is the display shout — the brand voice on the
  home screen and equivalent rare moments. It never appears inside the editor
  chrome at UI scale. The display voice carries one sanctioned color latitude:
  a brand moment may set a single hard-offset shadow in a signal hue (the
  wordmark's red offset). That is a compositional accent, not a state — the
  latitude never extends to editor chrome, to text at UI scale, or beyond the
  one shadow.
- **The spec plate** (the home screen's `4K / WEBGPU / ALPHA` stamp) is a
  sanctioned mono exception: it reads as a hardware data readout, not a label.
  It is set in muted, never in a signal hue.

The scale is compact and utilitarian: tight steps around a 13px working size,
no editorial jumps inside the tool. Hierarchy comes from weight, caps, and the
sans/mono voice split — not from size inflation.

## Layout

Dense and efficient. Three zones: canvas center, inspector rail right,
timeline-outline full-width at the bottom (ADR-0034). Spacing runs a 4px-based
scale (4/8/12/16/24); panels are load-bearing or absent. No top menu bar, no
left panel. Inspector sections separate with spacing plus a single 1px labeled
divider — fields hang below with consistent left-edge alignment.

## Elevation & Depth

Depth is expressed by **surface steps and hairline borders only**: recessed
wells (`#0C0C0E`) sit below the deck (`#131315`), lifted elements
(`#1A1A1D`) sit above it, and `#26262A` hairlines draw the seams. No drop
shadows, no glow, no blur. A surface's tone tells you its layer.

## Shapes

Sharp and architectural: 2px on small controls (inputs, buttons, clip bars),
4px on larger surfaces. Nothing rounder. No pills, no circles except where
geometry is the meaning (playhead grab handle, keyframe diamonds).

## Components

- **Inputs** are recessed wells with mono value text; focus is a 1px
  `selection` border — no glow ring.
- **Buttons** are quiet raised steps with sans labels; destructive actions are
  the same shape with `danger-text` text — red never shouts as a fill unless
  the action is confirmed-destructive.
- **Clip bars** are raised steps on the recessed track; the selected clip
  carries a 1px `selection` outline ring. Enter/exit ramps render as integrated
  gradient zones within the bar (the one sanctioned gradient — it encodes data,
  not decoration).
- **The playhead** is a 1px `time` line, full timeline height.

## Do's and Don'ts

- **Do** treat color as state: four lights, one meaning each — yellow
  selection, cyan time, red danger, green completion. If a hue appears in the
  chrome, it must be one of these doing its job.
- **Do** keep the two type voices honest: Archivo for structure, mono for
  data. Never set a label in mono or a value in sans.
- **Do** snap structural changes at 0ms — panel disclosure, selection,
  inspector swaps. Interactive feedback (hover, focus) may transition ≤120ms,
  opacity/border only, no transforms. Chrome that animates competes with the
  canvas.
- **Don't** ship the AI-tool neon gloss: no indigo/violet accents, no
  gradients (data-encoding ramp zones excepted), no glow shadows, no
  glassmorphism, no ✨ pills, no marketing copy inside the tool.
- **Don't** put hue in a neutral. Panels, borders, and text are achromatic —
  a tinted gray is a bug.
- **Don't** nest boxes in boxes. Sections are spacing + one labeled hairline
  divider, never bordered cards inside panels.
- **Don't** let Pack or Syntax brand colors into the chrome, or chrome tokens
  into rendered output.
- **Don't** add save buttons, refresh buttons, or text explaining the UI —
  autosave, always-fresh data, and self-evident controls are the contract.
