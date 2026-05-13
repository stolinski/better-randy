# Preset Engine

> **Status: current.** Describes the engine and preset format as shipped today. The forward-looking architecture (layered rendering, primitives, post-process effects) is in [`surfaces-and-annotations.md`](./surfaces-and-annotations.md); the migration from this state to that one is sequenced there.

## Goal

Hiviz is one engine with two surfaces (`research-paper` and `quote-focus`) and a single shared **preset format**. Every preset is the same JSON document: shared `transport` / `typography` / `marks` blocks plus a discriminated `surface` block carrying only the content unique to that surface. One Zod schema, one JSON Schema export, one preset catalog loaded at build time.

Surface routes are gone. The whole app is two routes:

- `/` — preset listing.
- `/p/[slug]` — apply a preset and mount the workspace for its `surface.type`.

## Concepts

- **Engine** — the shared substrate: transport (orientation / fps / duration / format), typography (font + paper/ink colors), annotation marks (defaults palette + per-mark timings), and the active surface. There is one `engineState` `$state` object in `src/lib/platform/engine-state.svelte.ts`.
- **Surface** — a discriminated variant of `engineState.surface`. Two today: `research-paper` and `quote-focus`. Each variant carries the content fields and surface-specific timing/style it needs. Code-level: each surface owns a `Workspace.svelte` + a pipeline + a canvas-source under `src/lib/tools/<surface>/`. State-level: it is just a branch in the union.
- **Annotation marks** — primitives in `src/lib/annotations/`. Body text is the only addressing surface: a span of text is marked by wrapping it in `[<style>]…[/<style>]` delimiters in the preset JSON. The four styles are `highlight`, `underline`, `strike`, `circle`. The wrapping is parsed into structured `AnnotationBody` segments by Zod on preset load; everywhere downstream operates on the structured form.
- **Preset** — one JSON document containing the whole `engineState`, plus an envelope. Identified by `schema: "hiviz@1"`.

## Verification

Objective checks that prove the engine is real:

1. Open `http://localhost:5173/`. The listing shows all six built-in presets across both surfaces. Each row is a real `<a href="/p/<slug>">` link.
2. Click a preset. The route navigates to `/p/<slug>`. The matching surface's `Workspace` mounts. The Timeline scrubber renders and scrubs the animation correctly.
3. Hand an AI:
   - `docs/presets/engine.schema.json` (one schema for everything),
   - `docs/presets/engine.md` (one human-language brief).
   Provide only a one-line goal. The AI returns a valid preset JSON that, dropped into `src/lib/presets/`, loads at `/p/<filename-without-extension>`.
4. Take any research-paper preset, change `surface.type` to `quote-focus`, fill in the required `surface.*` content + timing fields, and drop it back in. It loads and renders without touching the shared blocks. This is the "remix across surfaces" test that proves the engine is unified.

## Unified state shape

The runtime state shape lives in `src/lib/platform/engine-schema.ts` (pure TS — types + Zod) and `src/lib/platform/engine-state.svelte.ts` (the `$state` runtime + a few state-coupled helpers).

```ts
// src/lib/platform/engine-schema.ts
export interface EngineState {
  transport: Transport;
  typography: Typography;
  marks: MarksState;
  surface: SurfaceState; // discriminated by .type
}

export interface Transport {
  orientation: VideoOrientation; // 'horizontal' | 'vertical'
  durationSeconds: number;
  fps: number;
  format: ExportFormat; // 'webm' | 'prores'
}

export interface Typography {
  fontFamily: FontFamily; // 'serif' | 'sans' | 'mono' | 'condensed'
  paperColor: string; // #rrggbb
  inkColor: string; // #rrggbb
}

export interface MarksState {
  // Palette used as the default appearance for each mark style.
  // A per-mark override on a `MarkTiming` wins when present.
  defaults: Record<AnnotationMarkStyle, MarkAppearance>;
  // Index-aligned with marked spans discovered in the active surface's body,
  // in document order. Missing trailing entries fall back to `defaults[style]`.
  // Extra entries are silently ignored.
  timings: MarkTiming[];
}

export interface MarkAppearance {
  color: string; // #rrggbb
  intensity: number; // 0..1
}

export interface MarkTiming {
  start: number; // 0..1 fraction of duration
  duration: number; // 0..1 fraction of duration
  ease: Ease; // 'smooth' | 'settled' | 'sharp' | 'bouncy'
  color?: string; // overrides defaults[style].color when present
  intensity?: number; // overrides defaults[style].intensity when present
}

export type AnnotationMarkStyle = 'highlight' | 'underline' | 'strike' | 'circle';

export type SurfaceState =
  | {
      type: 'research-paper';
      content: {
        title: string;
        sourceUrl: string;
        body: AnnotationBody; // parsed from a `[style]…[/style]` string in JSON
      };
      enter: Transition;
      exit: Transition;
    }
  | {
      type: 'quote-focus';
      content: {
        body: AnnotationBody; // parsed from a `[style]…[/style]` string in JSON
        author: string;
        source: string;
        dateLabel: string;
      };
      focus: { start: number; duration: number; ease: Ease; style: QuoteFocusFocusStyle };
      mark: { start: number; duration: number; ease: Ease; style: QuoteFocusMarkStyle };
      camera: 'none' | 'push' | 'snap';
      backgroundVisibility: number; // 0..1
      showSourceMetadata: boolean;
    };

export interface Transition {
  start: number;
  duration: number;
  ease: Ease;
}

export type QuoteFocusFocusStyle =
  | 'highlight'
  | 'magnify'
  | 'isolate'
  | 'lift-out'
  | 'tear-out';
export type QuoteFocusMarkStyle = 'none' | 'underline' | 'box' | 'circle' | 'side-note';

// AnnotationBody = AnnotatedTextParagraph[]
// AnnotatedTextParagraph = { segments: { text: string; markStyle: AnnotationMarkStyle | null }[] }
```

### Body shape on disk vs at runtime

On disk (in preset JSON), `body` is a **string** with markdown-ish delimiters:

```
The Transformer reaches [highlight]a new state of the art[/highlight] in twelve hours.
```

Recognised delimiters: `[highlight]…[/highlight]`, `[underline]…[/underline]`, `[strike]…[/strike]`, `[circle]…[/circle]`. Paragraph boundary is a blank line (`\n\n`).

At runtime, `body` is `AnnotationBody` — the structured form. Zod's `transform` parses the string into segments on preset load (`PresetSchema.parse`), and the editor + canvas source operate on the structured form directly. `serializeAnnotationBodyToText` in `src/lib/annotations/annotation-body-text.ts` reverses the transform when writing JSON.

### What lives in shared vs surface

The rule is: a field belongs in a shared block (`transport`, `typography`, `marks`) unless it would be meaningless on at least one other surface.

| Field | Location |
|---|---|
| `orientation`, `fps`, `durationSeconds`, `format` | `transport` (shared) |
| `fontFamily`, `paperColor`, `inkColor` | `typography` (shared) |
| Per-mark color/intensity defaults | `marks.defaults` (shared) |
| Per-marked-span timing (start/duration/ease, optional color/intensity override) | `marks.timings` (shared) |
| Paper card title, source URL, body | `surface.content` (research-paper) |
| Paper card enter / exit transitions | `surface.enter` / `surface.exit` |
| Quote-focus body + attribution | `surface.content` (quote-focus) |
| Quote-focus focus style + timing | `surface.focus` |
| Quote-focus mark style + timing | `surface.mark` |
| Quote-focus camera + bg visibility + attribution toggle | `surface.{camera,backgroundVisibility,showSourceMetadata}` |

Neither `researchPaperState` nor `quoteFocusState` exists as a separate `$state` object. Everything reads `engineState` directly.

## Architecture

### Platform files

- `src/lib/platform/engine-schema.ts` — pure TS. Zod schema, types, shared enums (`Ease`, `FontFamily`, `ENGINE_EASES`, `ENGINE_FONT_FAMILIES`, `*_OPTIONS`), default builders, type guards (`isResearchPaperSurface`, `isQuoteFocusSurface`), `resolveMarkForIndex`. Also exports `PresetSchema` and `PRESET_SCHEMA_ID = 'hiviz@1'`.
- `src/lib/platform/engine-state.svelte.ts` — runtime. `engineState = $state(createDefaultEngineState())` plus state-coupled helpers: `getResearchPaperSurface()`, `getQuoteFocusSurface()`, `getQuoteFocusMarkAppearance()`, `ensureMarkTimingAtIndex(i)`, `EDITOR_MARK_COLORS`. The narrowing helpers throw if the active surface is the wrong variant (the `/p/[slug]` route's conditional mount prevents this in practice).
- `src/lib/platform/preset.ts` — no localStorage. No save/import/export. Just:
  - `listPresets(): readonly CataloguedPreset[]` — built-in presets keyed by slug, ordered by `preset.name`.
  - `getPresetBySlug(slug): Preset | null` — lookup.
  - `parsePreset(json): Preset` — validates via Zod; throws with a path-indexed error string.
  - `applyPreset(preset): void` — walks `preset.state` and assigns primitives into `engineState` in place, preserving `engineState` identity. For `surface`, replaces the whole `engineState.surface` reference with a freshly cloned plain object (Svelte 5 deep-wraps it on assignment). Avoids `structuredClone` on proxies, which would trigger `state_proxy_equality_mismatch` warnings.
- `src/lib/platform/ToolRunner.svelte` — mounts a surface's `Tool` (GPU host + pipeline + Timeline + workspace chrome). Receives the surface-specific `Tool` instance from the per-surface `Workspace.svelte` component.

### Surface tool modules

Each surface owns a directory under `src/lib/tools/<surface>/` with:

- `<surface>-tool.svelte.ts` — exports the `Tool` instance (transport getter pointing at `engineState.transport`, factory for the pipeline, render-input builder, track builder, animation manifest builder, export hook).
- `<surface>-pipeline.ts` — WGSL/TypeGPU rendering. Reads structured inputs; never reads `engineState` directly.
- `<surface>-animation.svelte.ts` — GSAP animation state + manifest builder.
- `<surface>Workspace.svelte` — wraps `ToolRunner` with the surface's `CanvasSource`, `Controls`, and `TrackInspector` snippets.
- `<surface>CanvasSource.svelte` — the HTML/CSS layout rendered inside the `<canvas layoutsubtree>`. Emits `<span data-annotation-mark="<style>">` for marked segments so the pipeline can find them via `getClientRects`.
- `<surface>Controls.svelte` — content + appearance form fields. Reads/writes `engineState` directly (no prop drilling).
- `<surface>TrackInspector.svelte` — per-track selection-driven controls. Mounts in `ToolRunner`'s `trackInspector` snippet.

Existing surface modules: `src/lib/tools/research-paper/` and `src/lib/tools/quote-focus/`.

### Built-in presets

```
src/lib/presets/
  research-paper-attention.json
  research-paper-critique.json
  research-paper-vertical.json
  quote-focus-lift-out.json
  quote-focus-isolate.json
  quote-focus-magnify.json
```

One folder, one flat list. Loaded at build time via `import.meta.glob<'$lib/presets/*.json'>(...)` in `preset.ts`. Slug = filename without `.json`.

### Routing

```
/                     # +page.svelte — preset listing (anchors to /p/<slug>)
/p/[slug]             # +page.svelte — applies preset by slug, dispatches to surface workspace
+layout.svelte        # global "Hiviz" home link
```

`/p/[slug]/+page.svelte` reads `page.params.slug`, calls `getPresetBySlug`, calls `applyPreset` once per slug change (via a `$effect` guarded by a `lastAppliedSlug` field), then conditionally mounts `<ResearchPaperWorkspace>` or `<QuoteFocusWorkspace>` based on `engineState.surface.type`. Unknown slug renders a "Preset not found" page with a link home.

There is no `/tools/...` route. The old surface-specific routes were deleted when the gallery / `/p/[slug]` design landed.

## Preset format

Top-level envelope:

```json
{
  "schema": "hiviz@1",
  "name": "Critique pass",
  "description": "Three marks on a methodology paragraph.",
  "state": { /* EngineState */ }
}
```

Concrete research-paper preset (excerpt; trimmed for brevity):

```json
{
  "schema": "hiviz@1",
  "name": "Critique pass",
  "description": "…",
  "state": {
    "transport": { "orientation": "horizontal", "durationSeconds": 7, "fps": 30, "format": "webm" },
    "typography": { "fontFamily": "serif", "paperColor": "#fdf9f1", "inkColor": "#111111" },
    "marks": {
      "defaults": {
        "highlight": { "color": "#ffd642", "intensity": 0.7 },
        "underline": { "color": "#1f5aff", "intensity": 0.68 },
        "strike":    { "color": "#de263a", "intensity": 0.62 },
        "circle":    { "color": "#de263a", "intensity": 0.62 }
      },
      "timings": [
        { "start": 0.18, "duration": 0.22, "ease": "smooth" },
        { "start": 0.4,  "duration": 0.2,  "ease": "settled" },
        { "start": 0.62, "duration": 0.22, "ease": "sharp", "color": "#de263a" }
      ]
    },
    "surface": {
      "type": "research-paper",
      "content": {
        "title": "Methodology, with questions",
        "sourceUrl": "https://arxiv.org/abs/1706.03762",
        "body": "We trained the model on the standard WMT 2014 English-German dataset…\n\nFor each task we used the [highlight]base Transformer model[/highlight] without any task-specific tuning, relying on [underline]attention dropout[/underline] and label smoothing instead.\n\nResults on the WMT 2014 [circle]English-to-German[/circle] translation task are reported using BLEU."
      },
      "enter": { "start": 0,    "duration": 0.18, "ease": "settled" },
      "exit":  { "start": 0.84, "duration": 0.16, "ease": "smooth" }
    }
  }
}
```

Concrete quote-focus preset (excerpt):

```json
{
  "schema": "hiviz@1",
  "name": "Magnify with side note",
  "description": "…",
  "state": {
    "transport": { "orientation": "horizontal", "durationSeconds": 8, "fps": 30, "format": "webm" },
    "typography": { "fontFamily": "serif", "paperColor": "#ffffff", "inkColor": "#111111" },
    "marks": {
      "defaults": { /* … all four styles … */ },
      "timings": []
    },
    "surface": {
      "type": "quote-focus",
      "content": {
        "body": "Software engineering is more like gardening than building. … [highlight]The work that lasts is the work that responds gracefully to weather you did not predict[/highlight], and the work that fails is the work that demands the weather to behave.",
        "author": "Notebooks",
        "source": "Talks I have not given",
        "dateLabel": "2023"
      },
      "focus": { "start": 0.2,  "duration": 0.3,  "ease": "smooth", "style": "magnify" },
      "mark":  { "start": 0.46, "duration": 0.34, "ease": "smooth", "style": "side-note" },
      "camera": "none",
      "backgroundVisibility": 0.3,
      "showSourceMetadata": true
    }
  }
}
```

Remixing across surfaces is mechanical: swap `surface` for the other variant; the shared blocks carry over untouched.

## AI authoring contract

Exactly two files are exposed to the AI:

- `docs/presets/engine.schema.json` — JSON Schema (Draft 2020-12) exported from the Zod schema. One file, both surfaces, body as the on-disk string with delimiter syntax. Generated by `scripts/export-preset-schema.ts`; committed.
- `docs/presets/engine.md` — human-language brief: what the shared blocks mean, what each surface is for, the inline-mark delimiter syntax. Per-surface sections are ≤ ½ page each.

The AI does not read source code. Schema + brief + goal in, valid `Preset` out. Drop the JSON into `src/lib/presets/` (slug = filename without `.json`); it loads at `/p/<slug>`. Validation rejects invalid presets at load with a readable error string from `parsePreset`.

## Scripts

- `scripts/export-preset-schema.ts` — runs `z.toJSONSchema(PresetSchema, { target: 'draft-2020-12', io: 'input' })` and writes `docs/presets/engine.schema.json`. Run via `npm run gen:schema` (`node --experimental-strip-types scripts/export-preset-schema.ts`).
- `scripts/verify-presets.ts` — validates every preset file in `src/lib/presets/` against `PresetSchema`, plus a cross-surface remix fixture and an AI-authored fixture. Run via `node --experimental-strip-types scripts/verify-presets.ts`.

## Out of scope (explicit non-goals)

- **User-saved presets, localStorage, in-browser import/export.** Presets live in the repo as committed JSON files. Authoring is a code change (typically by an agent).
- **Cross-surface morphing at runtime.** Switching `surface.type` is a content edit, not an animated transition.
- **Coordinate-anchored marks.** Inline-delimiter syntax is the only addressing model for annotations.
- **Cloud sync.** No accounts, no sync.
- **Versioned schema migration UI.** The schema id stays `hiviz@1` for now. A future `hiviz@2` runs migrations internally; users never see version numbers.

## Risks and watch-items

- **`marks.timings` length mismatch with marked spans in the body.** If a preset has fewer timings than marks, missing entries fall back to `marks.defaults`. If more, extras are silently ignored. Both are intentional and documented in `engine.md` so AIs don't try to "fix" missing timings by inventing them.
- **Discriminated narrowing.** `getResearchPaperSurface()` and `getQuoteFocusSurface()` throw on mismatch rather than rendering with undefined fields. The `/p/[slug]` conditional mount prevents the throw in practice, but the narrowing must stay defensive.
- **Identity-mutating `applyPreset`.** Walks and assigns primitives into `engineState`; preserves `engineState`'s top-level identity. Sub-object identities (`engineState.surface`) are replaced wholesale because the discriminated variants have different shapes. Tests should pin `engineState === <captured-reference>` across an apply.
- **Body-shape duality.** On disk: string with `[style]…[/style]` delimiters. At runtime: structured `AnnotationBody`. Zod transforms on parse; `serializeAnnotationBodyToText` reverses. Any code that reads `surface.content.body` must treat it as `AnnotationBody`.
- **Built-in count discipline.** Three to five per surface. Beyond that, the schema is probably too narrow and what you actually want is content edits, not separate presets.

## What comes next

The forward-looking architecture spec is in [`surfaces-and-annotations.md`](./surfaces-and-annotations.md). It replaces the per-surface "Tool" abstraction with a five-layer rendering model (surface chrome / body blocks / annotations / overlays / frame post-process), a primitive registry (`SurfaceRenderer`, `BlockRenderer`, `AnnotationRenderer`, `OverlayRenderer`, `EffectRenderer`), and a single unified `Workspace` / `Controls` / `TrackInspector` UI. The migration is sequenced as eight additive steps (with one in-place schema shape change at step 5), each independently shippable and verifiable. Read that doc before extending the current engine.
