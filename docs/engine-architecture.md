# Hiviz Engine Architecture

The data model, rendering layers, pipeline registry, and current shell that drive every Hiviz **Preset**. Companion to [`preset-format.md`](preset-format.md), which is the preset JSON format reference.

Glossary: [`CONTEXT.md`](CONTEXT.md). Historical rationale for this shape: [ADR-0002](adr/0002-per-tool-routes-to-preset-engine.md).

## Goal

One engine that can produce every overlay Hiviz needs — research-paper card, magnified quote, tweet card with a side note, animated mermaid diagram, lower third, subscribe button, plus things we have not thought of yet — without growing parallel tools, parallel state files, or parallel UI per content type.

The engine treats every render as a stack of **Layers**, each composed of typed primitives the engine knows how to draw, animate, and post-process. New content types add primitives to the right Layer. They do not add tools.

Two architectural constraints anchor everything else:

1. **The data model is the contract.** Everything renderable is described in `engineState`. Pipelines own no state.
2. **Layered rendering is uniform.** Surface chrome, body blocks, annotations, overlays, and post-process effects all share the same WebGPU/TypeGPU compositor. One render path; identical preview and export.

## File layout

```
src/lib/
  platform/
    Workspace.svelte           # one workspace; reads engineState
    Composition.svelte         # canvas-sized root; mounts SurfaceMount + OverlayMount
    SurfaceMount.svelte        # mounts the current SurfaceRenderer's CanvasSource
    OverlayMount.svelte        # iterates engineState.overlays, mounts each CanvasSource
    OverlayLayer.svelte        # absolute-positioned overlay container
    Controls.svelte            # one controls panel; dispatches to per-primitive editors
    TrackInspector.svelte      # one inspector; per-selection
    timeline.svelte.ts         # Timeline class
    TimelineScrubber.svelte    # transport UI
    TimelineTrackView.svelte   # track lanes UI
    VideoFrame.svelte          # 4K canvas wrapper
    ExportPanel.svelte         # export controls
    gpu-host.ts                # TypeGPU init
    html-in-canvas.ts          # experimental API wrappers
    anim-state.svelte.ts       # shared animation state
    animation-manager.ts       # GSAP timeline driver
    export-video.ts            # Mediabunny WebM + ProRes
    engine-schema.ts           # Zod schema, types, defaults
    engine-state.svelte.ts     # runtime state + helpers
    preset.ts                  # parsePreset, applyPreset, listPresets
    preset-rubric.ts           # rubric structures
    runtime-audit.ts           # runtime invariant checks
    pipelines/
      index.ts                 # PIPELINE_REGISTRY (single source of truth)
      types.ts                 # *Renderer interfaces
      effect-chain.ts          # ping-pong post-process executor
  pipelines/
    surfaces/{paper,plain}/    # SurfaceRenderer per surface
    blocks/paragraph/          # BlockRenderer per block type
    annotations/{highlight,underline,strike,circle,box,side-note,
                 magnify,lift-out,tear-out,isolate}/
                               # AnnotationRenderer per style
    overlays/{lower-third,watermark}/
                               # OverlayRenderer per overlay type
    effects/paper-grain/       # EffectRenderer per effect type
  annotations/                 # shared annotation primitives
    annotation-marks.ts        # AnnotationStyle union, draw helpers
    annotation-text-dom.ts     # DOM ↔ AnnotationBody serialization
    annotation-mark-styles.ts  # per-style appearance defaults
    AnnotationTextEditor.svelte # contenteditable body editor
  presets/*.json               # built-in Presets
  utils/                       # the only utility folder
```

There is no `src/lib/tools/` — see [ADR-0002](adr/0002-per-tool-routes-to-preset-engine.md).

## Verification commands

The shell out of which any architectural change is verified. Agents should not need to invent any others.

| Command | Purpose | Success signal |
|---|---|---|
| `npx svelte-check --tsconfig ./tsconfig.json` | Type-check the whole project | `0 ERRORS 0 WARNINGS` on the final line |
| `node --experimental-strip-types scripts/verify-presets.ts` | Validate built-in presets + remix fixtures | All `✓` lines, no `✗` |
| `node --experimental-strip-types scripts/export-preset-schema.ts` | Regenerate `docs/preset-format.schema.json` | `Wrote …/engine.schema.json` |
| `npx vite build` | Smoke-test that the Cloudflare build succeeds | `✓ built in <N>s` |

### Browser checks

The dev server is already running at `http://localhost:5173` — never start a new one. Use the chrome-devtools MCP. That browser has `chrome://flags/#canvas-draw-element` enabled, so the HTML-in-Canvas pipeline runs to completion and pixel-level checks are automated alongside structural ones.

| Tool | Purpose |
|---|---|
| `mcp__chrome-devtools__navigate_page` | Load a route, optionally with an `initScript` |
| `mcp__chrome-devtools__list_console_messages` | Read console (filter for `warn`/`error`) |
| `mcp__chrome-devtools__take_snapshot` | A11y snapshot of the live page |
| `mcp__chrome-devtools__take_screenshot` | Capture the rendered canvas |
| `mcp__chrome-devtools__evaluate_script` | Inspect DOM, run probes, read `canvas.toDataURL()` |

For Critic-driven verification (the default flow for "is this preset done?"), see [`critic.md`](critic.md).

## The five Layers

A frame composes bottom-to-top:

```
+----------------------------------------------------------+
| 5. Frame post-process (whole-frame shader chain)         |
+----------------------------------------------------------+
| 4. Overlays      (lower-thirds, watermark, ...)          |
+----------------------------------------------------------+
| 3. Annotations   (per-span / per-block marks on body)    |
+----------------------------------------------------------+
| 2. Body          (sequence of typed Blocks)              |
+----------------------------------------------------------+
| 1. Surface chrome (paper card, tweet card, plain bg, …)  |
+----------------------------------------------------------+
```

Each Layer has its own **post-process shader chain** (zero or more WGSL passes that run after the Layer renders, before composition). A VHS shader on the body Layer affects body + annotations but not the chrome. A film-grain shader on the frame Layer affects everything. Per-Layer effects unlock targeted treatment without polluting other Layers.

### Layer types

| Layer | What it draws | Owns animation? | Post-process supported |
|---|---|---|---|
| Surface chrome | The container: paper card, tweet card, webpage frame, timeline graphic, plain background | Yes — surface-level (enter, exit, camera) | Yes |
| Body | A sequence of `Block`s rendered inside the surface | Per-block animation declared in state | Yes |
| Annotations | Per-span effects on text blocks; per-block effects on non-text blocks | Per-mark timing | Yes |
| Overlays | Surface-positioned scene elements not tied to body content | Per-overlay timing | Yes |
| Frame post-process | Whole-frame shader chain | N/A; runs every frame | The post-process *is* the Layer |

## Conceptual primitives

Four extensible primitives. Each is a small registry entry: a schema + a renderer + (optionally) a specialized UI component.

### `SurfaceRenderer`

Renders the chrome. Examples: `paper`, `plain`, `tweet`, `webpage`, `timeline-explainer`, `studio`, `slide`. Declares which content slots and which surface-level transitions it supports.

### `BlockRenderer`

Renders one body block. Examples: `paragraph` (the current annotated-text block), `mermaid-diagram` (animated mermaid), `image`, `code`, `chart`. A body is `Block[]`; each block has a `type` discriminator.

### `AnnotationRenderer`

Renders one annotation style on a target. Two kinds:

- **Decorative** — additive overlay on the target (highlight, underline, strike, circle, box, side-note).
- **Focal** — pulls attention to the target and may transform the surroundings (magnify, lift-out, tear-out, isolate, callout).

### `OverlayRenderer`

Renders one surface-positioned scene element (`lower-third`, `subscribe-button`, `watermark`, `captions`, `caption-card`, `progress-bar`). Has a position spec, its own enter/exit animation, and its own content schema.

### `EffectRenderer`

A single WGSL post-process pass: vertex + fragment + uniform layout (`vhs`, `crt`, `film-grain`, `chromatic-aberration`, `bloom`, `vignette`, `paper-grain`). Effects compose into a chain (state lists them in order). The same effect type can apply to multiple Layers and at multiple chain positions.

Every primitive is registered in one explicit registry file (`$lib/platform/pipelines/index.ts`). No side-effect imports.

## Data model

```ts
// All four primitive-type unions are open: new variants land additively in code,
// no schema migration required. The lists below show what ships today (★).

type SurfaceType =
  | 'paper'       // ★ research-paper card with grain shader + fly-in
  | 'plain'       // ★ transparent background, body only
  | 'tweet'       //   future
  | 'webpage'     //   future
  | 'timeline-explainer'; // future

type BlockType =
  | 'paragraph';  // ★ only block type today
  // future: 'mermaid-diagram' | 'image' | 'code' | 'chart' | …

type AnnotationStyle =
  // decorative — additive on/around the marked target, no scene-wide effect
  | 'highlight' | 'underline' | 'strike' | 'circle' | 'box' | 'side-note'
  // focal — changes the scene around the target (dim / magnify / displace / tear)
  | 'magnify' | 'lift-out' | 'tear-out' | 'isolate' | 'callout';

type OverlayType =
  | 'lower-third' // ★
  | 'watermark';  // ★
  // future: 'subscribe-button' | 'captions' | 'progress-bar' | …

type EffectType =
  | 'paper-grain'; // ★
  // future: 'vhs' | 'crt' | 'film-grain' | 'chromatic-aberration' | 'bloom' | 'vignette' | …

type LayerName = 'surface' | 'body' | 'annotations' | 'overlays' | 'frame';

interface EngineState {
  transport: Transport;
  typography: Typography;
  marks: MarksState;
  surface: SurfaceState;
  overlays: Overlay[];
  effects: LayerEffectChain;   // post-process per Layer
}

interface SurfaceState {
  type: SurfaceType;
  content: SurfaceContent;
  enter?: Transition;
  exit?: Transition;
  camera?: 'none' | 'push' | 'snap';
  backgroundVisibility?: number;
}

interface SurfaceContent {
  // On disk, `body` is a bracket-text string (see "Body text format" below).
  // The schema parses it into Block[] at preset load; the runtime type is Block[].
  body: string;
  title?: string;
  sourceUrl?: string;
  author?: string;
  source?: string;
  dateLabel?: string;
  // additional slots declared by SurfaceRenderer.contentSlots
}

// Runtime-only shape (not authored directly in preset JSON).
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
  // span stack visually: decorative first (document order, then declared order
  // within the segment); focal next (document order; later focal slots overlap
  // earlier ones in the composition shader). See "Annotation stack order".
  markStyles: AnnotationStyle[];
}

interface MermaidBlock {
  type: 'mermaid-diagram';
  source: string;
  buildIn?: Transition;
}

interface ImageBlock { type: 'image'; src: string; alt: string; }
interface CodeBlock { type: 'code'; language: string; source: string; lineHighlights?: number[]; }
interface ChartBlock { /* future */ }

interface MarksState {
  defaults: Record<AnnotationStyle, MarkAppearance>;
  // Index-aligned with (segment, style) pairs flattened across all body blocks
  // in document order, then by markStyles[] array order within each segment.
  // Missing trailing entries fall back to defaults[style]. Extras ignored.
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
  offset?: { x: number; y: number };  // 0..1 fractions of composition dimensions, anchor-relative
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
  // Effects are static (no animation block on params). A future effect that
  // needs to animate can opt in inside its own params.
}
```

The preset schema id is `hiviz@1`. Every preset is one JSON document; surfaces, blocks, annotations, overlays, and effects all live in the same envelope.

### Body text format

Paragraph block bodies are stored on disk as a single bracket-tag string and parsed by `parseAnnotationBodyText` (`$lib/annotations/annotation-body-text.ts`) into the runtime `Block[]` shape.

- Paragraphs are separated by two or more newlines (`\n\n`).
- Marks wrap text with paired tags: `[highlight]text[/highlight]`, `[circle]term[/circle]`, etc. All `AnnotationStyle` names are valid tags.
- Marks stack by nesting tags: `[magnify][side-note]quote[/side-note][/magnify]` parses to one segment with `markStyles: ['magnify', 'side-note']`. Decorative-under-focal stack ordering is enforced in the composition shader, so authoring order within nested tags does not affect rendering.

Per-mark appearance and timing live in `marks.timings[index]`, keyed by the position of each `(segment, style)` pair in document order. `marks.defaults[style]` is the per-style fallback. There is intentionally no inline-on-tag attribute syntax.

Reference example (from `src/lib/presets/research-paper-critique.json`):

```json
{
  "body": "We trained the model on the WMT 2014 set.\n\nFor each task we used the [highlight]base Transformer model[/highlight] without tuning, relying on [underline]attention dropout[/underline] and label smoothing instead.\n\nResults on the WMT 2014 [circle]English-to-German[/circle] task are reported using BLEU."
}
```

Three marks → three entries in `marks.timings`.

## Rendering architecture (TypeGPU)

The composition is built in one Surface Pipeline that composes surface + body + annotations into a single output texture, with optional per-target `shaderPass` work between DOM upload and the final composite. A single composition-wide effect chain runs after composition, into the canvas. See [ADR-0018](adr/0018-collapse-effects-to-frame-only.md) for why effects are not per-layer.

```
                                                          GpuHost (TypeGPU)
                                                          ↓
                                    ┌──────────────────────────────────────────────┐
                                    │ 1) Surface Pipeline                          │
                                    │    HTML-in-Canvas DOM upload of the composed │
                                    │    surface card (chrome + body + annotation  │
                                    │    marks + focal warp from composition UB)   │
                                    │    → compositionTex                          │
                                    └──────────────┬───────────────────────────────┘
                                                   ▼
                                    ┌──────────────────────────────────────────────┐
                                    │ 2) Shader-pass dispatcher (ADR-0010)         │
                                    │    Runs any SurfaceRenderer.shaderPass /     │
                                    │    OverlayRenderer.shaderPass declared by    │
                                    │    the active pipelines, in document order   │
                                    │    over ping-pong intermediates              │
                                    │    → postShaderTex                           │
                                    └──────────────┬───────────────────────────────┘
                                                   ▼
                                    ┌──────────────────────────────────────────────┐
                                    │ 3) Effect chain                              │
                                    │    Ping-pongs over a pair of intermediates,  │
                                    │    applying each Effect in engineState       │
                                    │    .effects in order                         │
                                    │    → final canvas                            │
                                    └──────────────────────────────────────────────┘
```

### Post-process effects

The effect chain ping-pongs over a pair of canvas-sized intermediates, applying each `Effect` in `engineState.effects` in declaration order. Effects are pure post-process: they read a source texture, write a destination texture. No effect needs scene knowledge beyond its uniforms. Adding `crt` is one shader file and one entry.

Per-target shader work (substrate physics, per-overlay edge treatment) is **not** an Effect — it is a `shaderPass` declared on the `SurfaceRenderer` or `OverlayRenderer` and run by the shader-pass dispatcher between DOM upload and the effect chain. See [ADR-0005](adr/0005-overlay-renderer-shader-pass.md), [ADR-0008](adr/0008-newspaper-surface-pipeline.md), [ADR-0010](adr/0010-compose-pipeline-shaderpass-invocation.md).

### Composition uniform block

Up to **8 active focal slots** in the composition shader, each `{ rect: vec4f, magnify: f32, dim: f32, tear: f32, style: u32 }`. The fragment iterates slots and routes by `style` to the right warp. Adding a focal style adds a case in this shader, not a new pipeline.

Soft cap on the effect chain is 3 entries today (enforced by the Controls panel). Grow when a real preset hits the limit.

### Determinism + export parity

Every render is computed from a `timestamp`, never from wall-clock. The shared `Timeline` is the only clock. Export uses the same `renderFrame(frame, timestamp)` path as preview, so what you see is what you get. One render path, identical preview and export.

**Exports include all effects.** No clean-export toggle. If a workflow needs a clean variant, edit the preset to remove the effects and export again.

### Performance considerations

- **Texture allocation budget.** A frame allocates: 1 composition tex + 2 shader-pass ping-pong intermediates + 2 effect-chain ping-pong intermediates ≈ 5 RGBA8 textures at canvas resolution. At 3840×2160 that is ~170 MB of GPU memory.
- **Effect chain cost.** Each effect is one render pass over the canvas. 3 effects at 4K ≈ 3 fullscreen passes. Profile before adding heavy effects (bloom is multi-pass internally).
- **Mermaid / heavy blocks.** Blocks that need their own DOM render use a hidden `layoutsubtree` canvas child + `copyElementImageToTexture`. Re-render only when the block's source changes; cache otherwise.

## Pipeline registry

```ts
// $lib/platform/pipelines/index.ts (the single source of truth)

interface SurfaceRenderer {
  type: SurfaceType;
  label: string;
  controls: SurfaceControlsMetadata;
  CanvasSource: SvelteComponent;
  createPipeline(opts: PipelineFactoryOptions): SurfaceRenderInstance;
  defaults(): SurfaceState;
}

interface BlockRenderer<TBlock extends Block> {
  type: TBlock['type'];
  schema: z.ZodType<TBlock>;
  CanvasSource: SvelteComponent;
  render?(ctx: BlockRenderContext<TBlock>): void;
  Editor?: SvelteComponent;
  Inspector?: SvelteComponent;
}

interface AnnotationRenderer {
  style: AnnotationStyle;
  kind: 'decorative' | 'focal';
  // 'block' is the wildcard. Listing specific block types means "only valid on these".
  appliesTo: ('paragraph' | 'mermaid-diagram' | 'image' | 'code' | 'chart' | 'block')[];
  draw(ctx: AnnotationDrawContext): void;
}

interface OverlayRenderer<TOverlay extends Overlay> {
  type: TOverlay['type'];
  label: string;
  schema: z.ZodType<TOverlay>;
  CanvasSource: SvelteComponent;
  Editor: SvelteComponent;
  defaults(): OverlayDefaults<TOverlay>;
  Inspector?: SvelteComponent;
}

interface EffectRenderer {
  type: EffectType;
  label: string;
  schema: z.ZodType<{ type: EffectType; id: string; params: unknown }>;
  wgsl: WGSLEffectPass;
  uniforms: UniformLayout;
  defaults(): { params: unknown };
  Editor?: SvelteComponent;
  Inspector?: SvelteComponent;
}

export const PIPELINE_REGISTRY = {
  surfaces:   { paper, plain },
  blocks:     { paragraph },
  annotations:{ highlight, underline, strike, circle, box, sideNote,
                magnify, liftOut, tearOut, isolate },
  overlays:   { lowerThird, watermark },
  effects:    { paperGrain }
} as const;
```

### How the registry plugs into schema validation

`Overlay.type` and `Effect.type` in the Zod schema are typed as string enums **derived from the registry**. The schema file (`engine-schema.ts`) imports the type strings from `pipelines/index.ts` and constructs `z.enum(...)` with them. Adding an effect therefore touches three files: the effect's own `index.ts`, the registry's `pipelines/index.ts`, and the enum constructor in `engine-schema.ts` (one line per addition). Validation rejects unknown types at preset load.

Per-effect `params` schemas are **not** part of the master schema. Each `EffectRenderer.schema` validates its own `params` shape when the effect is applied — a preset with a malformed `params` block fails the second validation pass (`applyPreset`), not the first (`parsePreset`).

### Concrete example: registering an effect

The `paper-grain` effect is the minimal pattern. Reference for any future effect.

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

export const paperGrain: EffectRenderer = {
  type: 'paper-grain',
  label: 'Paper grain',
  schema: z.object({
    type: z.literal('paper-grain'),
    id: z.string(),
    params: PaperGrainParams
  }),
  wgsl: paperGrainPass,
  uniforms: PaperGrainUniforms,
  defaults: () => ({ params: { warmth: 0.5, density: 0.3 } })
};
```

```ts
// src/lib/platform/pipelines/index.ts
import { paperGrain } from '$lib/pipelines/effects/paper-grain';

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
```

Surfaces, blocks, annotations, and overlays follow the same shape with their corresponding `*Renderer` interface and registry slot.

### Annotation stack order

The composition shader processes annotations as follows. The traversal is: flatten every `(segment, markStyles[i])` pair across all body blocks in document order, then within each segment by `markStyles[]` array order.

1. **Decorative annotations** render into `annotationDecorativeTex` in traversal order (later marks draw on top of overlap).
2. **Focal annotations** populate the composition uniform block's focal-slots array in traversal order. The composition fragment iterates slots `0..N`. Later slots win where they overlap. Two focal marks on overlapping spans is permitted but soft-warned at preset validation.
3. **Within a segment with multiple `markStyles`**, decorative styles render before focal styles regardless of array order. `markStyles: ['magnify', 'underline']` and `['underline', 'magnify']` produce identical output.
4. **Final composition order:** `surface' → body' → annotationDecorativeTex' → focal warps → overlays' → frame effects`. Focal warps apply to the already-composed surface + body + decorative stack so a magnify lens visually contains everything underneath.

## Text animation orchestration

The text-animation module lives at `src/lib/text-animations/` and is peer to the five rendered Layers — it does not render. It choreographs the DOM that HTML-in-Canvas captures into the WebGPU composite, by emitting GSAP `AnimationTweenSpec[]` against SplitText-produced unit spans and feeding them into the existing `AnimationManager` so every text-animation tween scrubs by `progress = time / durationSeconds` alongside surface enter/exit, overlay enter/exit, and `marks.timings[]`. See [ADR-0011](adr/0011-text-animation-orchestration.md) for the full decision lattice (engine-state vs sixth Layer, vendored catalog, GSAP SplitText, frame-deterministic single-pass, marks ride-along).

### Module layout

```
src/lib/text-animations/
├── raw-catalog/                       vendored from pixel-point/animate-text (pinned sha)
│   ├── specs/<id>.json                portable motion contracts (24)
│   ├── effects/<id>.json              exact effect recipes (24)
│   ├── runtime-presets.json
│   ├── stage-presets.json
│   ├── library-adapters.json
│   ├── samples.json
│   └── CATALOG_SOURCE.md              upstream sha + license
├── raw-catalog-bundle.ts              generated TS module that re-exports the JSON
├── catalog.ts                         typed EFFECT_CATALOG: ReadonlyMap<EffectId, EffectSpec>; zod-validated on load
├── unit-types.ts                      shared types for split units (char / word / line)
├── split-text.ts                      GSAP SplitText wrapper that produces stable per-slot span maps
├── compile.ts                         pure: compile(entry, targetEl, transport) → AnimationTweenSpec[]
├── strategies/
│   ├── generic-stagger.ts             covers 21 effects via per-effect from/to keyframes
│   ├── kinetic-center-build.ts        center-out phrase build (layout-aware)
│   ├── kinetic-top-build.ts           top-down stacked line build (layout-aware)
│   └── shared-slide-opacity-stage.ts  whole-phrase translate + per-word opacity stagger
├── manager.svelte.ts                  TextAnimationManager: observes engineState.textAnimations,
│                                      resolves DOM nodes via data-text-anim-slot, splits text,
│                                      compiles tweens, hands to AnimationManager, exposes
│                                      unitAlphaAt(slot, unitIndex) for marks coupling
└── compile.test.ts                    24 effects × 5 progress samples = 120 snapshots
```

### Integration seams

- **Schema** — `EngineStateSchema` gains `textAnimations: TextAnimation[].default([])`. The discriminated `target` union encodes surface-vs-overlay slot identity. Parse-time validators enforce the slot rule (per-character → title-scale only; layout-aware renderers → title-scale only; one entry per slot; effect ∈ catalog).
- **DOM** — every animatable text container carries `data-text-anim-slot="<slot-name>"` so `TextAnimationManager` can resolve targets without coupling to component internals. Surfaces (`paper`, `plain`, `newspaper`) and `lower-third` overlay's `CanvasSource` set the attribute; no other rewrites required.
- **AnimationManager** — the existing paused-GSAP-timeline scrubber receives `AnimationTweenSpec[]` from the text-anim compiler exactly like it does from mark timings or transition tweens. Nothing about the scrub path knows or cares that the inputs come from a new module.
- **Marks renderer** — when a body has both a `textAnimations[]` entry and `marks.timings[]` entries, the marks renderer multiplies its drawn alpha by `TextAnimationManager.unitAlphaAt(slot, unitIndex)` per frame so marks ride along with their unit's animated alpha. When `textAnimations[]` is empty the path is a no-op.
- **Control Panel** — per-slot Motion picker inline on each animatable input, plus a "Text Motion" section that lists `textAnimations[]` entries with full inputs. Each entry shows as a track segment in the timeline rail.

### Adding a new text effect

A new generic-stagger effect from upstream lands as data:

1. Re-run `scripts/sync-text-animation-catalog.ts` to refresh `raw-catalog/` and regenerate `raw-catalog-bundle.ts` from the pinned sha.
2. The catalog's zod validator runs at module load; if the upstream shape drifts, it throws on import and the build fails loudly.
3. New effect ids automatically resolve through `compile.ts` because the generic-stagger strategy reads from `enter.from` / `enter.to` / `enter.duration_ms` / `enter.stagger_ms` in the catalog — no code change required.

A new layout-aware renderer requires a new strategy file under `strategies/` and a dispatch entry in `compile.ts`. Each existing strategy is ~80–200 LOC and reads the recipe (`canonical_loop_pseudocode`, `keyframe_recipe`) from the catalog JSON, so the pattern is bounded.

### Out of scope (v1)

- **Multi-phrase swap.** The skill's `swap` semantics (cycling phrases inside one slot) would need slot content to become `string | { static, phrases[] }`. Deferred to a follow-up Brief.
- **Per-character on body.** Per-character animation on paragraph-scale text reads as noise; the slot rule restricts to title-scale until a reading-friendly design exists.
- **Wall-clock loop playback.** Hiviz's frame-determinism rule forbids wall-clock animation. The compiler bakes each entry's enter + optional exit into a finite timeline that fits the user-declared window.

## UI structure

Three core components in `$lib/platform/`, all driven by the registry. Adding a new primitive is one folder under `src/lib/pipelines/<kind>/<name>/` — **zero edits to the shell**.

- `Workspace.svelte` — top-level. Hosts the canvas frame + Composition + controls + timeline.
- `Composition.svelte` — canvas-sized root (3840×2160 horizontal, 2160×3840 vertical). Hosts `<SurfaceMount />` + `<OverlayMount />` as siblings. The pipeline captures the Composition root, not the surface article, so overlay positioning is canvas-frame-relative.
- `SurfaceMount.svelte` — looks up `getSurfaceRenderer(engineState.surface.type)` and mounts its `CanvasSource`.
- `OverlayMount.svelte` — iterates `engineState.overlays`, looks up `PIPELINE_REGISTRY.overlays[overlay.type].CanvasSource`, mounts each at the right canvas-pixel position with enter/exit opacity driven by `animState.overlayProgresses`.
- `Controls.svelte` — pure dispatcher. Reads `SurfaceRenderer.controls` metadata for Document/Appearance rows; iterates `engineState.overlays` and mounts each overlay's registered `Editor`. No hardcoded `if (overlay.type === 'x')` anywhere in the shell.
- `TrackInspector.svelte` — selection-driven per-element controls. On a mark track: style + color + intensity + ease. On an overlay track: enter/exit + content (via the overlay's optional `Inspector` when registered, or shared field-driven inputs otherwise). On a surface transition: ease. On a per-block timeline element: that block's `Inspector` (when registered) or shared timing controls.

### Controls panel layout

The panel sections render in this order; each section only appears when applicable:

1. **Surface** — type selector (one entry per registered `SurfaceRenderer`). Changing the type calls the new renderer's `defaults()` and carries body + text-shaped slots across.
2. **Document** — content slots declared by `SurfaceRenderer.controls` (title, sourceUrl, author, source, dateLabel) that the current preset populates, plus the annotation body editor when `controls.body !== 'never'`.
3. **Appearance** — typography (font when there's body text), `paperColor` when the surface declares it, `inkColor` when there's body text, camera + backgroundVisibility when the surface declares them.
4. **Overlays** — `+ Add overlay…` picker lists every registered `OverlayRenderer.type`. Each existing overlay renders as: header (label + Remove), the overlay's registered `Editor`, plus numeric `start`/`duration` + `ease` for `enter` and `exit`.
5. **Effects** — one block per Layer (`frame`, `surface`, `body`, `annotations`, `overlays`). Each has a `+ Add…` picker (every registered `EffectRenderer`) and lists that Layer's effects. Each effect entry: label + Remove + the effect's registered `Editor`.

State-mutating helpers live alongside `engineState` in `engine-state.svelte.ts`: `addOverlay`, `removeOverlay`, `addEffect`, `removeEffect`. Each generates a unique id from the type prefix when one isn't supplied.

### Specialized UI — when justified

Two distinct extension points, both optional:

- `BlockRenderer.Editor` — mounts in the body editor's per-block slot inside `Controls`. Used when a block's content shape doesn't fit a text-style editor (mermaid source + live preview, code with syntax highlighting, image picker, chart data table).
- `BlockRenderer.Inspector`, `OverlayRenderer.Inspector`, `EffectRenderer.Inspector` — mounts inside `TrackInspector` when that primitive is selected. Used when the timing/parameter surface is too rich for a flat field list (a bezier ease curve editor, a multi-stage effect ramp).

A primitive ships either component **only when all** of:

1. Substantial internal structure that can't be expressed as a flat field list.
2. Shared field-driven inspector would degrade UX measurably.
3. The specialized UI is **strictly additive** — lives only inside its declared slot. Cannot inject UI into other panels, layouts, or routes.

`AnnotationRenderer` and `SurfaceRenderer` **never** ship specialized inspectors or editors. Annotation controls are always `{style, color, intensity, ease}`. Surface controls are always the shared shape. If a surface seems to need more, that's a signal the missing concept belongs in the shared model or as a separate block/overlay/effect — not a per-surface UI escape hatch.

### Toolbar discoverability

The body editor toolbar exposes the full annotation style set. With ~10 styles the toolbar gets crowded; group by kind (decorative row, focal row) or move focal styles behind a popover. The overlays panel and effects panel are list-based with an "add" button that opens a picker.

## Current registry contents

Seven deliberate built-in **Presets** in `src/lib/presets/`, each representing a real overlay you'd composite over footage:

- **research-paper-attention** — paper card flying in, highlight on a key claim.
- **research-paper-critique** — paper card, three staggered marks (highlight + underline + circle) across a methodology paragraph.
- **quote-magnify** — paper card with stacked `[magnify][side-note]…` focal/decorative pair on a pulled quote.
- **quote-lift-out** — paper card with stacked `[lift-out][underline]…` on a pulled quote.
- **quote-tear-out** — paper card with stacked `[tear-out][circle]…` on a pulled quote.
- **quote-vertical** — vertical (short-form) variant of the quote pull-out.
- **lower-third** — plain transparent surface with a single `lower-third` overlay (broadcast-chyron name chip).

Registered overlays:

- **`lower-third`** — content `{ kicker, title, subtitle? }`; default `anchor: 'bottom-left'`, `offset: { x: 0.0625, y: 0.0625 }`. Dark slab + yellow mono kicker + title + optional subtitle.
- **`watermark`** — content `{ handle, label? }`; default `anchor: 'top-right'`, `offset: { x: 0.0625, y: 0.0625 }`. Dark slab + yellow accent bar + mono `@handle` + optional uppercase label. Persistent channel branding.

Adding a new overlay primitive is one folder under `src/lib/pipelines/overlays/<name>/` (`index.ts` + `CanvasSource.svelte` + `Editor.svelte`) and one line in `PIPELINE_REGISTRY.overlays`. The Controls panel's Add-overlay picker and `OverlayMount` both pick it up automatically — zero edits to the shell.

## Focal shader (paper surface)

The paper composition fragment shader applies focal warps from up to 8 focal-mark slots. Each slot is `{ rect: vec4f, params: vec4f }` where `params = (magnify, dim, tear, styleCode)` and `styleCode` is `1=magnify`, `2=lift-out`, `3=tear-out`, `4=isolate` (`0` = empty slot, skipped). A single `bgFloor` uniform sourced from `surface.backgroundVisibility` floors how aggressive the outside-lifted dim can be.

Slot data is built in `paper/pipeline.ts` `render()` by walking `getAnnotationMarkLayouts` results in document order, filtering for focal styles, and delegating to each renderer's `computeFocalSlot()`. Because the layouts order matches the marks walker's flatten, `markProgresses[markIndex]` aligns to each slot's animation progress and intensity.

Shader logic per slot:

1. Compute the lifted region (`rect.size * (1 + magnify)` centered on the original rect).
2. Outside the lifted region: multiply the accumulated color by `1 - dim * dimRange` where `dimRange = 1 - bgFloor`. With `bgFloor = 0.2`, the maximum dim leaves the background at 20% visibility.
3. Inside the lifted region (and `magnify > ε`): backward-map `uv → sourceUv` and re-run the entire compose stack at `sourceUv` (DOM + paper grain + highlight + strokes) using `textureSampleLevel` (LOD 0; necessary because the loop body is gated by per-pixel `liftedFactor`, which makes the branch non-uniform). For `tear-out`, multiply lifted alpha by a value-noise `smoothstep` torn-edge mask. Composite lifted-over-current.

Stack order matches the Annotation stack order rules: decorative renders first (highlight + strokes textures), focal warps apply on top of the composed stack, later slots win where they overlap.

## Effect-chain runtime

The platform composes the surface's output through a single composition-wide effect chain before reaching the canvas. See [ADR-0018](adr/0018-collapse-effects-to-frame-only.md).

```
surface.render() → surface.outputTexture → shader-pass dispatcher → postShaderTex
                                                                         ↓
                                EffectChain.apply(input=postShaderTex,
                                                  effects=engineState.effects,
                                                  output=canvas)
                                                                         ↓
                                                                       canvas
```

`src/lib/platform/pipelines/effect-chain.ts` ping-pongs between two intermediate textures (canvas-sized, `host.format`). Each registered `EffectRenderer` provides:

- `uniforms` — a TypeGPU `d.struct(...)` describing the WGSL uniform layout.
- `wgsl` — the WGSL body of the per-effect fragment. The chain runner wraps it with a bind group exposing `layout.$.inputTexture`, `layout.$.samp`, `layout.$.uniforms`, plus a pre-sampled `inputSample`. The body returns `vec4f`.

The chain caches one compiled pipeline per effect *type* (not per instance), so adding three `paper-grain` entries creates one pipeline and three bind groups. The last pass writes directly to the canvas view; intermediate passes ping-pong between the two work textures.

The empty-chain case still routes through a blit pass — surfaces always render to their `outputTexture`, and the platform composites it to the canvas. This keeps the GPU code path identical regardless of whether effects are configured.

The Controls panel soft-enforces the quality-rubric's Q12/E1 cap (≤ 3 effects in the chain) by disabling the Add picker when the chain is full.

## Acceptance criteria

Every preset and platform change is verified against these. **MUST** = required to land; **SHOULD** = good to have, not blocking.

### Schema and validation

- **AC-S1 (MUST)** `npx svelte-check --tsconfig ./tsconfig.json` exits with `0 ERRORS 0 WARNINGS`.
- **AC-S2 (MUST)** Every built-in preset (`src/lib/presets/*.json`) parses with `parsePreset` without throwing.
- **AC-S3 (MUST)** `node --experimental-strip-types scripts/verify-presets.ts` exits 0 with all `✓`. Fixture set covers: (a) cross-surface remix; (b) one fixture per `AnnotationStyle` kind (decorative + focal); (c) overlay fixture; (d) effect fixture with two effects stacked in the chain.
- **AC-S4 (MUST)** A preset constructed by an external agent from `docs/preset-format.schema.json` + `docs/preset-format.md` alone, with no source-code access, loads via the `/p/<slug>` route after being dropped into `src/lib/presets/`.
- **AC-S5 (MUST)** `docs/preset-format.schema.json` is the freshly generated output of `scripts/export-preset-schema.ts` against the current schema.

### Rendering — structural

- **AC-R1 (MUST)** Loading any preset under `/p/<slug>` mounts the canvas, the Timeline scrubber, and the controls panel without throwing. Console clean for every built-in preset.
- **AC-R2 (MUST)** Loading a preset whose surface is `paper` mounts the paper canvas-source HTML inside the `<canvas layoutsubtree>`. Loading `plain` mounts the plain canvas-source HTML.
- **AC-R3 (MUST)** After a preset with an inline focal annotation (e.g. `magnify`) loads, the canvas source DOM contains exactly one `[data-annotation-mark="magnify"]` element at the focal span's location.
- **AC-R4 (MUST)** Adding an `Overlay` of type `lower-third` to a preset causes the lower-third overlay's HTML to be present in the canvas source DOM after the preset loads.
- **AC-R5 (MUST)** Stacking two `paper-grain` effects in `effects` does not throw at preset load; the rendering completes without error.

### Rendering — pixel

- **AC-RP2 (MUST)** Two focal marks on adjacent spans both render, with decorative-under-focal stack order. Visible in a screenshot of the test preset.
- **AC-RP3 (MUST)** "Grain inside the paper card only" is implemented as a `SurfaceRenderer.shaderPass` on the `paper` Surface (paralleling ADR-0008's `newspaper-physics` consumer on `newspaper`), not as an entry in `effects`. A `paper-grain` Effect covers the entire viewport.
- **AC-RP4 (MUST)** A `lower-third` overlay enter/exit animates per its `Transition`. Screenshots at `Timeline.time` values inside and outside the transition window show the lower-third in the expected position.
- **AC-RP5 (MUST)** Exporting a 6-second preset to WebM and to ProRes both complete and the resulting video matches the preview canvas at the same timestamps within the encoder's lossy tolerance.

### State and reactivity

- **AC-T1 (MUST)** After `applyPreset(preset)`, `engineState` retains its original object identity. Sub-objects may be replaced.
- **AC-T2 (MUST)** Editing the body via the `AnnotationTextEditor` updates `engineState.surface.content.body` and the canvas re-renders. No `state_proxy_equality_mismatch` warning. No other warnings or errors during normal editing.
- **AC-T3 (MUST)** Selecting a mark / overlay / surface-transition on the timeline causes `TrackInspector` to show controls for that element. Selecting an overlay with a registered `OverlayRenderer.Inspector` mounts that component.
- **AC-T4 (MUST)** Adding or removing an overlay updates both the overlays panel list and the timeline tracks reactively.

### UI structure

- **AC-U3 (MUST)** The Svelte files that drive the editor UI are exactly: `Workspace.svelte`, `Composition.svelte`, `SurfaceMount.svelte`, `OverlayMount.svelte`, `Controls.svelte`, `TrackInspector.svelte` in `$lib/platform/`; plus the shared `VideoFrame`, `TimelineScrubber`, `TimelineTrackView`, `ExportPanel`, `ControlPanel`, `ControlGroup` from `$lib/platform/`; plus `AnnotationTextEditor.svelte` in `$lib/annotations/`; plus per-pipeline `CanvasSource.svelte`, `Editor.svelte`, `Inspector.svelte` under `$lib/pipelines/` only where the registration declares them.
- **AC-U4 (MUST)** Adding a new `EffectType` requires only: a new `src/lib/pipelines/effects/<name>/index.ts`, a one-line registry entry, and a one-token addition to the `EffectType` union. No edits to `Workspace.svelte`, `Controls.svelte`, `TrackInspector.svelte`, or composition WGSL.
- **AC-U5 (MUST)** Adding a new `OverlayType` requires the same scope as AC-U4 plus an optional `CanvasSource.svelte`.
- **AC-U6 (MUST)** Adding a new `BlockType` requires the same scope as AC-U4 plus optional `Editor.svelte` and `Inspector.svelte` under the block's directory.

### Determinism

- **AC-D1 (MUST)** Preview and export both call `pipeline.render(buildRenderInputs(timestamp))` with the same `timestamp` for the same frame. Verified by code inspection: exactly one `renderAt(timestamp)` function in `Workspace.svelte`; `ExportPanel` drives export through the same function.
- **AC-D2 (MUST)** With the Timeline paused at `t = 1.5s`, two calls to the render function produce the same canvas state.

### Performance — targets, not enforced

- **AC-P1 (SHOULD)** At 4K horizontal frame, idle render time ≤ 16 ms on an M2+ MacBook Pro.
- **AC-P2 (SHOULD)** One focal annotation + one lower-third overlay + one `paper-grain` effect ≤ 32 ms per frame.
- **AC-P3 (SHOULD)** Export of a 6-second 30fps preset completes in under 1 minute.
- **AC-P4 (SHOULD)** GPU memory at idle ≤ 256 MB.

### Documentation

- **AC-DD1 (MUST)** `docs/preset-format.schema.json` is regenerated whenever the schema changes; committed.
- **AC-DD2 (MUST)** `docs/preset-format.md` describes the current state shape: shared blocks (transport / typography / marks / surface / overlays / effects), surface variants, block variants, annotation styles, overlay types, effect types. Each section ≤ ½ page.
- **AC-DD3 (MUST)** This file is current with the registry. Updated whenever a primitive is added.

## AI authoring contract

Agents authoring new **Presets** receive exactly two inputs:

- [`docs/preset-format.schema.json`](preset-format.schema.json) — the JSON Schema (Draft 2020-12) exported from the Zod schema by `scripts/export-preset-schema.ts`. One file, all surfaces and overlays, with body authored as a bracket-tag string.
- [`docs/preset-format.md`](preset-format.md) — the human-language brief. What each shared block means, what each surface variant is for, the inline-mark delimiter syntax. Per-variant sections are ≤ ½ page.

The agent does **not** read source code to author a Preset. Schema + brief + a one-line goal in; valid Preset JSON out. Dropping the JSON into `src/lib/presets/<slug>.json` makes it load at `/p/<slug>` with no further code changes. Schema validation rejects invalid Presets at load with a path-indexed error string from `parsePreset`.

For channel-fit (palette, type, channel chrome), the agent also reads [`docs/aesthetic.md`](aesthetic.md). For verification, the **Critic** runs against the rendered Preset (see [`critic.md`](critic.md) and [ADR-0001](adr/0001-critic-sub-agent-verification.md)).

### Authoring risks to watch for

- **`marks.timings` length mismatch.** If a Preset has fewer timings than marked spans in the body, missing entries fall back to `marks.defaults[style]`. If more, extras are silently ignored. Both are intentional — do not "fix" missing timings by inventing them.
- **`engineState` identity.** `applyPreset` mutates `engineState` in place and preserves its top-level identity. Sub-object identities (`engineState.surface`) may be replaced wholesale; code that captured a reference to `engineState.surface` will be stale after a preset change.
- **Body-shape duality.** On disk: a bracket-tag string. At runtime: structured `Block[]`. Zod transforms on parse; `serializeAnnotationBodyToText` reverses. Code that reads `surface.content.body` must treat it as `Block[]`, not as the source string.
- **Built-in count discipline.** Five to seven built-in Presets total. Beyond that, an agent is probably building variants that should be content edits to existing Presets, not separate Presets.

## Constraints

Bounds on the engine that aren't obvious from the code. Some are also captured as ADRs; references inline where applicable.

- **Preset schema id is `hiviz@1`.** Shape changes happen in place; built-in presets are hand-migrated. Hand-rolled external `hiviz@1` presets from an older shape will fail validation cleanly — acceptable because no public preset surface exists yet.
- **Annotation stack order: decorative under focal, then document order.** Codified in the composition shader (see Annotation stack order). Two focal annotations on the same body are permitted but soft-warned.
- **Surface-level slots stay as named fields on `SurfaceContent`.** Title, source URL, author, source, date label, and any future per-surface chrome fields are declared per-surface via `contentSlots`. With HTML-in-canvas as the layout surface, slots map cleanly to the HTML structure the surface renders — no advantage to expressing chrome content as block types.
- **Overlay positioning is `anchor + fractional offset`.** Offsets are `0..1` fractions of composition dimensions (e.g. `0.05` = 5% inset from the anchor edge). Normalized rect (anchor `'normalized-rect'` + `rect`) is supported for precise placement but is not the default. Schema enforces `0 ≤ offset ≤ 1`; for offscreen positioning use `normalized-rect` with rect coordinates.
- **Specialized inspectors: contract designed, components shipped only when needed.** `BlockRenderer.Inspector`, `OverlayRenderer.Inspector`, `EffectRenderer.Inspector` are optional Svelte components. `SurfaceRenderer` and `AnnotationRenderer` never ship them.
- **Effects are static.** No `animation` block on effect params today. If a future effect type needs animation, it opts in via its own `params` schema.
- **The effect chain supports duplicates.** Two `vhs` passes in `effects` is valid; no special handling.
- **Channel chrome is enforced at Critic time, not schema-validation time.** See [ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md).

## Known follow-ups

Intentionally deferred. Not bugs; not TODOs in code; do not delete from this list.

- **`OverlayRenderer.render` / per-overlay shader pass.** Overlays today render via HTML-in-canvas only. The `render` method on `OverlayRenderer` is a placeholder for an offscreen / worker compositing path that would draw overlays directly into `overlaysTex` instead of through DOM capture. Ship if HTML-in-canvas can't handle some overlay type.
- **Camera motion (push / snap zoom).** `surface.camera` is data-modeled and exposed in Controls, but the paper pipeline does not yet animate the card position / scale based on camera + focal-slot center. Re-introducing camera motion means tracking the active focal slot's normalized center across frames and applying a per-frame transform to the paper card's inline CSS.
- **Annotation stack on non-text blocks.** When mermaid or code blocks ship, annotations will need to attach to non-text targets (a node in the diagram, a line range in code). Defer until the first non-paragraph block is built.
- **Mermaid and code blocks.** Both deferred from v1. Mermaid runtime-vs-build-time rendering decision postponed until we build the block. Code block animation-between-states is non-trivial and worth designing on its own.
- **Multi-element selection on the timeline.** The Inspector contract is "shown when a single primitive is selected." Multi-select (e.g. two marks at once) needs a concrete UX pass.

## Non-goals

- Cross-pipeline morphing at runtime. Switching surface/block/annotation/overlay/effect type is a content edit, not an animated transition.
- Coordinate-anchored marks. Inline marks in blocks remain the only addressing model for text annotations.
- Cloud sync, user accounts, multi-user editing.
- Animated mark style changes (a mark's style is fixed for the duration of an animation).
- Runtime authoring of new pipeline kinds by users. Only code changes ship new kinds.
