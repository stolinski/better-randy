# Supers Engine Architecture

The data model, rendering layers, pipeline registry, appearance (Pack) system, and render path that drive every Supers **Preset**. Companion to [`preset-format.md`](preset-format.md) (the preset JSON format reference).

**This doc states current truth.** Where it describes a mechanism, the code does that today. Designed-but-unbuilt work is collected under [§ Designed, not built](#designed-not-built) and tracked in [`../docs/roadmap.md`](roadmap.md), not described here as if it exists. The _why_ behind each decision lives in [`adr/`](adr/); this is the _what_.

Glossary: [`CONTEXT.md`](CONTEXT.md). Why one engine instead of per-tool routes: [ADR-0002](adr/0002-per-tool-routes-to-preset-engine.md).

## The model in one read

A **Preset** is one JSON document (`supers@1`) that composes five **Layers** (Surface / Block / Annotation / Overlay / Effect) from a **Pipeline registry**, dressed by a swappable **Pack** (appearance only), rendered frame-deterministically through a TypeGPU compositor to a 3840×2160 (or 2160×3840) canvas, and exported transparent or opaque through PNG frame capture + ffmpeg. Two anchors hold everything else up:

1. **The data model is the contract.** Everything renderable is described in `engineState`. Pipelines own no state.
2. **One uniform render path.** Surface, blocks, annotations, overlays, and post-process effects share the same WebGPU/TypeGPU compositor. Preview, transition snapshots, and export target the same `renderCompositionFrameTo(outputView, timestamp)` seam — identical dispatch and inputs.

## File layout

```
src/lib/
  platform/                      # the engine shell (state, schema, render host, UI)
    Workspace.svelte             # one workspace; reads engineState; owns renderAt(timestamp)
    Composition.svelte           # canvas-sized root; mounts SurfaceMount + OverlayMount
    SurfaceMount.svelte          # mounts the active SurfaceRenderer's CanvasSource + Pack vars
    OverlayMount.svelte          # iterates engineState.overlays, mounts each + Pack vars
    Controls.svelte              # one controls panel; dispatches to per-primitive editors
    TrackInspector.svelte        # one inspector; per-selection
    timeline.svelte.ts           # Timeline (the only clock)
    gpu-host.ts                  # TypeGPU init; INTERMEDIATE_FORMAT = 'rgba16float'
    html-in-canvas.ts            # WICG copyElementImageToTexture wrappers
    animation-manager.ts         # GSAP timeline driver (scrubbed by progress)
    engine-schema.ts             # Zod schema, types, defaults
    engine-state.svelte.ts       # runtime state + mutation helpers; boot Pack gate
    preset.ts                    # parsePreset, applyPreset, listPresets
    preset-validation.ts         # registry-derived semantic Preset validation
    preset-rubric.ts             # static linter — video-safety + readability only (ADR-0025)
    export-video.ts              # PNG frame capture + WebM/ProRes export endpoints
    packs/                       # the appearance system
      registry.ts                # PACK_REGISTRY (syntax = REFERENCE_PACK_SLUG, editorial-mono)
      resolve.ts                 # resolveAppearanceVars — the live Pack→pixel path
      types.ts                   # Pack/Role manifest types
      validation.ts              # manifest metadata/font/chrome/core contract gate
    pipelines/                   # Registry + runner INFRASTRUCTURE (not the renderers)
      index.ts                   # PIPELINE_REGISTRY (single source of truth)
      identity-registry.ts       # IDENTITY_REGISTRY + assertIdentityRegistryValid (boot gate)
      composition-effect-registry.ts # non-post-process composition Effects
      stage-registry.ts          # registered composition stage types
      types.ts                   # *Renderer interfaces
      effect-chain.ts            # ping-pong post-process executor + dithered present pass
      shader-pass-runner.ts      # ShaderPassDispatcher (per-target shader passes)
  pipelines/<layer>/<variant>/   # the actual Layer renderers (one folder per variant)
    surfaces/  blocks/  annotations/  overlays/  effects/  shader-passes/
  annotations/                   # shared 2D annotation-mark geometry + body-text serialization
  text-animations/               # text-anim orchestration (peer to Layers; does not render)
  presets/*.json                 # built-in Presets
  packs/syntax/                  # the Syntax pack's self-hosted fonts
  utils/                         # the only utility folder
```

There is no `src/lib/tools/` — per-tool modules were collapsed into the engine ([ADR-0002](adr/0002-per-tool-routes-to-preset-engine.md)). Note the two `pipelines/` dirs: `platform/pipelines/` is **infrastructure** (registry, runners, interfaces); `src/lib/pipelines/` holds the **renderers**.

## Verification commands

The shell out of which any engine change is verified.

| Command                                       | Purpose                                                         | Success signal                     |
| --------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| `npx svelte-check --tsconfig ./tsconfig.json` | Type-check the whole project                                    | `0 ERRORS 0 WARNINGS`              |
| `npm run verify-presets`                      | Validate presets + apply R/Q/G floors to deliverables           | All `✓`, exits 0                   |
| `npm run gen:schema`                          | Regenerate `docs/preset-format.schema.json` from the Zod schema | `Wrote …preset-format.schema.json` |
| `npx vite build`                              | Smoke-test the production build                                 | `✓ built in <N>s`                  |

### Browser checks

The dev server already runs at `http://localhost:5173` — never start a new one. Use the chrome-devtools MCP; that browser has `chrome://flags/#canvas-draw-element` enabled, so the HTML-in-Canvas path runs to completion and pixel checks are automatable. For "is this preset done?", the **Critic** drives verification — see [`critic.md`](critic.md).

## The five Layers

A frame composes bottom-to-top:

```
+----------------------------------------------------------+
| 5. Effects        (ONE composition-wide post-process chain)
+----------------------------------------------------------+
| 4. Overlays       (lower-thirds, watermark, counters, …)  |
+----------------------------------------------------------+
| 3. Annotations    (per-span / per-block marks on a Block) |
+----------------------------------------------------------+
| 2. Blocks         (typed content units on the Surface)    |
+----------------------------------------------------------+
| 1. Surface        (paper / newspaper / plain / …)         |
+----------------------------------------------------------+
```

**Effects are a single composition-wide chain**, run after the final composite — _not_ per-Layer ([ADR-0018](adr/0018-collapse-effects-to-frame-only.md) collapsed the old five-key chain; only `effects.frame` was ever consumed). Per-target shader work that _does_ need Layer-local knowledge (substrate physics, per-overlay edge treatment) is a **`shaderPass`** on the Surface/Overlay renderer, run by the dispatcher between DOM upload and the effect chain — see [ADR-0005](adr/0005-overlay-renderer-shader-pass.md), [ADR-0008](adr/0008-newspaper-surface-pipeline.md), [ADR-0010](adr/0010-compose-pipeline-shaderpass-invocation.md).

| Layer      | Renderer             | Owns                                          | Variants today  |
| ---------- | -------------------- | --------------------------------------------- | --------------- |
| Surface    | `SurfaceRenderer`    | the material/container + enter/exit           | 7 (below)       |
| Block      | `BlockRenderer`      | one content unit inside the Surface           | 1 (`paragraph`) |
| Annotation | `AnnotationRenderer` | one mark on a Block (decorative or focal)     | 10              |
| Overlay    | `OverlayRenderer`    | a positioned element not bound to a Block     | 8               |
| Effect     | `EffectRenderer`     | one WGSL post-process pass in the frame chain | 11              |

## Data model

```ts
// PresetSchema (engine-schema.ts) — the on-disk envelope.
interface Preset {
	schema: 'supers@1';
	name: string;
	description?: string;
	pack: string; // REQUIRED, no default — names the appearance Pack (ADR-0023)
	kind: 'deliverable' | 'fixture'; // default 'deliverable'; fixtures skip the R/Q/G floors (ADR-0025)
	state: EngineState;
}

interface EngineState {
	transport: {
		orientation: 'horizontal' | 'vertical';
		durationSeconds: number;
		fps: number;
		format: string;
	};
	typography: Typography;
	marks: MarksState;
	surface: SurfaceState;
	textAnimations: TextAnimation[]; // default []; orchestration, not a Layer (ADR-0011)
	overlays: Overlay[]; // default []
	effects: Effect[]; // default []; ONE flat chain (ADR-0018)
	stage?: Stage; // optional; absent = flat path. Dimensional depth stage (ADR-0028)
}

// Surface is a CLOSED enum (1:1 with registered surfaces).
type SurfaceType =
	| 'paper'
	| 'plain'
	| 'newspaper'
	| 'pullquote-on-photo'
	| 'chapter-card'
	| 'title-sequence'
	| 'type-hero';

// Overlay.type and Effect.type are OPEN strings, validated against their registries by
// validatePresetSemantics after structural Zod parsing. New variants land additively
// in code; no schema migration.
interface Overlay {
	type: string; // e.g. 'lower-third', 'washi-tape', 'counter'
	id: string; // stable identity for timeline tracks
	content: unknown; // schema declared by the OverlayRenderer
	position: OverlayPosition;
	enter?: Transition;
	exit?: Transition;
}
interface Effect {
	type: string;
	id: string;
	params: unknown;
}

interface SurfaceState {
	type: SurfaceType;
	variant?: string; // validated per-pipeline against that family's VARIANT_IDS
	content: SurfaceContent;
	enter?: Transition;
	exit?: Transition;
	backgroundVisibility?: number; // wired: floors focal-dim aggressiveness in the paper pipeline
}

interface OverlayPosition {
	anchor:
		| 'top-left'
		| 'top-right'
		| 'top-center'
		| 'bottom-left'
		| 'bottom-right'
		| 'bottom-center'
		| 'center'
		| 'normalized-rect';
	offset?: { x: number; y: number }; // 0..1 fractions of composition dims, anchor-relative
	rect?: { x: number; y: number; width: number; height: number }; // 0..1 when anchor === 'normalized-rect'
}
```

Placement is **relative** (anchor + fractional offset), never absolute pixels — this is what makes reflow across orientations tractable (see [§ Output & orientation](#output--orientation)).

### Body text format

Paragraph bodies are stored as a single bracket-tag string, parsed into the runtime `Block[]` shape by `parseAnnotationBodyText`. Paragraphs split on `\n\n`; marks wrap text with paired tags (`[highlight]…[/highlight]`); marks stack by nesting (`[magnify][side-note]…[/side-note][/magnify]`). Per-mark appearance + timing live in `marks.timings[index]`, keyed by each `(segment, style)` pair's document-order position; `marks.defaults[style]` is the per-style fallback. No inline-on-tag attributes.

## The Pipeline Registry

`PIPELINE_REGISTRY` in `src/lib/platform/pipelines/index.ts` is the single source of truth. Every renderer is also paired with an **Identity Spec** ([ADR-0015](adr/0015-identity-spec-per-pipeline.md)) validated at boot by `assertIdentityRegistryValid`.

**Live contents** (verified against code):

| Layer            | Registered                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| surfaces (9)     | `paper`, `plain`, `newspaper`, `pullquote-on-photo`, `chapter-card`, `title-sequence`, `type-hero` (variants `single`/`pair`), `web-document`, `imessage`                                                                                                                  |
| blocks (6)       | `paragraph`, `node`, `edge-arrow`, `label`, `stat-callout`, `timeline-segment`                                                                                                                                                                                             |
| annotations (10) | `highlight`, `underline`, `strike`, `circle`, `box`, `side-note`, `magnify`, `lift-out`, `tear-out`, `isolate`                                                                                                                                                             |
| overlays (10)    | `lower-third` (variants `standard`/`cinematic`), `washi-tape`, `watermark`, `shader-fill`, `cursor-trail`, `counter` (`slot-machine-roll`), `instance-stack` (`vertical-stack`/`horizontal-train`), `text-3d` (`cylinder-axis-y`), `youtube-subscribe`, `instagram-follow` |
| effects (11)     | `paper-grain`, `chromatic-aberration`, `crt-screen`, `crt-tube`, `ntsc-signal`, `dithering`, `halftone-dots`, `halftone-cmyk`, `water`, `fluted-glass`, `heatmap`                                                                                                          |

**Dead-by-use — resolved.** `isolate`, `watermark`, `shader-fill`, `chromatic-aberration` were registered + boot-valid but referenced by zero presets; each now has a proving fixture (`isolate-demo`, `watermark-demo`, `shader-fill-demo`, `chromatic-aberration-demo`) that renders the pipeline, so all four are kept (not removed). Every registered pipeline is now referenced by ≥1 preset.

**Presets:** 85 on disk at the 2026-07-13 validation pass. Fixtures are excluded from the app catalog and skip the R/Q/G floors, but every Preset still passes structural and semantic validation.

### Validation boundaries

`PresetSchema` owns structural JSON validation and transforms. `validatePresetSemantics` then validates the parsed Preset against the live registries: Pack slug, Surface registration and variant, Overlay registration/content schema, post-process or composition Effect registration/params, Stage registration, substrate assets, collection IDs, text-animation Overlay targets, transition lane, and transition references when a Preset resolver is available. Unknown authored primitives fail at load; renderers never silently skip them. The same semantic pass runs for the built-in catalog, `parsePreset`, `scripts/verify-presets.ts`, and user-composition list/load/create/update boundaries.

The ordinary Effect registry remains the 11 single-input post-process Effects listed above. Composition-owned Effects whose execution changes the render path live in `composition-effect-registry.ts`; `depth-of-field` is the first. Stage types live in `stage-registry.ts`; `depth` is currently the only registered Stage.

### Variants as data

A Pipeline hosting a _family_ of motion shapes carries a `variants/` subfolder — one file per variant (`{ id, label, defaults, motionShape }`), one Identity Spec for the family ([ADR-0020](adr/0020-variants-as-data.md)). Adding a variant = one file + one `VARIANT_IDS` line + schema regen. No new registry entry, no Identity-Spec re-declaration.

### Adding a primitive

One folder under `src/lib/pipelines/<layer>/<name>/` (`index.ts` + `CanvasSource.svelte` + optional `Editor`/`Inspector`) + one line in `PIPELINE_REGISTRY` + its `identity.ts`. `Overlay.type`/`Effect.type` are open strings validated by `validatePresetSemantics`, so no enum edit is needed for those; `SurfaceType` is a closed enum, so a new surface adds one enum member. The Controls panel's pickers and the mounts discover it automatically — zero shell edits.

## Rendering pipeline (TypeGPU)

`Workspace.svelte` owns one deterministic `renderCompositionFrameTo(outputView, timestamp)` seam. `renderAt(timestamp)` only supplies the preview canvas view; export supplies that same canvas view directly, and transition snapshot capture supplies an offscreen view. The seam gives a prepared cached transition wipe first precedence; every live path then builds `SurfaceRenderInputs` once, uploads the live DOM once, and dispatches stage → multiplane DOF → flat composite:

```
1) Surface render        pipeline.render(buildRenderInputs(timestamp))
   + DOM upload           pipeline.uploadDom()  — HTML-in-Canvas copyElementImageToTexture
                          → compositionTex  (rgba16float)
2) ShaderPass dispatch    ShaderPassDispatcher.apply(passes, inputTexture, ctx={progress,timestamp})
                          surface pass first (only `newspaper` declares one), then overlay
                          passes in document order; ping-pong over two rgba16float intermediates
                          → postShaderTex
3) Effect chain + present effectChain.apply(effects=engineState.effects, input=postShaderTex,
                          output=canvas) — each Effect ping-pongs rgba16float; the chain ALWAYS
                          ends with the dithered present pass (the only 16f→8bit canvas write)
```

**Contract specifics (all current):** off-screen intermediates are `rgba16float` (`INTERMEDIATE_FORMAT`); the **present pass** applies interleaved-gradient-noise dither (±0.5/255 on RGB, alpha exact) on the single 16f→8bit write — this is the banding fix, and it runs whether or not effects exist; canvas context is `alphaMode: 'premultiplied'`; every color attachment uses `loadOp: 'clear'`, `clearValue: [0,0,0,0]`. Time-driven shaders read `ctx = { progress, timestamp, canvasWidth, canvasHeight }`, plumbed identically through both the effect chain ([ADR-0012](adr/0012-effect-pack-context-progress-timestamp.md), amended to carry the canvas dimensions for resolution-dependent shaders) and shaderPasses ([ADR-0013](adr/0013-shaderpass-pack-context.md)) so preview and export agree.

**Composition-wide dispatch.** `renderCompositionFrameTo` selects per frame: prepared transition snapshots → cached wipe (no irrelevant live-DOM upload); else `state.stage` present → the **dimensional depth stage** ([ADR-0028](adr/0028-dimensional-depth-stage.md), `DepthStage`) — the surface composite on a 3D plane over a backdrop plane at depth, the Overlay layer (when present) on its own plane at its ADR-0021 z (overlay-at-depth), perspective camera, per-pixel-depth mip-prefiltered gather DOF; else `depth-of-field` Effect present → 2.5D multiplane bokeh (ADR-0027); else the flat composite above. Every live branch receives the same complete `SurfaceRenderInputs` (including diagram stroke inputs) and the same queue-ordered DOM upload. All branches share the capture seam, effect chain, present, and export — preview == export holds for each.

**Surface fades are GPU, not CSS opacity.** `copyElementImageToTexture` cannot rasterize a DOM element's CSS `opacity < 1` (it captures transparent — see [`html-in-canvas-typegpu.md`](html-in-canvas-typegpu.md)). So a surface's `paperVisibility` fade must be applied as an alpha-multiply on the captured texture (GPU), not via `style:opacity` on the element, or the fade is binary (full→gone). Done for the depth stage; generalizing to every surface is a tracked follow-up ([`roadmap.md`](roadmap.md)).

### shaderPass vs Effect

- **Effect** — pure post-process in the frame chain. Reads a source texture, writes a destination. Needs no scene knowledge beyond its uniforms. Adding one is a shader file + a registry entry.
- **shaderPass** — per-target work declared on a Surface/Overlay renderer, run before the effect chain, with per-target bounds/seed/time uniforms. This is where torn edges, fiber, hard-offset shadow, and substrate physics live.

### Focal shader (paper / plain composition)

The composition fragment applies focal warps from up to **8 focal-mark slots**, each `{ rect: vec4f, params=(magnify, dim, tear, styleCode) }` (`1=magnify, 2=lift-out, 3=tear-out, 4=isolate`, `0`=empty). Slot data is built in the pipeline's `render()` by walking `getAnnotationMarkLayouts` in document order, filtering focal styles, delegating to each renderer's `computeFocalSlot()`. A `bgFloor` uniform (from `surface.backgroundVisibility`) floors how far the outside-of-lens dim can go. Decorative marks render first (into their own texture); focal warps apply on top of the composed stack; later slots win on overlap.

### Determinism + export parity

Every render is computed from a `timestamp`; the shared `Timeline` is the only clock; GSAP timelines are scrubbed by `progress`, never played by wall-clock. Export advances its deterministic animation manager, flushes Svelte DOM updates, then calls the exact same `renderCompositionFrameTo` seam as preview (including the seam-owned `uploadDom()` before each live frame's `render()`, so DOM-driven content animates in export, not just preview). Prepared transitions therefore export through their cached wipe, and future `SurfaceRenderInputs` additions cannot silently disappear from export. **Exports include all effects** — no clean-export toggle; edit the preset to strip effects if a clean variant is needed.

## Appearance: Packs & Roles

A **Pack** is a swappable _appearance dress_ resolved at render time ([ADR-0014](adr/0014-pack-preset-split.md)). It carries **appearance only — never motion** ([ADR-0023](adr/0023-pack-is-appearance-only.md)); form/timing/easing are intrinsic to the Preset+Pipeline. A Preset names exactly one Pack (`pack`, required), overridable at render time so the same Preset renders under any Pack. There is **no privileged default** — `syntax` is the `REFERENCE_PACK_SLUG` the boot gate validates against, not a fallback. **Every registered Pack must supply the mandatory core vocabulary** — the six bare core Roles `fill-treatment` / `ink-treatment` / `accent-treatment` / `edge-treatment` / `depth-treatment` / `light-treatment` (`MANDATORY_CORE_ROLES` in `packs/types.ts`), colour cores as real colour strings and structural cores in resolver-recognised shapes. The boot gate enforces that minimum through `validatePackCoreVocabulary`. The authoring/CI gate is the broader `validatePackRegistry`: it also checks registry key/slug identity, metadata, font-role declarations and weights, rejects unwired Pack-selected Pipeline roles, and validates Pack chrome through registered post-process Effect schemas. `scripts/verify-presets.ts` runs that manifest gate plus the full reference-Pack Identity contract. ViaPack completeness stays reference-pack-only; secondary Packs may intentionally rely on core fallback. `material-treatment` and `font-treatment` are recognised _optional_ cores.

**Declared Pack-immunity** ([ADR-0038](adr/0038-full-pack-buy-in.md)): a Pipeline whose entire value is fidelity to a real artifact declares `packImmunity` (with a mandatory rationale) in its Identity Spec — today `surface:imessage` and `surface:web-document`. Immunity is registry-visible (`isPackImmune(key)` / `PACK_IMMUNE_PIPELINE_KEYS` in `identity-registry.ts`), never an unwired accident: `SurfaceMount` skips appearance-var injection for an immune Surface's artifact, while every treatment layered ON it — annotation marks, edge treatment, depth shadow, Effects — still resolves from the active Pack. The Critic's two-Pack pixel-diff check enumerates non-immune pipelines from this list's complement.

**The live path:** `SurfaceMount`/`OverlayMount` call `resolveAppearanceVars(getPack(slug), <type>)` and inject the result as inline CSS custom properties on the pipeline root; CanvasSources consume them via `var(--fill, <fallback>)`. Resolution is specific→core fallback like `var(--specific, var(--core))` ([ADR-0024](adr/0024-role-resolution-core-fallback.md)). Dimension names are normalized so every core-dimension slot uses the core suffix and the fallback chain can land (`tear-out.fill`, `isolate.depth`, `paragraph.material` — the historic `fragmentFill` / `dimDepth` / `glyphEdge` off-core names are gone); a Pack that passes the core gate therefore always emits `--fill` / `--ink` / `--accent`, and a per-Pipeline Role may explicitly claim `'currentColor'` (e.g. `node.ink`) to ride the inherited composition colour instead of the core.

> **Honest current state.** **Color, font, and the `depth` + `edge` structural Roles** reach pixels. `resolveAppearanceVars` color-filters _its_ output (color/font only); structural resolution goes through two typed resolvers in `packs/resolve.ts` (the old generic `resolveStyle`/`resolveRole` accessors were removed). `resolveDepthTreatment` resolves `<type>.depth` → core `depth-treatment` (specific→core, ADR-0024) into a hard-offset shadow rig — proven on the `newspaper` card (`syntax` 12px chrome → `editorial-mono` `'none'`, flat). `resolveEdgeTreatment` resolves `<type>.edge` → core `edge-treatment` into the five-value edge vocabulary (`clean / soft / irregular / torn / none`), applied as a **shader-side alpha mask** by the shared edge-treatment ShaderPass (`src/lib/pipelines/shader-passes/edge-treatment.ts`) — shader-side because CSS masks/filters promote compositing layers, which drop out of the HTML-in-Canvas capture. A card-silhouette surface opts in via `SurfaceRenderer.edgeTreatment` (today: `newspaper`); for displaced modes (torn/irregular) the pass also synthesizes the depth rig's hard-offset shadow as an offset duplicate of the _torn_ silhouette while the CanvasSource drops its CSS box-shadow (a baked box-shadow puts a straight card/shadow seam inside the flat capture that no alpha treatment can cross) — proven on the `newspaper` clipping (`syntax` torn + fiber rim → `editorial-mono` clean die-cut). `resolveDepthTreatment` returns a typed union its three consumers branch on — `kind:'hardOffset'` (the reflective-pack shadow) or `kind:'glow'` (`{ glow: { radius, color?, intensity? } }` — the emissive bloom halo, painted as a centered two-layer box-shadow; never a CSS filter, which drops out of capture). `resolveMaterialTreatment` resolves the optional core `material-treatment` to the scanline recipe (`{ scanline: { pitchPx?, strength?, shimmer? } }`), dispatched as the shared alpha-masked crt-scanline ShaderPass (`src/lib/pipelines/shader-passes/crt-scanline.ts`) LAST in the dispatch list — per element pixel, so transparent-overlay footage is never treated; unrecognised material values (e.g. `paragraph.material: 'ink-bleed'`, which rides its own consumer) resolve to `null`. The `light` structural Role is consumed by the ADR-0028 depth stage. Three Packs exist (`syntax`, `editorial-mono`, `crt-terminal`).

**Pack chrome (opaque pieces).** A Pack MAY supply a `chrome` Role (`kind:'chrome'`): an effect recipe the Workspace appends **after** the preset's own `effects[]` whenever the composition declares a `backgroundFill` (the frame is a full-frame segment/bumper). The chrome is the Pack's _dress_ supplying **initial values** — it never appears in the preset JSON on its own (swap the Pack and the chrome goes with it), and transparent overlays never receive frame chrome (the footage isn't ours to treat). **Override lane:** an authored effect of the same type in `effects[]` takes ownership — `withPackChrome` skips the Pack's copy of that type, so there is never a double application. The inspector surfaces chrome entries in the Effects section (tagged `PACK`) with their full param editors; the first edit materializes the authored override (tag flips to `PACK · OVERRIDDEN`, removable — removing it restores the Pack default). First consumer: `crt-terminal`'s `crt-tube` physical tube (`src/lib/pipelines/effects/crt-tube/`).

## Output & orientation

**Transparency is the default, not a law.** Overlays render transparent (`loadOp: 'clear'`, premultiplied alpha). Output classification is centralized: an EngineState/Preset is opaque when it declares either `backgroundFill` or a dimensional `stage`; a transition is opaque only when **both** resolved `from` and `to` Presets are opaque. Export uses that result for codec handling and the `supers-bumper` / `supers-overlay` basename. There is no `overlay | segment | bumper` enum — those are loose descriptive words, not engine categories.

**Orientation** is `horizontal` (3840×2160) or `vertical` (2160×3840). The static linter (`preset-rubric.ts`) is already orientation-aware and carries social safe-area bands (vertical bottom-caption ~16%, right action-rail ~9%, top ~6%) and per-orientation type bands. **Genuine reflow** — one Preset rendering to either aspect, with safe-areas as _layout inputs_ (not just lint checks) and orientation as a _render target_ (not an authored constant) — is designed but not built; see [`roadmap.md`](roadmap.md).

## Text animation orchestration

`src/lib/text-animations/` is **peer to the Layers — it does not render.** It choreographs the DOM that HTML-in-Canvas captures, emitting GSAP tween specs against SplitText unit spans and feeding them into the same `AnimationManager` so every text tween scrubs by `progress` alongside marks and transitions ([ADR-0011](adr/0011-text-animation-orchestration.md)).

```
text-animations/
├── raw-catalog/         vendored from pixel-point/animate-text (pinned sha): 24 specs + effects
├── catalog.ts           typed EFFECT_CATALOG (zod-validated on load)
├── split-text.ts        GSAP SplitText wrapper → stable per-slot span maps
├── compile.ts           pure: compile(entry, targetEl, transport) → AnimationTweenSpec[]
├── strategies/          generic-stagger (21 effects) + 3 layout-aware renderer families
└── manager.svelte.ts    TextAnimationManager: observes engineState.textAnimations, resolves
                         data-text-anim-slot nodes, compiles, exposes unitAlphaAt() for marks
```

**Catalog-vs-Pipeline boundary** ([ADR-0011](adr/0011-text-animation-orchestration.md) amendment): a verb belongs in the catalog iff (a) it's per-unit keyframed motion with no inter-unit pixel dependency AND (b) every keyframe is CSS-rasterizable without a shader pass. Either failing kicks it to a Pipeline with its own Identity Spec — so the catalog lane can't smuggle shader-class effects past the identity gate. A new generic-stagger effect lands as data (re-run `sync-text-animation-catalog.ts`); a new layout-aware renderer is one strategy file + a dispatch entry.

## Designed, not built

Pinned in ADRs or schema but **not wired into rendering**. Do not describe these as capabilities; pick them up from [`roadmap.md`](roadmap.md).

- **Genuine orientation reflow** — safe-areas as layout inputs, orientation as render target (above).
- **Structural Pack Roles** — `material` reaching pixels (`depth` is wired via `resolveDepthTreatment`, `edge` via `resolveEdgeTreatment` + the shared edge-treatment ShaderPass, and `light` via `resolveLightTreatment` → the depth stage's scene key light; the unused `resolveStyle`/`resolveRole` accessors are now removed).
- **Z-depth / focal-distance + depth-of-field** — [ADR-0021](adr/0021-z-plane-semantics.md) pins the semantics (single-channel f32 sidecar, focal-distance not world-space); no depth target exists in code. DOF v1 ships as multiplane bokeh ([ADR-0027](adr/0027-dof-v1-multiplane-bokeh.md)).
- **Dimensional depth stage — BUILT (v1), see § Rendering pipeline above.** [ADR-0028](adr/0028-dimensional-depth-stage.md) is integrated + Critic-accepted (`state.stage`, `DepthStage`, renderAt branch, export). Overlay-at-depth is built (2026-07): with `state.stage` declared and overlays present, the Overlay layer hoists to its own capture plane (the ADR-0027 split) and rides a 3D plane at its ADR-0021 z — parallax, per-depth defocus, painter's-order occlusion. Scene lighting/shadow is built (2026-07): the Pack's `light-treatment` Role becomes a real key light — received rake per plane + plane-to-plane cast shadow; no Role ⇒ unlit. Half-res DOF is built (2026-07): the gather runs at half res with a full-res sharp compose (4K preview 32→47 fps). Remaining (not built): the `material` Role — tracked in `roadmap.md`.
- **Multi-state transitions** — [ADR-0022](adr/0022-multi-state-composition.md) pins the `transition: { from, to, effect }` shape (dual-tree render, two color targets sampled by one mask); no multi-state machinery exists. Relevant to segments/bumpers.
- **Camera motion** — `surface.camera` (`push`/`snap`) was **stripped** as inert (no pipeline read it; field/UI/lint removed). Camera returns as stage-scoped data only when a real consumer exists — the dimensional depth stage ([ADR-0028](adr/0028-dimensional-depth-stage.md), `stage.camera`).
- **New Block types** — `mermaid` / `code` / `image` / `chart` are unbuilt; only `paragraph` ships.
- **Starter templates** — curated starting points both a human (GUI) and an agent begin from (reframed from the never-built recipe cookbook, ex-[ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md)).

## Constraints

- **`supers@1` schema id.** Shape changes happen in place; built-in presets are hand-migrated. Stale external presets fail validation cleanly.
- **Annotation stack order:** decorative under focal, then document order; codified in the composition shader. Two focal marks on one body are permitted but soft-warned.
- **Overlay positioning is anchor + fractional offset** (0..1 of composition dims); `normalized-rect` for precise/offscreen placement.
- **`marks.timings` length mismatch is intentional** — fewer than marked spans → fall back to `defaults[style]`; more → extras ignored. Don't "fix" by inventing timings.
- **Body-shape duality** — on disk a bracket-tag string; at runtime `Block[]`. Code reading `surface.content.body` must treat it as `Block[]`.
- **Specialized UI is opt-in and strictly additive.** `BlockRenderer`/`OverlayRenderer`/`EffectRenderer` may ship an `Editor`/`Inspector`; `SurfaceRenderer` and `AnnotationRenderer` never do (annotation controls are always `{style, color, intensity, ease}`).
- **Catalog discipline over preset count.** Deliverable vs fixture is the catalog split (ADR-0025); there is no fixed "N built-in presets" cap — each surface/overlay family wants one Critic-accepted deliverable (the corpus, tracked in `roadmap.md`).

## Non-goals

- A general node/keyframe compositor. Supers is an opinionated, constrained vocabulary with smart defaults — After Effects is the _quality ceiling_, not the architecture.
- Cross-pipeline morphing at runtime (switching surface/overlay type is a content edit, not an animated transition — transitions between _Presets_ are the ADR-0022 path).
- Coordinate-anchored text marks (inline bracket marks are the only text-addressing model).
- Cloud sync, accounts, multi-user editing.
