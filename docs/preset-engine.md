# Preset Engine

## Goal

Hiviz is one engine with many **surfaces** and a single shared **preset format**. Every preset is the same JSON document: shared transport/typography/marks blocks plus a discriminated `surface` block carrying only the content unique to that surface. One JSON Schema, one preset gallery, one storage namespace. Surface routes are just renderers — they read the engine's state, they don't own a parallel schema.

## Verification

Objective checks that prove the engine is real and not just plumbing:

1. Open the app root. A single **Presets** gallery lists built-in presets across all surfaces. Clicking a preset navigates to the matching surface route with state applied; the timeline scrubs the animation correctly.
2. Edit any state value on `/tools/research-paper`. Save preset → JSON file. Re-loading reproduces the exact same `Timeline.time` frame visually. Same test on `/tools/quote-focus`.
3. In a separate session, hand the AI:
   - `docs/presets/engine.schema.json` (one schema for everything), and
   - `docs/presets/engine.md` (one brief, with per-surface addenda).
   Provide only a one-line goal. The AI returns a valid preset that loads.
4. Take a research-paper preset, change `surface.type` to `quote-focus` and fill its required content fields. It loads and renders without touching the shared blocks. This is the "remix across surfaces" test that proves the engine is unified, not two siloed schemas.

## Concepts

- **Engine** — the shared substrate: transport (orientation/fps/duration/format), typography (font + ink/paper colors), annotation marks (defaults + timings), and the active surface. There is one `engineState` $state object, not one per tool.
- **Surface** — a discriminated variant: research-paper, quote-focus, tweet, webpage, etc. Each carries only what's unique to it (content fields + surface-specific timing/behavior). Code-level: each surface has its own pipeline, DOM source, and controls under `src/lib/tools/<surface>/`. State-level: it's just a branch in the union.
- **Annotation marks** — primitives in `src/lib/annotations/`. Already content-anchored via inline syntax (`==highlight==`, `__underline__`, `~~strike~~`, `((circle))`) embedded in the surface's body text. Styling (color/intensity) and timing (start/duration/ease) live in the shared `marks` block, indexed against the inline marks discovered in the active surface's content.
- **Preset** — one JSON document containing the whole `engineState`. Identified by a single versioned schema id (`hiviz@1`), not per-surface ids. Cross-surface remix is just editing `surface.type`.

## Unified state shape

```ts
// src/lib/platform/engine-state.ts
export interface EngineState {
  transport: Transport;
  typography: Typography;
  marks: MarksState;
  surface: SurfaceState;     // discriminated by .type
}

export interface Transport {
  orientation: VideoOrientation;   // from $lib/utils/video-frame
  durationSeconds: number;
  fps: number;
  format: ExportFormat;            // from $lib/platform/tool
}

export interface Typography {
  fontFamily: FontFamily;          // shared enum: 'serif' | 'sans' | 'mono' | 'condensed'
  paperColor: string;
  inkColor: string;
}

export interface MarksState {
  // Style-level defaults: used when a per-mark override is absent.
  defaults: Record<AnnotationMarkStyle, MarkAppearance>;
  // Index-aligned with inline marks discovered in surface content (in document order).
  // Missing entries fall back to defaults. Extra entries are ignored.
  timings: MarkTiming[];
}

export interface MarkAppearance { color: string; intensity: number; }
export interface MarkTiming {
  start: number;          // 0..1 fraction of duration
  duration: number;       // 0..1 fraction of duration
  ease: Ease;             // shared label: 'smooth' | 'settled' | 'sharp' | 'bouncy'
  color?: string;         // overrides defaults[style].color when present
  intensity?: number;     // overrides defaults[style].intensity when present
}

export type SurfaceState =
  | {
      type: 'research-paper';
      content: { title: string; sourceUrl: string; body: string };
      enter: Transition;
      exit: Transition;
    }
  | {
      type: 'quote-focus';
      content: { body: string; quote: string; author: string; source: string; dateLabel: string };
      focus: { start: number; duration: number; ease: Ease; style: QuoteFocusFocusStyle };
      mark:  { start: number; duration: number; ease: Ease; style: QuoteFocusMarkStyle };
      camera: 'none' | 'push' | 'snap';
      backgroundVisibility: number;
      showSourceMetadata: boolean;
    };

export interface Transition { start: number; duration: number; ease: Ease; }
```

The Zod schema mirrors this and is the single source of truth: `type EngineState = z.infer<typeof EngineStateSchema>`. Existing surface enums (`QuoteFocusFocusStyle`, `QuoteFocusMarkStyle`, `AnnotationMarkStyle`) move into this schema or are imported into it.

### What lives in shared vs surface

Shared blocks are the rule. A field only belongs in `surface` if it would be meaningless on at least one other surface. Concrete examples from today's code:

| Field                              | Today's location                       | New location          |
|------------------------------------|----------------------------------------|-----------------------|
| `orientation`, `fps`, `duration`   | duplicated in both tool states         | `transport`           |
| `fontFamily`, `paperColor`, `inkColor` | duplicated                          | `typography`          |
| quote-focus `highlightColor`, `markColor` | surface-specific                | `marks.defaults`      |
| research-paper `animation.marks[]` | surface-specific                       | `marks.timings`       |
| research-paper `title`, `sourceUrl`, `body` | surface-specific              | `surface.content`     |
| research-paper paper `enter`, `exit` | surface-specific                     | `surface.enter/exit`  |
| quote-focus `focusStyle`, `cameraMotion`, `backgroundVisibility` | surface-specific | `surface.*`     |

After this refactor neither `researchPaperState` nor `quoteFocusState` exist as separate $state objects. Everything reads `engineState.transport`, `engineState.surface.content`, etc.

## Architecture

### New platform files

- `src/lib/platform/engine-state.ts`
  Exports `engineState: EngineState` (module-level `$state`), the Zod schema, and the shared enums (`Ease`, `FontFamily`, font/ease label maps moved here from the per-tool state files).

- `src/lib/platform/preset.ts`
  Types and storage. Exports:
  - `Preset` shape: `{ schema: 'hiviz@1'; name: string; description?: string; state: EngineState }`
  - `parsePreset(json: unknown): Preset` — validates with the Zod schema; throws readable errors
  - `applyPreset(preset: Preset): void` — mutates `engineState` in place (walks and assigns; never replaces the reference; uses `structuredClone` on nested preset objects so external references can't leak)
  - `serializeCurrentPreset(name: string, description?: string): Preset` — snapshot
  - `loadUserPresets()` / `saveUserPreset(preset)` / `deleteUserPreset(id)` — `localStorage` under `hiviz:presets`
  - `importPresetFile(file)` / `exportPresetFile(preset)` — `.json` round-trip
  - `surfaceRoute(surface: SurfaceState['type']): string` — `'research-paper' → '/tools/research-paper'`. Used by the gallery on apply.

- `src/lib/platform/PresetGallery.svelte`
  One UI component. Renders built-ins, user presets, and the save/import/export actions. Lives in the app shell (root `+layout.svelte` action slot or sidebar), not per-tool.

### Surface tool modules

Existing surface tool modules stay where they are (`src/lib/tools/research-paper/`, `src/lib/tools/quote-focus/`). They lose their own state file and instead **read from `engineState` directly**. Per the project rule: components own their data; if state is in a global manager, read it where it's used.

- Replace `researchPaperState` and `quoteFocusState` with helpers in each surface's module that narrow `engineState.surface` to the expected variant and throw if the active surface doesn't match. Routes only mount when the surface type matches (see Routing below).
- Pipelines, controls, and canvas-source components import the typed-narrowed view, not a parallel state object.

### Built-in presets

```
src/lib/presets/
  research-paper-default.json
  research-paper-critique.json
  quote-focus-default.json
  quote-focus-lift-out.json
  ...
```

One folder, one flat list. Imported via Vite glob in the gallery component. The surface a preset targets is whatever its `state.surface.type` says.

### Routing

Surface routes survive (`/tools/research-paper`, `/tools/quote-focus`) because each surface has a distinct pipeline and controls panel. The gallery navigates to the matching route on apply via `surfaceRoute(preset.state.surface.type)`.

Each surface route guards on mount: if `engineState.surface.type` doesn't match, redirect to that surface's route. This keeps the route ↔ surface invariant simple and lets the gallery live at the app root.

A surface picker (cycle through surfaces with default content) is a separate, optional UI primitive; the gallery itself is enough to ship.

## Preset format (single, unified)

```json
{
  "schema": "hiviz@1",
  "name": "Critique pass",
  "description": "Two highlights and a circle, settled ease.",
  "state": {
    "transport": { "orientation": "horizontal", "durationSeconds": 6, "fps": 30, "format": "webm" },
    "typography": { "fontFamily": "serif", "paperColor": "#ffffff", "inkColor": "#000000" },
    "marks": {
      "defaults": {
        "highlight": { "color": "#ffd642", "intensity": 0.62 },
        "underline": { "color": "#1f5aff", "intensity": 0.62 },
        "strike":    { "color": "#de263a", "intensity": 0.62 },
        "circle":    { "color": "#de263a", "intensity": 0.62 }
      },
      "timings": [
        { "start": 0.34, "duration": 0.24, "ease": "smooth" },
        { "start": 0.58, "duration": 0.22, "ease": "settled", "color": "#de263a" }
      ]
    },
    "surface": {
      "type": "research-paper",
      "content": {
        "title": "Attention Is All You Need",
        "sourceUrl": "https://arxiv.org/abs/1706.03762",
        "body": "...with ==marks== and ((circles)) inline..."
      },
      "enter": { "start": 0,    "duration": 0.18, "ease": "settled" },
      "exit":  { "start": 0.82, "duration": 0.18, "ease": "smooth" }
    }
  }
}
```

Remixing across surfaces is mechanical: swap `surface` for any other variant; the shared blocks carry over untouched.

## AI authoring contract

Exactly two files exposed to the AI:

- `docs/presets/engine.schema.json` — JSON Schema exported from the Zod schema (one file, all surfaces). Generated by `scripts/export-preset-schema.ts`; committed.
- `docs/presets/engine.md` — one human-language brief: what the shared blocks mean, what each surface is for, and the inline mark syntax convention. Per-surface sections are ≤ ½ page each.

The AI does not read code. Schema + brief + goal in, valid `Preset` out. Validation rejects invalid presets at load with readable errors.

## Migration plan

Sequencing matters because the refactor touches both existing tool state files.

1. **Land the unified schema.** Create `engine-state.ts`, Zod schema, `preset.ts`, `PresetGallery.svelte`. No surface uses any of it yet. Verifies type compiles and the engine state shape is acceptable.
2. **Migrate research-paper to read `engineState`.** Delete `researchPaperState`; replace internal references with narrowed reads from `engineState.surface` (typed-guarded to `{ type: 'research-paper', ... }`). Pipeline, controls, and canvas source compile and render. Visual parity check with main.
3. **Migrate quote-focus the same way.** Delete `quoteFocusState`. Same parity check.
4. **Built-in presets and gallery.** Drop two or three built-in presets per surface into `src/lib/presets/`. Mount `PresetGallery` in the app shell. Run the four verification checks above.
5. **Export the schema and brief.** Write `scripts/export-preset-schema.ts`; commit generated `docs/presets/engine.schema.json` and hand-write `docs/presets/engine.md`. Run the AI-authoring verification.
6. **New surfaces (tweet, webpage, timeline-explainer)** start by adding a variant to `SurfaceState` and a pipeline + controls module. They never define their own state file.

Steps 2 and 3 are the biggest pieces of actual refactor — the rest is additive.

## Out of scope (explicit non-goals)

- **Cross-tool "morphing" presets at runtime.** Switching `surface.type` is a content edit, not a continuous transition. No animated surface swap.
- **Coordinate-anchored marks.** Inline syntax stays the only addressing model.
- **Cloud sync.** `localStorage` + `.json` only.
- **Versioned schema migration UI.** A future `hiviz@2` runs migrations internally; users never see version numbers.

## Risks and watch-items

- **`marks.timings` length mismatch with inline marks in content.** If a preset has fewer timings than marks in the body, fall back to `marks.defaults`. If more, extras are ignored. Both are silent and intentional; surface this clearly in `engine.md` so AI doesn't try to "fix" missing timings by inventing them.
- **Discriminated narrowing.** Surface modules must narrow `engineState.surface` with an exhaustive check; throw on mismatch rather than rendering with undefined fields. The route guard prevents this in practice but the narrowing must still be defensive.
- **Identity-mutating apply.** `applyPreset` walks and assigns into `engineState`; replacing references would break every `$effect`. Worth a unit test that asserts the object identity is preserved through an apply.
- **Built-in count discipline.** Three to five per surface. Beyond that, the schema is probably too narrow and variants want to be content edits, not separate presets.
- **Removing per-tool state is a load-bearing change.** Every reference in surface tool modules to `researchPaperState.x` or `quoteFocusState.x` becomes a typed read off `engineState`. Land step 2 and step 3 as their own PRs with a visible parity comparison; don't bundle.
