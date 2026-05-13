# Hiviz Preset Engine

Hiviz produces transparent-background overlay videos by animating a single shared engine state. A **preset** is one JSON document that describes that state. Every preset uses the same schema id (`hiviz@1`) and the same outer shape; surfaces are distinguished by the `surface.type` discriminator.

The companion JSON Schema at `engine.schema.json` is the authoritative contract. This brief is the human-language gloss.

## Shape

```json
{
  "schema": "hiviz@1",
  "name": "Short title",
  "description": "Optional one-line description.",
  "state": {
    "transport":  { /* video frame, duration, fps, output format */ },
    "typography": { /* font family, paper color, ink color */ },
    "marks":      { /* shared mark palette + per-mark timings */ },
    "surface":    { /* discriminated by `type`; carries content + surface-specific timing */ }
  }
}
```

Anything that would be meaningful on more than one surface lives in the shared blocks. Anything truly unique to a surface lives in `surface`.

## Shared blocks

### `transport`

- `orientation`: `"horizontal"` or `"vertical"` (both export at 4K).
- `durationSeconds`: total animation length (0.1–600).
- `fps`: frames per second (integer, 1–120). Defaults to 30.
- `format`: `"webm"` (VP9 with alpha) or `"prores"` (ProRes 4444 MOV with alpha).

### `typography`

- `fontFamily`: `"serif"`, `"sans"`, `"mono"`, or `"condensed"`.
- `paperColor`: page background, `#rrggbb` hex.
- `inkColor`: text and primary stroke color, `#rrggbb` hex.

### `marks`

A shared palette plus per-mark timings. The palette applies to all surfaces; the timings are only meaningful when the active surface places inline marks (today, only `research-paper`).

- `defaults`: an entry for each of `highlight`, `underline`, `strike`, `circle`, each with `{ color, intensity }`. `intensity` is a 0–1 fraction.
- `timings`: an array, **indexed in document order against the inline marks discovered in the active surface's body text**. Each entry has `start`, `duration`, `ease`, and optional `color`/`intensity` overrides:
  - `start`, `duration`: 0–1 fractions of the total animation duration.
  - `ease`: `"smooth"`, `"settled"`, `"sharp"`, or `"bouncy"`.
  - `color`, `intensity`: optional. If absent, fall back to `defaults[markStyle]`.

If a preset has **fewer** timings than the body contains inline marks, the missing entries fall back to defaults — this is intentional, do not invent timings to "pad" the array. If a preset has **more** timings than marks, the extras are silently ignored.

## Body text and inline marks

A surface body is a single string. Paragraphs are separated by a blank line (`\n\n`). Marks are anchored inline with named tags:

- `[highlight]text[/highlight]`
- `[underline]text[/underline]`
- `[strike]text[/strike]`
- `[circle]text[/circle]`

```json
"body": "The Transformer reaches [highlight]state of the art[/highlight] in twelve hours."
```

The order in which inline marks appear (paragraph-major, then left to right) determines the index used into `marks.timings`. Marks do not nest; if you need overlapping decoration, split the run into adjacent marks.

## Surfaces

Exactly one surface is active at a time. The `surface.type` field discriminates the variant; the other surface keys are forbidden when not active. Switching `surface.type` (and supplying the appropriate content + timing) is how you remix the same shared blocks across tools.

### `surface.type: "research-paper"`

A paper-shaped DOM card flies into the frame, body text is rendered with inline marks, and marks animate on according to `marks.timings`.

- `content.title`: paper title shown in the header.
- `content.sourceUrl`: source URL (rendered as a small "from <host>" line).
- `content.body`: prose body with inline mark tags (see "Body text and inline marks" above). The order of inline marks determines the index used into `marks.timings`.
- `enter`: when the paper card moves into frame. `{ start, duration, ease }` (0–1 fractions, plus an ease label).
- `exit`: when the paper card moves out of frame.

### `surface.type: "quote-focus"`

A short prose block where one quoted span is isolated and decorated. The quoted span is identified by **the first inline mark in the body** — any tag works (`[highlight]`, `[underline]`, `[strike]`, `[circle]`); only its location is used, not its visual style. `marks.timings` is unused by this surface (leave it `[]`).

- `content.body`: prose body containing one inline mark indicating the focused span (see "Body text and inline marks" above).
- `content.author`, `content.source`, `content.dateLabel`: optional attribution fields.
- `focus.start`, `focus.duration`, `focus.ease`: when the focus effect engages.
- `focus.style`: `"highlight" | "magnify" | "isolate" | "lift-out" | "tear-out"`.
- `mark.start`, `mark.duration`, `mark.ease`: when the decoration mark engages.
- `mark.style`: `"none" | "underline" | "box" | "circle" | "side-note"`.
- `camera`: `"none" | "push" | "snap"` (subtle camera move during the animation).
- `backgroundVisibility`: 0–1; how visible non-quoted body remains during focus.
- `showSourceMetadata`: boolean; whether attribution is rendered.

For quote-focus the mark color is read from `marks.defaults.circle` when `mark.style` is `"circle"`, and from `marks.defaults.underline` otherwise.

## Cross-surface remix

To convert one preset into another:

1. Keep `transport`, `typography`, and `marks` untouched.
2. Replace `surface` wholesale with the new variant.
3. Make sure the new variant's required content fields are filled.

The shared blocks carry over. Anything you do not need on the target surface is simply absent from the new `surface` block.

## Validation

Presets are validated at load with the JSON Schema in `engine.schema.json`. Invalid presets fail loudly with a path-indexed error rather than silently rendering with missing fields. Do not invent fields; do not omit required ones; do not include surface fields that belong to a different `surface.type`.
