# Hiviz Engine Architecture

> **Status:** draft for workshop, with workshop decisions baked in. Successor to the per-tool model in `preset-engine.md`. The "Decisions" section below records resolved questions; the "Open questions" section is now short and only holds items that need a real prototype before answering.

## Audience

An engineer (human or agent) with no prior context on this codebase should be able to read this document end-to-end and:

1. Understand the current architecture and what it becomes.
2. Execute the migration step by step.
3. Verify success after every step using only the commands listed.
4. Recognize when the whole migration is **Done** (defined explicitly at the bottom).

If something below is unclear, that is a bug in this document, not in the reader. File an issue, or read `preset-engine.md` (the prior architecture) and `html-in-canvas-typegpu.md` (the GPU layer pattern) for background.

## Goal

One engine that can produce every overlay Hiviz needs — research-paper card, magnified quote, tweet card with a side note, animated mermaid diagram, lower third, subscribe button, plus things we have not thought of yet — without growing parallel tools, parallel state files, or parallel UI per content type.

To do that, the engine treats every render as a stack of **layers**, each composed of typed primitives the engine knows how to draw, animate, and post-process. New content types add primitives to the right layer. They do not add tools.

Two strict architectural constraints anchor everything else:

1. **The data model is the contract.** Everything renderable is described in `engineState`. Pipelines own no state.
2. **Layered rendering is uniform.** Surface chrome, body blocks, annotations, overlays, and post-process effects all share the same WebGPU/TypeGPU compositor. One render path; identical preview and export.

## Starting state

What the codebase looks like today, before any migration step runs. An agent must read these files first; the migration is "transform this into the target structure described later in the doc."

### Current state files

- `src/lib/platform/engine-schema.ts` — Zod schema, types, defaults. Pure TS, no runes. Defines `EngineState`, `SurfaceState` as a discriminated union over `surface.type ∈ {'research-paper', 'quote-focus'}`. Body is `AnnotationBody` (structured paragraphs of segments).
- `src/lib/platform/engine-state.svelte.ts` — runtime: `engineState = $state(createDefaultEngineState())` + state-coupled helpers (`getResearchPaperSurface`, `getQuoteFocusSurface`, `getQuoteFocusMarkAppearance`, `ensureMarkTimingAtIndex`, `EDITOR_MARK_COLORS`).
- `src/lib/platform/preset.ts` — `parsePreset`, `applyPreset`, `listPresets`, `getPresetBySlug`. Loads built-in JSON via `import.meta.glob`.
- `src/lib/annotations/annotation-marks.ts` — `AnnotationStyle = 'highlight' | 'underline' | 'strike' | 'circle'`, `AnnotationBody`, `AnnotationMarkLayout`, `drawAnnotationMarks`, `getAnnotationMarkLayouts`, `ANNOTATION_MARK_ATTRIBUTE = 'data-annotation-mark'`.
- `src/lib/annotations/annotation-text-dom.ts` — DOM ↔ AnnotationBody serialization for the contenteditable editor.
- `src/lib/annotations/AnnotationTextEditor.svelte` — body editor (contenteditable). Takes `body: AnnotationBody` via `$bindable`. Toolbar with 4 mark buttons.

### Current platform files (UI shell)

- `src/lib/platform/ToolRunner.svelte` — mounts a `Tool` (GPU host + pipeline + Timeline + ToolWorkspace).
- `src/lib/platform/ToolWorkspace.svelte` — bare grid (stage + controls). No header.
- `src/lib/platform/ControlPanel.svelte`, `ControlGroup.svelte` — generic chrome.
- `src/lib/platform/Timeline.svelte.ts` (class) + `TimelineScrubber.svelte` + `TimelineTrackView.svelte` — playback + tracks UI.
- `src/lib/platform/VideoFrame.svelte` — 4K canvas wrapper with orientation handling.
- `src/lib/platform/gpu-host.ts` — `createGpuHost(canvas)` boots TypeGPU.
- `src/lib/platform/html-in-canvas.ts` — typed wrappers for the experimental WebGPU/HTML-in-Canvas API.
- `src/lib/platform/animation-manager.ts` — GSAP timeline that scrubs to a normalized progress.
- `src/lib/platform/export-video.ts` — Mediabunny WebM + ProRes transparent exports.
- `src/lib/platform/tool.ts` — the `Tool` interface (going away in step 7).
- `src/lib/platform/ExportPanel.svelte` — export controls.

### Current per-tool files (all delete in step 7)

- `src/lib/tools/research-paper/research-paper-tool.svelte.ts` — `Tool` impl.
- `src/lib/tools/research-paper/research-paper-pipeline.ts` — WGSL composition (DOM + highlight + strokes textures).
- `src/lib/tools/research-paper/research-paper-animation.svelte.ts` — animation state + manifest.
- `src/lib/tools/research-paper/research-paper-content.ts` — `getResearchPaperSourceLabel`.
- `src/lib/tools/research-paper/export-research-paper.ts` — export wrapper.
- `src/lib/tools/research-paper/ResearchPaperCanvasSource.svelte`, `ResearchPaperControls.svelte`, `ResearchPaperTrackInspector.svelte`, `ResearchPaperWorkspace.svelte`.
- `src/lib/tools/quote-focus/quote-focus-tool.svelte.ts`, `quote-focus-pipeline.ts`, `quote-focus-animation.svelte.ts`, `quote-focus-marks.ts`, `export-quote-focus.ts`.
- `src/lib/tools/quote-focus/QuoteFocusCanvasSource.svelte`, `QuoteFocusControls.svelte`, `QuoteFocusTrackInspector.svelte`, `QuoteFocusWorkspace.svelte`.

### Current routes (preserved)

- `src/routes/+page.svelte` — preset listing.
- `src/routes/p/[slug]/+page.svelte` — applies preset + dispatches to surface workspace based on `engineState.surface.type`. Stays; dispatches now go through the unified `Workspace.svelte`.
- `src/routes/+layout.svelte` — global brand link.

### Current preset files

- `src/lib/presets/research-paper-attention.json`, `research-paper-critique.json`, `research-paper-vertical.json` — three `surface.type === 'research-paper'` presets.
- `src/lib/presets/quote-focus-lift-out.json`, `quote-focus-isolate.json`, `quote-focus-magnify.json` — three `surface.type === 'quote-focus'` presets.

### Current scripts

- `scripts/export-preset-schema.ts` — emits `docs/presets/engine.schema.json` via `z.toJSONSchema`.
- `scripts/verify-presets.ts` — validates every built-in + cross-surface remix + AI fixture against `PresetSchema`.

## Target file layout

After step 7, the structure is:

```
src/lib/
  platform/
    Workspace.svelte           # one workspace; reads engineState
    Controls.svelte            # one controls panel; dispatches to block Editors
    TrackInspector.svelte      # one inspector; dispatches to block/overlay/effect Inspectors
    Timeline.svelte.ts         # unchanged
    TimelineScrubber.svelte    # unchanged
    TimelineTrackView.svelte   # unchanged
    VideoFrame.svelte          # unchanged
    ExportPanel.svelte         # unchanged
    gpu-host.ts                # unchanged
    html-in-canvas.ts          # unchanged
    animation-manager.ts       # unchanged
    export-video.ts            # unchanged
    engine-schema.ts           # updated for new state shape
    engine-state.svelte.ts     # updated; surface-narrowing helpers gone
    preset.ts                  # unchanged shape; applyPreset walks new state
    pipelines/
      index.ts                 # PIPELINE_REGISTRY (single source of truth)
      types.ts                 # SurfaceRenderer/BlockRenderer/AnnotationRenderer/OverlayRenderer/EffectRenderer interfaces
      composition.ts           # the single composition WGSL pipeline + uniform block
  pipelines/
    surfaces/
      paper/
        index.ts               # SurfaceRenderer entry + paper-specific WGSL (card chrome)
        CanvasSource.svelte    # the HTML/CSS layout for the paper card
      plain/
        index.ts               # SurfaceRenderer entry + transparent background pipeline
        CanvasSource.svelte    # minimal HTML wrapper
    blocks/
      paragraph/
        index.ts               # BlockRenderer entry
        # No Editor — paragraph uses the shared AnnotationTextEditor fallback
    annotations/
      highlight/  index.ts     # AnnotationRenderer (decorative, 2D canvas)
      underline/  index.ts
      strike/     index.ts
      circle/     index.ts
      box/        index.ts
      magnify/    index.ts     # AnnotationRenderer (focal, composition-uniform)
      lift-out/   index.ts
      tear-out/   index.ts
      side-note/  index.ts
    overlays/
      lower-third/
        index.ts               # OverlayRenderer + content schema
        CanvasSource.svelte    # the HTML/CSS for the lower-third strip
    effects/
      paper-grain/
        index.ts               # EffectRenderer + WGSL pass
  annotations/                 # shared annotation primitives (existing)
    annotation-marks.ts        # expanded AnnotationStyle union; helpers stay
    annotation-text-dom.ts     # unchanged
    AnnotationTextEditor.svelte # unchanged shell; toolbar gains buttons for new styles
  presets/
    *.json                     # migrated to new state shape
```

Old `src/lib/tools/` and the per-tool Svelte files are gone after step 7.

## Verification commands

The migration uses exactly these commands. An agent should not need to invent any others.

| Command | Purpose | Success signal |
|---|---|---|
| `npx svelte-check --tsconfig ./tsconfig.json` | Type-check the whole project | `0 ERRORS 0 WARNINGS` on the final line |
| `node --experimental-strip-types scripts/verify-presets.ts` | Validate built-in presets + remix fixtures | All `✓` lines, no `✗` |
| `node --experimental-strip-types scripts/export-preset-schema.ts` | Regenerate `docs/presets/engine.schema.json` | `Wrote …/engine.schema.json` |
| `npx vite build` | Smoke-test that the Cloudflare build succeeds | `✓ built in <N>s` |

### Browser checks

The dev server is **already running** at `http://localhost:5173` — do not start a new one (per `CLAUDE.md`). Use the chrome-devtools MCP tools when available:

| Tool | Purpose |
|---|---|
| `mcp__chrome-devtools__navigate_page` | Load a route, optionally with an `initScript` that traps warnings |
| `mcp__chrome-devtools__list_console_messages` | Read console (filter for `warn`/`error`) |
| `mcp__chrome-devtools__take_snapshot` | A11y snapshot of the live page |
| `mcp__chrome-devtools__evaluate_script` | Inspect DOM / run probes |

**Critical constraint:** the HTML-in-Canvas API (`copyElementImageToTexture` on a `layoutsubtree` canvas) is behind `chrome://flags/#canvas-draw-element` and is not present in the agent's test browser. Pixel-level visual rendering of the canvas **cannot be verified** via browser automation. The agent verifies:

- The page mounts without throwing.
- No `state_proxy_equality_mismatch`, no other console warnings or errors.
- The DOM structure matches expectations (a11y snapshot).
- The canvas element has the expected dimensions and the source DOM exists.

Pixel verification is a human-with-flagged-Chromium task. The acceptance criteria distinguish "structurally testable" (must pass) from "pixel-visual" (must hold but cannot be automated).

## The five layers

A frame is composed in this order, bottom to top:

```
+----------------------------------------------------------+
| 5. Frame post-process (whole-frame shader chain)         |
+----------------------------------------------------------+
| 4. Overlays      (lower-thirds, subscribe button, ...)   |
+----------------------------------------------------------+
| 3. Annotations   (per-span/per-block effects on body)    |
+----------------------------------------------------------+
| 2. Body          (sequence of typed Blocks)              |
+----------------------------------------------------------+
| 1. Surface chrome (paper card, tweet card, plain bg, …)  |
+----------------------------------------------------------+
```

Each layer has its own **post-process shader chain** (zero or more WGSL passes that run after the layer renders, before composition). A VHS shader on the body layer affects body + annotations but not the chrome. A film-grain shader on the frame layer affects everything. Per-layer effects unlock targeted treatment without polluting other layers.

### Layer types

| Layer | What it draws | Owns its own animation? | Post-process supported |
|---|---|---|---|
| Surface chrome | The container: paper card, tweet card, webpage frame, timeline graphic, plain background | Yes — surface-level (enter, exit, camera) | Yes |
| Body | A sequence of `Block`s (paragraphs, diagrams, images, code, …) rendered inside the surface | Per-block animation declared in state | Yes |
| Annotations | Per-span effects on text blocks; per-block effects on non-text blocks (highlight, magnify, lift-out, callout, …) | Per-mark timing | Yes |
| Overlays | Surface-positioned scene elements not tied to body content (lower thirds, subscribe button, watermark, captions, …) | Per-overlay timing | Yes |
| Frame post-process | Whole-frame shader chain (VHS, CRT, chromatic aberration, …) | N/A; runs every frame | The post-process *is* the layer |

## Conceptual primitives

Four extensible primitives. Each is a small registry entry: a schema + a renderer + (optionally) a specialized UI component.

### `SurfaceRenderer`

Renders the chrome. Examples: `paper`, `plain`, `tweet`, `webpage`, `timeline-explainer`, `studio` (talking-head bg), `slide` (slide-deck bg). Declares which content slots and which surface-level transitions it supports.

### `BlockRenderer`

Renders one body block. Examples: `paragraph` (the current annotated-text block), `mermaid-diagram` (animated mermaid), `image`, `code`, `chart`. A body is `Block[]`; each block has a `type` discriminator. Blocks can declare their own animation (e.g. mermaid build-up frame-by-frame) and their own annotation hooks (e.g. a code block highlighting line ranges).

### `AnnotationRenderer`

Renders one annotation style on a target (span in a text block, region in a diagram, the whole block, etc.). Two kinds:
- **Decorative** — additive overlay on the target (highlight, underline, strike, circle, box, callout).
- **Focal** — pulls attention/camera to the target and may transform the surroundings (magnify, lift-out, tear-out, side-note).

### `OverlayRenderer`

Renders one surface-positioned scene element. Examples: `lower-third`, `subscribe-button`, `watermark`, `captions`, `caption-card`, `progress-bar`. Has a position spec (anchor + offset, or normalized rect), its own enter/exit animation, and its own content schema.

### `EffectRenderer`

A single WGSL post-process pass: vertex + fragment + uniform layout. Examples: `vhs`, `crt`, `film-grain`, `chromatic-aberration`, `bloom`, `vignette`, `paper-grain`. Effects compose into a chain (state lists them in order). Same effect type can apply to multiple layers and at multiple chain positions.

Every primitive is registered in one explicit registry file (`$lib/platform/pipelines/index.ts`). No side-effect imports.

## Data model

```ts
// All four primitive-type unions are open: new variants land additively in code,
// no schema migration required. The lists below show what ships at v1 launch
// (★) and what's reserved for future additive PRs.

type SurfaceType =
  | 'paper'       // ★ research-paper card with grain shader + fly-in
  | 'plain'       // ★ transparent background, body only
  | 'tweet'       //   future
  | 'webpage'     //   future
  | 'timeline-explainer'; // future

type BlockType =
  | 'paragraph';  // ★ only block type in v1
  // future: 'mermaid-diagram' | 'image' | 'code' | 'chart' | …

type AnnotationStyle =
  // decorative — additive on or around the marked target, no scene-wide effect
  | 'highlight'   // ★
  | 'underline'   // ★
  | 'strike'      // ★
  | 'circle'      // ★
  | 'box'         // ★ (was quote-focus mark.style 'box')
  | 'side-note'   // ★ (was quote-focus mark.style 'side-note'). Decorative with margin —
                  //   draws an arrow + attribution label outside the span; does not dim or magnify the scene.
  // focal — changes the scene around the target (dim / magnify / displace / tear)
  | 'magnify'     // ★ (was quote-focus focus.style 'magnify')
  | 'lift-out'    // ★ (was quote-focus focus.style 'lift-out')
  | 'tear-out'    // ★ (was quote-focus focus.style 'tear-out')
  | 'isolate'     // ★ (was quote-focus focus.style 'isolate'). Strong dim of non-marked content; no lens.
  | 'callout';    //   future — decorative with margin (different chrome than side-note)

type OverlayType =
  | 'lower-third'; // ★ ships in step 6 to validate plumbing
  // future: 'subscribe-button' | 'watermark' | 'captions' | 'progress-bar' | …

type EffectType =
  | 'paper-grain'; // ★ ships in step 6 (factored out of the paper surface shader)
  // future: 'vhs' | 'crt' | 'film-grain' | 'chromatic-aberration' | 'bloom' | 'vignette' | …

type LayerName = 'surface' | 'body' | 'annotations' | 'overlays' | 'frame';

interface EngineState {
  transport: Transport;
  typography: Typography;
  marks: MarksState;
  surface: SurfaceState;
  overlays: Overlay[];
  effects: LayerEffectChain;   // post-process per layer
}

interface SurfaceState {
  type: SurfaceType;
  content: SurfaceContent;       // shape depends on surface; declares its slots
  enter?: Transition;
  exit?: Transition;
  camera?: 'none' | 'push' | 'snap';
  backgroundVisibility?: number;
}

interface SurfaceContent {
  body: Block[];                 // always present, possibly empty
  title?: string;
  sourceUrl?: string;
  author?: string;
  source?: string;
  dateLabel?: string;
  // additional slots declared by SurfaceRenderer.contentSlots
}

type Block =
  | ParagraphBlock
  | MermaidBlock
  | ImageBlock
  | CodeBlock
  | ChartBlock;

interface ParagraphBlock {
  type: 'paragraph';
  segments: AnnotatedTextSegment[];
}

interface AnnotatedTextSegment {
  text: string;
  // Each segment carries zero or more annotation styles. Multiple styles on a
  // span stack visually: decorative styles render first (document order, then
  // declared order within the segment); focal styles next (document order, with
  // later focal slots overlapping earlier ones in the composition shader).
  //
  // This generalises today's `markStyle: AnnotationStyle | null` and unblocks
  // the quote-focus migration (e.g. a span that is both magnified AND
  // side-noted needs both styles).
  markStyles: AnnotationStyle[];
}

interface MermaidBlock {
  type: 'mermaid-diagram';
  source: string;                     // mermaid markup
  buildIn?: Transition;               // optional per-block reveal
}

interface ImageBlock {
  type: 'image';
  src: string;
  alt: string;
}

interface CodeBlock {
  type: 'code';
  language: string;
  source: string;
  lineHighlights?: number[];          // 1-based; rendered as annotations
}

interface ChartBlock { /* future */ }

interface MarksState {
  defaults: Record<AnnotationStyle, MarkAppearance>;
  // Index-aligned with `(segment, style)` pairs flattened across all body
  // blocks in document order, then by `markStyles[]` array order within each
  // segment. A segment with `markStyles: ['magnify', 'side-note']` consumes
  // two indices (magnify first, then side-note). Missing trailing entries
  // fall back to `defaults[style]`. Extra entries are ignored.
  timings: MarkTiming[];
}

interface Overlay {
  type: OverlayType;
  id: string;                         // stable identity for timeline tracks
  content: unknown;                   // schema declared by OverlayRenderer
  position: OverlayPosition;
  enter?: Transition;
  exit?: Transition;
}

interface OverlayPosition {
  anchor: 'top-left' | 'top-right' | 'top-center'
        | 'bottom-left' | 'bottom-right' | 'bottom-center'
        | 'center' | 'normalized-rect';
  offset?: { x: number; y: number };  // pixels in canvas-space, anchor-relative
  rect?: { x: number; y: number; width: number; height: number }; // 0..1 if anchor === 'normalized-rect'
}

interface LayerEffectChain {
  surface: Effect[];
  body: Effect[];
  annotations: Effect[];
  overlays: Effect[];
  frame: Effect[];
}

interface Effect {
  type: EffectType;
  id: string;
  params: unknown;                    // schema declared by EffectRenderer
  // Effects are static (decision #7). No timing in v1.
  // A future effect that needs to animate can opt in inside its own `params`.
}
```

The preset schema id stays `hiviz@1` (workshop decision; see Decisions section below). The shape change in step 5 is in-place — built-in presets are hand-migrated. Every preset is one JSON document; surfaces, blocks, annotations, overlays, and effects all live in the same envelope.

## Rendering architecture (TypeGPU layered)

The current research-paper pipeline is the template: layered textures composed in one fragment shader. Generalize it.

```
                                                          GpuHost (TypeGPU)
                                                          ↓
                                    ┌──────────────────────────────────────────────┐
                                    │ 1) Surface chrome → DOM-to-texture           │
                                    │    (copyElementImageToTexture on layoutsubtree
                                    │     canvas), optional surface shader pass    │
                                    │    → surfaceTex                              │
                                    └──────────────┬───────────────────────────────┘
                                                   │
                                                   ▼
                                    apply effects.surface chain → surfaceTex'
                                                   │
                                                   ▼
                                    ┌──────────────────────────────────────────────┐
                                    │ 2) Body                                       │
                                    │    Block renderers fill bodyTex by reading    │
                                    │    the DOM regions inside the surface         │
                                    │    (paragraph blocks are already in the DOM   │
                                    │    texture; mermaid blocks render to their    │
                                    │    own sub-texture composited into bodyTex)   │
                                    └──────────────┬───────────────────────────────┘
                                                   ▼
                                    apply effects.body chain → bodyTex'
                                                   │
                                                   ▼
                                    ┌──────────────────────────────────────────────┐
                                    │ 3) Annotations                                │
                                    │    Decorative styles draw into                │
                                    │    annotationDecorativeTex (2D canvas or WGSL │
                                    │    pass). Focal styles contribute to the      │
                                    │    composition uniform block (rect, magnify,  │
                                    │    dim, tear). The compositor warps surfaceTex│
                                    │    + bodyTex + annotation decoration when     │
                                    │    drawing the focal style.                   │
                                    └──────────────┬───────────────────────────────┘
                                                   ▼
                                    apply effects.annotations chain
                                                   │
                                                   ▼
                                    ┌──────────────────────────────────────────────┐
                                    │ 4) Overlays                                   │
                                    │    Each overlay renders to overlaysTex at its │
                                    │    declared position. Overlays do not touch   │
                                    │    body/surface; they composite on top.       │
                                    └──────────────┬───────────────────────────────┘
                                                   ▼
                                    apply effects.overlays chain
                                                   │
                                                   ▼
                                    ┌──────────────────────────────────────────────┐
                                    │ 5) Composition                                │
                                    │    Single WGSL fragment shader composes:      │
                                    │    surface' → body' → annotations' → overlays'│
                                    │    with focal warping from the composition UB │
                                    └──────────────┬───────────────────────────────┘
                                                   ▼
                                    apply effects.frame chain → final canvas
```

### Per-layer post-process

Each layer exposes one output texture. The effect chain for that layer runs ping-pong over a pair of textures, applying each `Effect` in `effects[layerName]`. A `vhs` Effect on `effects.body` distorts body + annotations but leaves the surface chrome and overlays clean. A `vhs` on `effects.frame` distorts everything.

Effects are pure post-process: they read a source texture, write a destination texture. No effect needs scene knowledge beyond its uniforms. This keeps the registry tiny — adding `crt` is one shader file and one entry.

### Composition uniform block

Up to 8 active focal slots in the composition shader, each with `{ rect: vec4f, magnify: f32, dim: f32, tear: f32, style: u32 }`. The fragment iterates slots and routes by `style` to the right warp. Adding a focal style adds a case in this shader, not a new pipeline.

### Determinism + export parity

Same constraint as today: every render is computed from a `timestamp`, never from wall-clock. The shared `Timeline` is the only clock. Export uses the same `renderFrame(frame, timestamp)` path as preview, so what you see is what you get. One render path, identical preview and export.

### Performance considerations

- **Texture allocation budget.** A frame allocates: 1 surface tex + 1 body tex + 1 annotation decorative tex + 1 overlay tex + 2 ping-pong post-process textures = ~6 RGBA8 textures at canvas resolution. At 3840×2160 that is ~200 MB of GPU memory. Sufficient for current GPUs; document the budget so future content types don't quietly blow it.
- **Effect chain cost.** Each effect is one render pass over the canvas. 4 effects on the frame layer at 4K ≈ 4 fullscreen passes. Profile before adding heavy effects (bloom is multi-pass internally).
- **Mermaid / heavy blocks.** Blocks that need their own DOM render (mermaid) use a hidden `layoutsubtree` canvas child + `copyElementImageToTexture`. Re-render only when the block's source changes, cached otherwise.

## Pipeline registry

```ts
// $lib/platform/pipelines/index.ts (the single source of truth)

interface SurfaceRenderer {
  type: SurfaceType;
  contentSlots: ContentSlotSchema;
  supportsEnterExit: boolean;
  supportsCamera: boolean;
  supportsBackgroundVisibility: boolean;
  createPipeline(opts: PipelineFactoryOptions): SurfaceRenderInstance;
}

interface BlockRenderer<TBlock extends Block> {
  type: TBlock['type'];
  schema: z.ZodType<TBlock>;

  // The block's canvas-source HTML. Mounted by the surface's CanvasSource
  // when it walks `surface.content.body` and dispatches per block.type.
  // Receives the block's data as a prop. Emits annotation-mark spans
  // (`<span data-annotation-mark="…">`) where marks should appear so the
  // pipeline's getAnnotationMarkLayouts can find them via getClientRects.
  CanvasSource: SvelteComponent;

  // Optional GPU-side render hook. Called once per frame *before* the surface's
  // DOM-to-texture upload. Lets a block do its own GPU work (mermaid rendering
  // to an offscreen canvas, image loading + texture caching, etc.). The
  // paragraph block does not need this — its content is captured by the
  // surface's DOM-to-texture pass directly.
  render?(ctx: BlockRenderContext<TBlock>): void;

  // Optional specialized editor in the Controls body editor. The body editor
  // walks `body: Block[]` and mounts one Editor per block in document order.
  // If Editor is absent, the block falls back to the shared text-style editor
  // (AnnotationTextEditor) when the block's content is text-shaped (segments),
  // or a read-only placeholder otherwise.
  Editor?: SvelteComponent;

  // Optional selection-driven inspector. Mounts inside TrackInspector when
  // a per-block timeline element is selected (e.g. a mermaid block's build-in).
  Inspector?: SvelteComponent;
}

interface AnnotationRenderer {
  style: AnnotationStyle;
  kind: 'decorative' | 'focal';
  // 'block' is the wildcard — annotation works on any block type.
  // Listing specific block types means "only valid on these blocks";
  // validation rejects marks on unsupported block types.
  // In v1, all registered annotations declare `appliesTo: ['paragraph']`.
  appliesTo: ('paragraph' | 'mermaid-diagram' | 'image' | 'code' | 'chart' | 'block')[];
  draw(ctx: AnnotationDrawContext): void;
}

interface OverlayRenderer<TOverlay extends Overlay> {
  type: TOverlay['type'];
  schema: z.ZodType<TOverlay>;
  render(ctx: OverlayRenderContext<TOverlay>): void;
  Inspector?: SvelteComponent;
}

interface EffectRenderer {
  type: EffectType;
  schema: z.ZodType<{ type: EffectType; id: string; params: unknown }>;
  pass: WGSLEffectPass;               // declarative shader + uniforms
  Inspector?: SvelteComponent;
}

// The v1 registry (post-migration). Future additive PRs extend each map.
export const PIPELINE_REGISTRY = {
  surfaces: {
    paper,                 // ★ ships in step 7
    plain,                 // ★ ships in step 7
    // future: tweet, webpage, timelineExplainer
  },
  blocks: {
    paragraph,             // ★ ships in step 7
    // future: mermaidDiagram, code, image, chart
  },
  annotations: {
    highlight, underline, strike, circle, box,    // ★ decorative
    magnify, liftOut, tearOut, sideNote,          // ★ focal
    // future: callout
  },
  overlays: {
    lowerThird,            // ★ ships in step 6
    // future: subscribeButton, watermark, captions, progressBar
  },
  effects: {
    paperGrain,            // ★ ships in step 6
    // future: vhs, crt, filmGrain, chromaticAberration, bloom, vignette
  }
} as const;
```

### How the registry plugs into schema validation

`Overlay.type` and `Effect.type` in the Zod schema are typed as **string enums derived from the registry**. The schema file (`engine-schema.ts`) imports the type strings from `pipelines/index.ts` and constructs `z.enum(...)` with them. Adding an effect therefore touches three files: the effect's own `index.ts`, the registry's `pipelines/index.ts`, and the enum constructor in `engine-schema.ts` (one line per addition). Validation rejects unknown types at preset load.

Per-effect `params` schemas are not part of the master schema. Each `EffectRenderer.schema` validates its own `params` shape when the effect is applied. A preset that lists an effect with a malformed `params` block fails the second validation pass (`applyPreset`), not the first (`parsePreset`). This keeps the master schema small and lets effects evolve their params independently.

### Concrete example: registering an effect

The `paper-grain` effect is the minimal effect example. Reference for any future effect.

```ts
// src/lib/pipelines/effects/paper-grain/index.ts
import { z } from 'zod';
import { d } from 'typegpu';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

const PaperGrainParams = z.object({
  warmth: z.number().min(0).max(1).default(0.5),
  density: z.number().min(0).max(1).default(0.3)
});

const PaperGrainUniforms = d.struct({
  warmth: d.f32,
  density: d.f32
});

const paperGrainPass = /* tgpu['~unstable'].fragmentFn(...).$uses({...}) */;

export const paperGrain: EffectRenderer<z.infer<typeof PaperGrainParams>> = {
  type: 'paper-grain',
  schema: z.object({
    type: z.literal('paper-grain'),
    id: z.string(),
    params: PaperGrainParams
  }),
  pass: paperGrainPass
};
```

```ts
// src/lib/platform/pipelines/index.ts
import { paperGrain } from '$lib/pipelines/effects/paper-grain';
// ... other imports

export const PIPELINE_REGISTRY = {
  // ...
  effects: { paperGrain }
};

export const REGISTERED_EFFECT_TYPES = Object.values(PIPELINE_REGISTRY.effects).map((r) => r.type);
// → ['paper-grain']
```

```ts
// src/lib/platform/engine-schema.ts (excerpt)
import { REGISTERED_EFFECT_TYPES } from './pipelines';

const EffectTypeSchema = z.enum(REGISTERED_EFFECT_TYPES as [string, ...string[]]);
// EffectSchema uses EffectTypeSchema for `type`; params validated per-effect at apply time.
```

That is the entire pattern. Surfaces, blocks, annotations, and overlays follow the same shape with their corresponding `*Renderer` interface and registry slot.

### Annotation stack order (composition shader)

The composition shader processes annotations as follows. The traversal is "flatten every `(segment, markStyles[i])` pair across all body blocks in document order, then within each segment by `markStyles[]` array order."

1. **Decorative annotations** render into `annotationDecorativeTex` in traversal order (earlier marks draw first; later marks draw on top of overlap).
2. **Focal annotations** populate the composition uniform block's focal-slots array in traversal order. The composition fragment shader iterates slots `0..N`. Later slots win where they overlap — focal effects are not currently designed to nest, and validation soft-warns when more than one focal mark covers overlapping spans.
3. **Within a segment with multiple `markStyles`**, decorative styles still draw before focal styles, regardless of `markStyles[]` array order. This means a segment with `markStyles: ['magnify', 'underline']` and a segment with `markStyles: ['underline', 'magnify']` produce identical output.
4. **Final composition order:** `surface' → body' → annotationDecorativeTex' → focal warps → overlays' → frame effects`. Focal warps are applied to the already-composed `surface + body + decorative` stack so a magnify lens visually contains everything underneath.

## UI structure

Three core components in `$lib/platform/`:

- `Workspace.svelte` — stage + controls. Reads `engineState.surface.type`, mounts the right surface renderer. No surface-specific UI.
- `Controls.svelte` — content section + appearance section (typography) + transport section + overlays panel + effects panel. All driven by registry metadata. No surface-specific Svelte exists.

  The **content section** is itself a small dispatcher: it mounts the surface's declared slot inputs (typography, title, attribution, etc.) plus a body editor. The body editor walks `surface.content.body: Block[]` in document order and mounts each block's `Editor` component (if registered) or the shared paragraph editor (`AnnotationTextEditor`). This is what "different fields per block type, one consistent inspector chrome" means structurally — the chrome is `Controls.svelte`; the per-block field set is owned by each `BlockRenderer.Editor`.

- `TrackInspector.svelte` — selection-driven per-element controls. On a mark track: shows that mark's style + color + intensity + ease. On an overlay track: shows the overlay's enter/exit + content (via the overlay's optional `Inspector` component when registered, or shared field-driven inputs otherwise). On a surface transition: shows that transition's ease. On a per-block timeline element: shows that block's `Inspector` (when registered) or shared timing controls.

### When specialized UI is justified

Two distinct extension points, both optional:

- `BlockRenderer.Editor` — mounts in the body editor's per-block slot inside `Controls`. Used when a block's content shape doesn't fit a text-style editor (mermaid source + live preview, code with syntax highlighting, image picker, chart data table).
- `BlockRenderer.Inspector`, `OverlayRenderer.Inspector`, `EffectRenderer.Inspector` — mounts inside `TrackInspector` when that primitive is selected. Used when the timing / parameter surface is too rich for a flat field list (a bezier ease curve editor, a multi-stage effect ramp).

A primitive **may** ship either component only when **all** of the following are true:

1. The primitive has substantial internal structure that cannot be expressed as a flat list of fields.
2. The shared field-driven inspector would degrade UX measurably (long flat lists, raw JSON, no live feedback).
3. The specialized UI is **strictly additive** — it lives only inside its declared slot (body editor block slot for `Editor`; track inspector slot for `Inspector`). It cannot inject UI into other panels, layouts, or routes.

`AnnotationRenderer` and `SurfaceRenderer` **never** ship specialized inspectors or editors. Annotation controls are always {style, color, intensity, ease}. Surface controls are always the shared shape (typography, slots, enter/exit, camera, background). If a surface seems to need more, that is a signal the missing concept belongs in the shared model or as a separate block / overlay / effect — not as a per-surface UI escape hatch.

### Toolbar discoverability

The body editor toolbar exposes the full annotation style set. With ~10 styles the toolbar gets crowded; group by kind (decorative row, focal row) or move focal styles behind a popover. The overlays panel and effects panel are list-based with an "add" button that opens a picker.

## Acceptance criteria

Every AC is labelled **MUST**, **MUST-VISUAL** (requires flagged-Chromium pixel verification by a human), or **SHOULD** (good to have, not blocking).

**Definition of Done:** every MUST passes. Every MUST-VISUAL has been observed once by a human on flagged Chromium and matches the pre-migration visual. SHOULDs are tracked as follow-ups.

### Schema and validation

- **AC-S1 (MUST)** `npx svelte-check --tsconfig ./tsconfig.json` exits with `0 ERRORS 0 WARNINGS`.
- **AC-S2 (MUST)** Every built-in preset (`src/lib/presets/*.json`) parses with `parsePreset` without throwing.
- **AC-S3 (MUST)** `node --experimental-strip-types scripts/verify-presets.ts` exits 0 with all `✓`. The script's fixture set includes: (a) one cross-surface remix (`paper` → `plain` content carry-over); (b) one fixture per `AnnotationStyle` kind (decorative + focal); (c) one fixture using a `lower-third` overlay; (d) one fixture using `paper-grain` in `effects.surface` and the same effect in `effects.frame`.
- **AC-S4 (MUST)** A preset constructed by an external agent from `docs/presets/engine.schema.json` + `docs/presets/engine.md` alone, with no source-code access, loads via the `/p/<slug>` route after being dropped into `src/lib/presets/`.
- **AC-S5 (MUST)** `docs/presets/engine.schema.json` is the freshly generated output of `scripts/export-preset-schema.ts` against the current schema (committed; CI or pre-commit verifies it is in sync).

### Rendering — structurally testable

- **AC-R1 (MUST)** Loading `/p/research-paper-attention` (or whatever it gets renamed to post-step-5) mounts the canvas, the Timeline scrubber, and the controls panel without throwing. Console clean.
- **AC-R2 (MUST)** Loading every preset under `/p/<slug>` mounts without throwing. Console clean for each.
- **AC-R3 (MUST)** Loading a preset whose surface is `paper` mounts the paper canvas-source HTML inside the `<canvas layoutsubtree>`. Loading a preset whose surface is `plain` mounts the plain canvas-source HTML. Selector check via `mcp__chrome-devtools__evaluate_script`.
- **AC-R4 (MUST)** After a preset that contains an inline focal annotation (e.g. `magnify`) loads, the canvas source DOM contains exactly one `[data-annotation-mark="magnify"]` element at the location of the focal span.
- **AC-R5 (MUST)** Adding an `Overlay` of type `lower-third` to a preset causes the lower-third overlay's HTML to be present in the canvas source DOM after the preset loads.
- **AC-R6 (MUST)** Adding `paper-grain` to `effects.surface` and to `effects.frame` in the same preset does not throw at preset load; the rendering completes without error.

### Rendering — pixel-visual

These can only be verified on a flagged Chromium build (per CLAUDE.md). The agent confirms structural ACs above; a human confirms pixel parity below.

- **AC-RV1 (MUST-VISUAL)** Each migrated preset at `/p/<slug>` renders the same canvas frame at the same `Timeline.time = 0.5 * duration` as the equivalent pre-migration preset. Compare by eye or by frame capture.
- **AC-RV2 (MUST-VISUAL)** Two focal marks on adjacent spans render both, with decorative-under-focal stack order. (Codified by decision #3.)
- **AC-RV3 (MUST-VISUAL)** A `paper-grain` effect on `effects.surface` is visible inside the paper card and absent outside it. The same effect on `effects.frame` covers the entire viewport.
- **AC-RV4 (MUST-VISUAL)** A `lower-third` overlay enter/exit animates per its `Transition`. Frame stepping at the start and end of the transition shows the lower-third moving.
- **AC-RV5 (MUST-VISUAL)** Exporting a 6-second preset to WebM and to ProRes both complete and the resulting video, played frame-by-frame, matches the preview at the same timestamps (allowing for encoder lossiness).

### State and reactivity

- **AC-T1 (MUST)** After `applyPreset(preset)`, `engineState` retains its original object identity (`engineState === <reference captured before call>`). Sub-objects may be replaced.
- **AC-T2 (MUST)** Editing the body via the `AnnotationTextEditor` updates `engineState.surface.content.body` and the canvas re-renders. No `state_proxy_equality_mismatch` warning. No other warnings or errors in the console during normal editing.
- **AC-T3 (MUST)** Selecting a mark / overlay / surface-transition on the timeline causes `TrackInspector` to show controls for that element. Selecting an overlay that has a registered `OverlayRenderer.Inspector` mounts that component.
- **AC-T4 (MUST)** Adding or removing an overlay updates both the overlays panel list and the timeline tracks reactively (no manual refresh).

### UI structure

- **AC-U1 (MUST)** `find src/lib/tools -type f` returns nothing (the directory is gone).
- **AC-U2 (MUST)** No file under `src/` references `Tool`, `ToolRunner`, `ToolWorkspace`, `researchPaperTool`, or `quoteFocusTool`. Verify with `grep -rn`.
- **AC-U3 (MUST)** The Svelte files that drive the editor UI are exactly: `Workspace.svelte`, `Controls.svelte`, `TrackInspector.svelte` (in `$lib/platform/`); plus the shared `VideoFrame`, `TimelineScrubber`, `TimelineTrackView`, `ExportPanel`, `ControlPanel`, `ControlGroup` from `$lib/platform/` that existed before the migration; plus `AnnotationTextEditor.svelte` in `$lib/annotations/`; plus per-pipeline `CanvasSource.svelte`, `Editor.svelte`, `Inspector.svelte` under `$lib/pipelines/` only where the registration declares them. No Svelte files driving the editor UI live outside these locations.
- **AC-U4 (MUST)** Adding a new `EffectType` (e.g. `noise`) requires only: a new `src/lib/pipelines/effects/<name>/index.ts`, a one-line registry entry in `$lib/platform/pipelines/index.ts`, and a one-token addition to the `EffectType` union. No edits to `Workspace.svelte`, `Controls.svelte`, `TrackInspector.svelte`, or `composition.ts`. Verify with `git diff --stat` on a sample addition.
- **AC-U5 (MUST)** Adding a new `OverlayType` requires the same scope as AC-U4 plus an optional `CanvasSource.svelte` for the overlay's HTML.
- **AC-U6 (MUST)** Adding a new `BlockType` requires the same scope as AC-U4 plus optional `Editor.svelte` and `Inspector.svelte` under the block's directory.

### Determinism

- **AC-D1 (MUST)** The preview path and the export path both call `pipeline.render(buildRenderInputs(timestamp))` with the same `timestamp` for the same frame. Verified by code inspection: there is exactly one `renderAt(timestamp)` function in `Workspace.svelte`, and `ExportPanel` drives export through the same function.
- **AC-D2 (MUST)** With the Timeline paused at `t = 1.5s`, two calls to the render function produce the same canvas state. Verified by reading `canvas.toDataURL()` twice and asserting equality.

### Performance — targets, not enforced

These are SHOULD ACs. Capture metrics; treat regressions as follow-ups.

- **AC-P1 (SHOULD)** At 4K horizontal frame, idle render time ≤ 16ms on an M2+ MacBook Pro.
- **AC-P2 (SHOULD)** One focal annotation + one lower-third overlay + one `paper-grain` effect ≤ 32ms per frame.
- **AC-P3 (SHOULD)** Export of a 6-second 30fps preset completes in under 1 minute.
- **AC-P4 (SHOULD)** GPU memory at idle ≤ 256 MB.

### Documentation

- **AC-DD1 (MUST)** `docs/presets/engine.schema.json` is regenerated; committed.
- **AC-DD2 (MUST)** `docs/presets/engine.md` describes the migrated state shape: shared blocks (transport / typography / marks / surface / overlays / effects), surface variants (`paper`, `plain`), block variants (`paragraph` only at v1), annotation styles (full union), overlay types (`lower-third` at v1), effect types (`paper-grain` at v1). Each section ≤ ½ page.
- **AC-DD3 (MUST)** This file (`docs/surfaces-and-annotations.md`) is current with the registry. Updated whenever a primitive is added.

## Migration sequence

Each step is a separate landable unit. After every step, run all four commands from "Verification commands" and visit `http://localhost:5173/p/research-paper-attention` and `http://localhost:5173/p/quote-focus-magnify` (or the renamed slugs once step 5 lands) and confirm the console is clean.

Steps 1–4 and 6–8 are additive (no preset shape change). Step 5 is the one in-place shape change.

> **An agent runs steps in order.** Do not skip ahead. Each step's "Verification" section must pass before starting the next step. If a step's verification fails, stop and fix the step. Do not begin a new step on top of a failing previous one.

### Step 1 — Extend `AnnotationStyle`

**Goal:** introduce the new annotation style names so step 3 can register renderers for them.

**Files modified:**
- `src/lib/annotations/annotation-marks.ts` — extend `AnnotationStyle` union to include `'magnify' | 'lift-out' | 'tear-out' | 'side-note' | 'box' | 'callout'`; extend `ANNOTATION_MARK_STYLES`.
- `src/lib/platform/engine-schema.ts` — extend `AnnotationMarkStyleSchema` enum to match.
- `src/lib/annotations/AnnotationTextEditor.svelte` — add toolbar buttons for the new styles. Group: decorative (highlight, underline, strike, circle, box) row; focal (magnify, lift-out, tear-out, side-note, callout) row.

**Files added / deleted:** none.

**Verification per step 1:**
- `npx svelte-check` clean.
- `node --experimental-strip-types scripts/verify-presets.ts` clean (existing presets only use `highlight`; new styles render as no-ops on the canvas).
- Browser load of any preset shows the expanded toolbar; clicking a new-style button marks the selection in the editor but produces no canvas change (renderer comes in step 3).

### Step 2 — Wrap body in `Block` discriminator + segments take `markStyles: AnnotationStyle[]`

**Goal:** introduce the `Block` shape so future block types add additively, **and** generalize segments from one mark style to many so the step-5 quote-focus migration can preserve fidelity (`magnify + side-note`, `lift-out + underline`, etc.).

**Files modified:**
- `src/lib/annotations/annotation-marks.ts` — `AnnotatedTextSegment.markStyle: AnnotationStyle | null` → `markStyles: AnnotationStyle[]`. Update any helper that reads `.markStyle` (search the repo for that exact identifier).
- `src/lib/platform/engine-schema.ts` — update `AnnotationTextSegmentSchema` (markStyles is `z.array(AnnotationMarkStyleSchema)`). Add `ParagraphBlock`, `Block` (discriminated union, one variant for now), `BlockType`. Change `SurfaceContent.body` from `AnnotationBody` to `Block[]`. Migrate the two default bodies (`RESEARCH_PAPER_DEFAULT_BODY`, `QUOTE_FOCUS_DEFAULT_BODY`) to the new shape: paragraphs wrapped in `{ type: 'paragraph', segments: [...] }`, segments use `markStyles: [...]` instead of `markStyle`.
- `src/lib/presets/*.json` (all 6) — wrap each paragraph as `{ type: 'paragraph', segments: [...] }`; rewrite every segment to use `markStyles: ['<style>']` or `markStyles: []` (for plain text).
- `src/lib/annotations/AnnotationTextEditor.svelte` — body prop becomes `body: Block[]`. Toolbar buttons toggle a style on/off in the current selection's `markStyles` array (instead of replacing). Visual: a button is "active" if every span in the selection contains that style.
- `src/lib/annotations/annotation-text-dom.ts` — `serializeEditorBody` / `renderEditorBody` / `toggleMarkInBody` operate on `markStyles` arrays. When rendering DOM bands, one `<span data-annotation-mark>` per style (nested where styles co-occur on the same range), so the canvas-source DOM remains `getClientRects`-queryable per style.
- All `*CanvasSource.svelte` files — iterate body as `Block[]`, skip non-paragraph blocks (none exist yet). When rendering a segment, emit a nested span for each `markStyles[i]`.
- `src/lib/tools/research-paper/research-paper-animation.svelte.ts` — walks the new `Block[]` body and collects marks; a segment with two styles contributes two marks (in document order, then style-array order).
- `src/lib/platform/preset.ts` — `cloneSurface` and `cloneTiming` updated for the new shape.

**Verification per step 2:**
- `npx svelte-check` clean.
- `scripts/verify-presets.ts` passes (all 6 presets now use the wrapped shape).
- Browser load of each preset renders the body and marks correctly.
- A span with `markStyles: ['highlight', 'underline']` (manually added to a test preset) renders both visual treatments stacked.

### Step 3 — Port annotation rendering into per-style `AnnotationRenderer`s

**Goal:** factor the existing draw routines (research-paper highlight/circle/etc. + quote-focus magnify/lift-out/tear-out/side-note) into per-style `AnnotationRenderer` modules. No new pipeline logic — same pixels, restructured.

**Files added:**
- `src/lib/platform/pipelines/types.ts` — declare `AnnotationRenderer`, `BlockRenderer`, `SurfaceRenderer`, `OverlayRenderer`, `EffectRenderer` interfaces (matching the "Pipeline registry" section below).
- `src/lib/pipelines/annotations/highlight/index.ts` — decorative, draws into 2D canvas via existing `drawAnnotationMarks` highlight path.
- `src/lib/pipelines/annotations/{underline,strike,circle,box}/index.ts` — same pattern as `highlight`.
- `src/lib/pipelines/annotations/{magnify,lift-out,tear-out,side-note}/index.ts` — focal, each contributes one focal slot to the composition uniform block. Code factored from `quote-focus-pipeline.ts`'s `computeFocusParams` and `drawQuoteMarks` (in `quote-focus-marks.ts`).
- `src/lib/platform/pipelines/index.ts` — `PIPELINE_REGISTRY` skeleton with `annotations: { highlight, underline, strike, circle, box, magnify, liftOut, tearOut, sideNote }`. Other kinds wired in subsequent steps.

**Files modified:**
- `src/lib/tools/research-paper/research-paper-pipeline.ts` — internal draw calls now route through the `AnnotationRenderer` registry for decorative styles. Composition shader unchanged (still research-paper-specific until step 4).
- `src/lib/tools/quote-focus/quote-focus-pipeline.ts` — same: focal styles route through the registry; composition is still quote-focus-specific until step 4.

**Verification per step 3:**
- `npx svelte-check` clean.
- Each existing preset (research-paper-* and quote-focus-*) renders **the same visual output** as before this step. Verify by loading the route in the dev server with HTML-in-Canvas (human verification) or by checking that canvas dimensions and DOM structure are unchanged in automation.
- Console clean.

### Step 4 — Single composition shader + per-layer effects scaffold

**Goal:** unify the two existing composition shaders (research-paper and quote-focus) into one composition shader that handles `paper` chrome + body + decorative annotations + focal-uniform warping. Add the per-layer effect chain plumbing (no effects registered yet).

**Files added:**
- `src/lib/platform/pipelines/composition.ts` — single composition WGSL pipeline. Uniform block sized for 4 effects/layer × 5 layers + 8 focal slots. When no effects and no focal slots are active, output is the layered composition of surface + body + decorative annotation textures, equivalent to the current research-paper composition.
- `src/lib/platform/pipelines/effect-chain.ts` — runs an `Effect[]` chain on a texture via ping-pong. Loop body is a noop when the chain is empty.

**Files modified:**
- `src/lib/tools/research-paper/research-paper-pipeline.ts` — replaces the bespoke composition shader with a call into `composition.ts`. Provides the layer textures and an empty focal uniform.
- `src/lib/tools/quote-focus/quote-focus-pipeline.ts` — same; replaces the bespoke composition with `composition.ts`. Provides the layer textures and the focal uniform for whichever focal annotation is active.

**Verification per step 4:**
- `npx svelte-check` clean.
- All 6 presets render identically to step 3 (one composition shader path now serves both).
- Console clean.

### Step 5 — In-place state shape change

**Goal:** drop `quote-focus` as a surface variant, rename `research-paper` → `paper`, add `plain`, move shared fields, add `overlays` and `effects`.

**Files modified:**
- `src/lib/platform/engine-schema.ts`:
  - `SurfaceType = 'paper' | 'plain'` (drop `'research-paper'`, drop `'quote-focus'`).
  - `SurfaceState` adds optional `camera`, `backgroundVisibility` at the top level.
  - `SurfaceContent` adds the union of slot fields (`title?`, `sourceUrl?`, `author?`, `source?`, `dateLabel?`). All optional.
  - Add `Overlay`, `OverlayPosition`, `LayerEffectChain`, `Effect` schemas.
  - `EngineState` adds `overlays: Overlay[]` and `effects: LayerEffectChain`.
  - `createDefaultEngineState()` defaults `overlays: []`, `effects: { surface: [], body: [], annotations: [], overlays: [], frame: [] }`.
  - Surface narrowing helpers (`isResearchPaperSurface`, `isQuoteFocusSurface`, `getResearchPaperSurface`, `getQuoteFocusSurface`, `getQuoteFocusMarkAppearance`) deleted or replaced with `getPaperSurface` / `getPlainSurface` as needed.
- `src/lib/platform/engine-state.svelte.ts` — remove narrowing helpers above; remove `ensureMarkTimingAtIndex` only if no longer referenced.
- `src/lib/platform/preset.ts` — `applyPreset` walks the new shape (transport + typography + marks + surface + overlays + effects, with surface's camera + backgroundVisibility now at the top level of surface).
- `src/lib/presets/*.json` (all 6) — migrate by hand:
  - `research-paper-*.json` → set `surface.type: 'paper'`. Add `overlays: []` and the empty `effects` chain. Everything else carries.
  - `quote-focus-*.json` → set `surface.type: 'paper'` (or `'plain'`); drop `surface.focus`, `surface.mark`; move `surface.camera` and `surface.backgroundVisibility` to the new top level of `SurfaceState`. Rewrite the body's marked segment to use **both** styles in its `markStyles` array: the old `focus.style` (focal) and the old `mark.style` (decorative).
    - Example: old `focus.style: 'magnify'` + `mark.style: 'side-note'` → segment `markStyles: ['magnify', 'side-note']`.
    - Example: old `focus.style: 'lift-out'` + `mark.style: 'underline'` → segment `markStyles: ['lift-out', 'underline']`.
    - Example: old `focus.style: 'tear-out'` + `mark.style: 'circle'` → segment `markStyles: ['tear-out', 'circle']`.
    - If old `mark.style: 'none'`, the new `markStyles` has just the focal style.
  - Add `overlays: []` and `effects: { surface: [], body: [], annotations: [], overlays: [], frame: [] }` to every preset.
- `scripts/verify-presets.ts` — update the cross-surface remix fixture to use new shape; add a basic overlay fixture and an empty-effect-chain fixture.
- `scripts/export-preset-schema.ts` — no changes; just re-run.
- `docs/presets/engine.md` — describe the new shape (overlays section, effects section, paper/plain surface variants).

**Files modified (UI temporarily kept working):**
- `src/lib/tools/research-paper/*` — rename internal references from `research-paper` to `paper` where they identify the surface type. The directory may keep its name temporarily; it gets deleted in step 7.
- `src/lib/tools/quote-focus/*` — same. The directory keeps its name temporarily; gets deleted in step 7. Quote-focus internals stop being a distinct "surface" — they become "the focal-annotation path inside the paper surface."

**Verification per step 5:**
- `npx svelte-check` clean.
- `node --experimental-strip-types scripts/verify-presets.ts` clean against the new shape. **No `hiviz@1` preset in the old shape will validate** — that is by design.
- Re-run `node --experimental-strip-types scripts/export-preset-schema.ts`; commit `docs/presets/engine.schema.json`.
- Browser load of each migrated preset renders correctly. Surface routes still resolve via the old `*Workspace.svelte` components (deleted in step 7). The `/p/[slug]` route picks the right workspace based on `surface.type` (now `'paper'` or `'plain'`).

### Step 6 — First real overlay + first real effect

**Goal:** validate the overlay and effect plumbing on real content. Adds one of each kind; nothing else changes.

**Files added:**
- `src/lib/pipelines/overlays/lower-third/index.ts` — `OverlayRenderer` registration: `type: 'lower-third'`, content schema `{ kicker: string; title: string; subtitle?: string }`, position default `{ anchor: 'bottom-left', offset: { x: 64, y: 64 } }`, enter/exit timing.
- `src/lib/pipelines/overlays/lower-third/CanvasSource.svelte` — the HTML/CSS for the lower-third strip.
- `src/lib/pipelines/effects/paper-grain/index.ts` — `EffectRenderer` registration: `type: 'paper-grain'`, WGSL pass that adds the existing paper-grain to whatever texture is bound. Pulled from the existing paper chrome shader.

**Files modified:**
- `src/lib/platform/pipelines/index.ts` — register the new overlay and effect.
- `src/lib/platform/engine-schema.ts` — `OverlayType` and `EffectType` unions now include the registered names (string enums).
- `scripts/verify-presets.ts` — add a fixture preset that uses one `lower-third` overlay and one `paper-grain` effect; assert it parses.

**Verification per step 6:**
- `npx svelte-check` clean.
- New fixture in `verify-presets.ts` passes.
- A built-in preset that uses the lower-third overlay (add one new built-in preset for this test) loads in the browser; the lower-third div renders inside the DOM at the declared position; canvas pipeline continues without error.

### Step 7 — Delete per-tool Svelte files + mount the unified shell

**Goal:** complete the architectural collapse. There is no per-tool UI after this step.

**Files added:**
- `src/lib/platform/Workspace.svelte` — mounts `VideoFrame` + `TimelineScrubber` + `TimelineTrackView` + `Controls`. Reads `engineState.surface.type` to pick the surface renderer from the registry. Owns the GPU host, the composition pipeline, the Timeline.
- `src/lib/platform/Controls.svelte` — content section (body editor dispatch via per-block `Editor`, plus slot inputs from the active surface's `contentSlots`) + appearance (typography) + transport + overlays panel + effects panel. No per-surface branching.
- `src/lib/platform/TrackInspector.svelte` — selection-driven inspector that switches between mark / overlay / surface-transition / per-block timing controls. Mounts `BlockRenderer.Inspector`, `OverlayRenderer.Inspector`, `EffectRenderer.Inspector` when registered.
- `src/lib/pipelines/surfaces/paper/index.ts` — `SurfaceRenderer` for `paper`. Contains the WGSL/2D code currently in `research-paper-pipeline.ts`.
- `src/lib/pipelines/surfaces/paper/CanvasSource.svelte` — content layout. Migrated from `ResearchPaperCanvasSource.svelte`.
- `src/lib/pipelines/surfaces/plain/index.ts` — `SurfaceRenderer` for `plain`. Minimal pipeline; no chrome.
- `src/lib/pipelines/surfaces/plain/CanvasSource.svelte` — minimal HTML wrapper.
- `src/lib/pipelines/blocks/paragraph/index.ts` — `BlockRenderer` for `paragraph`. No `Editor` field (falls back to the shared `AnnotationTextEditor`).

**Files deleted (every one of these is gone after step 7):**
- `src/lib/tools/research-paper/` (entire directory).
- `src/lib/tools/quote-focus/` (entire directory).
- `src/lib/platform/ToolRunner.svelte`.
- `src/lib/platform/ToolWorkspace.svelte`.
- `src/lib/platform/tool.ts`.

**Files modified:**
- `src/routes/p/[slug]/+page.svelte` — render `<Workspace />` directly (no surface-type branching). The route still applies the preset on mount.

**Verification per step 7:**
- `npx svelte-check` clean.
- `grep -rn "$lib/tools" src/ && grep -rn "ToolRunner\|ToolWorkspace\|researchPaperTool\|quoteFocusTool" src/` returns **no matches**.
- Every preset still loads from `/p/<slug>`; the canvas renders; the controls panel renders; the timeline renders; the inspector activates on track click.
- Console clean across all 6 (now-migrated) presets.

### Step 8 — Future additions (no further architectural changes)

After step 7, adding a surface, overlay, effect, or block is one of:

- **New surface** (`tweet`, `webpage`, `timeline-explainer`): create `src/lib/pipelines/surfaces/<name>/{ index.ts, CanvasSource.svelte }`; register in `PIPELINE_REGISTRY.surfaces`; add to `SurfaceType` union; add fixture preset.
- **New overlay**: create `src/lib/pipelines/overlays/<name>/{ index.ts, CanvasSource.svelte }`; register in `PIPELINE_REGISTRY.overlays`; add to `OverlayType` union.
- **New effect**: create `src/lib/pipelines/effects/<name>/index.ts`; register; add to `EffectType` union.
- **New block** (`mermaid-diagram`, `code`, `image`, `chart`): create `src/lib/pipelines/blocks/<name>/{ index.ts, Editor.svelte? }`; register; extend `Block` union with the new variant; extend `BlockType`. Annotation rendering on the new block requires the agent to specify the targeting model (see Open question 1).

**No new architectural files.** No edits to `Workspace.svelte`, `Controls.svelte`, `TrackInspector.svelte`, `composition.ts`, or `effect-chain.ts` for additive primitives.

## Decisions (workshop output)

These are the resolved choices from the workshop. They are normative — implementation conforms to these unless we explicitly re-open the question.

1. **Preset schema id stays `hiviz@1`.** The step-5 shape change happens in place. Built-in presets are hand-migrated. Hand-rolled external `hiviz@1` presets from the old shape will fail validation cleanly — that is acceptable since no public preset surface exists yet.
2. **`paper` and `plain` are separate `SurfaceRenderer`s.** `paper` owns the card chrome, paper-grain shader, and fly-in/out animation. `plain` is a transparent background that hosts a body without chrome. Future container surfaces follow the same pattern.
3. **Annotation stack order: decorative under focal, then document order.** Codified in the composition shader. Two focal annotations on the same body are allowed and stack by document position; this is permitted by the schema but flagged as a soft warning at preset validation since it is almost always a smell.
4. **Surface-level slots stay as named fields on `SurfaceContent`.** Title, source URL, author, source, date label, and any future per-surface chrome fields are declared per-surface via `contentSlots` metadata. Rationale: with HTML-in-canvas as the layout surface, slots map cleanly to the HTML structure the surface renders — there is no advantage to expressing chrome content as additional block types.
5. **Default overlay positioning is `anchor + pixel offset`.** `{ anchor: 'bottom-left', offset: { x: 24, y: 24 } }` is the canonical form. Normalized rect is supported in the schema for precise placement but is not the default in AI-authoring documentation.
6. **Specialized inspectors: contract designed now, components shipped only when needed.** `BlockRenderer.Inspector`, `OverlayRenderer.Inspector`, and `EffectRenderer.Inspector` are optional Svelte components rendered inside `TrackInspector` when the matching primitive is selected. No specialized inspector ships in the initial migration. The first one will land alongside whichever block needs it first (likely mermaid). `SurfaceRenderer` and `AnnotationRenderer` never ship specialized inspectors.

   The block-editor surface in the controls panel (the "body" editor) likewise allows different block types to expose their own editing controls under a shared container — different fields per block type, one consistent inspector chrome. The contract lets each `BlockRenderer` declare an `Editor` component for its block type; the shared body editor mounts the right one per block.
7. **Effects are static.** No `animation` block on effect params in v1. If a future effect type (e.g. `noise` with timed ramp) needs animation, it can opt in via its own `params` schema; the shared inspector will not auto-render timing controls for effects.
8. **Mermaid blocks are deferred entirely.** Not in the initial block-type set. Decision on runtime vs. build-time rendering postponed until we actually build the block.
9. **Per-layer effect chains support duplicate effects.** Two `vhs` passes on `effects.body` is valid. No special handling.
10. **Shader caps: 4 effects per layer × 5 layers + 8 focal annotation slots.** Sized into the composition shader's uniform block at this fixed size. Grow when a real preset hits a limit.
11. **Exports include all effects.** No clean-export toggle. WYSIWYG: the rendered output matches the preview at the chosen `Timeline.time`. If a workflow needs a clean variant, edit the preset to remove the effects and export again.
12. **Code blocks are deferred.** Not in the initial block-type set. The animation-between-code-states problem is non-trivial and worth designing on its own; defer until we have a concrete need.

### Implications

- The initial `BlockType` union is just `'paragraph'`. The `Block` discriminator exists from day one so future block types can land additively without another shape change.
- The initial `OverlayType` and `EffectType` unions ship empty (or with one stub each — `lower-third` and `paper-grain` — to validate the plumbing on real content as step 6 of the migration).
- The composition shader is sized for caps from day one even when those slots are mostly inactive. The uniform block carries the maximum every frame; unused slots contribute zero.

## Open questions

These genuinely need a prototype before they can be answered. Numbered for cross-reference from the migration sequence.

1. **Annotation stack on non-text blocks.** When mermaid or code blocks ship, annotations will need to attach to non-text targets (a node in the diagram, a line range in code). The data model field for the target (today implicit from inline mark position in a paragraph) needs to grow. Defer until the first non-paragraph block is built.
2. **Specialized inspector activation.** The contract is "Inspector is rendered when the matching primitive is selected on the timeline." Multi-element selection (e.g. select two marks at once) and selection-less editing (the body editor is always visible regardless of selection) are edge cases that need a concrete UX pass.

## Non-goals

- Cross-pipeline morphing at runtime. Switching surface/block/annotation/overlay/effect type is a content edit, not an animated transition.
- Coordinate-anchored marks. Inline marks in blocks remain the only addressing model for text annotations.
- Cloud sync, user accounts, multi-user editing.
- Animated mark style changes (a mark's style is fixed for the duration of an animation).
- Runtime authoring of new pipeline kinds (surfaces, blocks, annotations, overlays, effects) by users. Only code changes ship new kinds.
