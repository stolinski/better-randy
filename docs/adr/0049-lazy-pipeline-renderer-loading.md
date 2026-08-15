# ADR-0049 — Lazy Pipeline renderer loading

## Status

**Canon (built).**

Date: 2026-08-15
Builds on: [ADR-0002](0002-per-tool-routes-to-preset-engine.md) (one Preset engine), [ADR-0010](0010-compose-pipeline-shaderpass-invocation.md) (uniform Pipeline dispatch), [ADR-0015](0015-identity-spec-per-pipeline.md) (Pipeline identity), and [ADR-0026](0026-transitions-v1-snapshot-and-wipe.md) (transition snapshots)

## Context

The original Pipeline registry eagerly imported every Surface, Block, Annotation, Overlay, and Effect renderer. A renderer module may include Svelte components, WebGPU declarations, TypeGPU shader setup, and family-specific authoring code. Because the `/p/[slug]` Workspace reached that registry statically, Vite treated every renderer as part of every editor route's initial module graph. An edit or transient module-evaluation failure in one unused Pipeline could therefore invalidate unrelated Preset routes.

Semantic validation, add-menu discovery, and default creation still need a complete synchronous catalog. Frame rendering cannot become asynchronous: preview, scrubbing, transition snapshots, and export must resolve the same already-loaded renderer at an explicit timestamp.

## Decision

### 1. Registration has a synchronous definition half and a lazy runtime half

Every Pipeline family exposes a renderer-free `definition.ts` containing its canonical ID, label, schema, defaults, controls, and other semantic or authoring metadata. The runtime `index.ts` imports and spreads that definition, then adds only runtime capabilities such as `CanvasSource`, Editors, draw functions, shader passes, or GPU passes. This keeps one authoritative metadata declaration rather than duplicating defaults between catalogs.

`PIPELINE_DEFINITION_REGISTRY` eagerly imports all definitions. Preset parsing, semantic validation, Pack validation, identity checks, inspectors, and add menus use this synchronous registry. Definition modules may import schemas, types, constants, and explicitly pure metadata helpers. The transitive static-import/re-export gate rejects Svelte components, family `index.ts`/`pipeline.ts` and other renderer implementation files, `runtime-loader.ts`, and TypeGPU runtime imports.

Annotations use the same split through the renderer-free annotation definition catalog. Transition Effects have a separate synchronous definition registry because their `paramsSchema` contract differs from ordinary Effects.

### 2. Concrete renderers are available only through typed dynamic loaders

`runtime-loader.ts` owns one explicit dynamic-import loader per registered renderer identity. Import expressions point at the existing family `index.ts` exports, preserving discoverable renderer names and one renderer implementation per family. No concrete renderer is statically imported by the Preset route, definition registry, validation path, or ordinary authoring discovery.

`PipelineRendererController` resolves a typed requirement set into a renderer bundle. It deduplicates concurrent requests by Layer and identity, verifies that a loaded renderer's `type` or `style` matches the requested definition, retains already-loaded renderers across type switches, and removes rejected promises so a corrected HMR module can retry. Activation merges with the current bundle, so out-of-order concurrent resolve/activate completions cannot lose another successfully loaded family. Exact definition↔loader key parity is a test gate for every Layer and transition family; a production-parity test also invokes every real loader and checks the returned identity.

### 3. Renderer readiness is a route and mutation boundary

Before applying a route Preset, the client derives its required Surface, used Block and Annotation types, Overlays, ordinary Effects, applicable Pack chrome Effects, transition Effect, and the recursive transition endpoint graph. Annotation requirements use the same canonical mark-instance enumeration as animation, sound, timeline, and render inputs, including generated checklist strikes. Every catalogued deliverable and fixture has its complete requirement closure checked against the loader registry. The client awaits the complete bundle, activates it, and only then applies state and mounts `Workspace`. A load failure produces route-level error UI; it never enters frame execution with a partly-ready bundle.

Authoring operations that introduce a new Surface, Block, Annotation, Overlay, Effect, Pack chrome Effect, transition Effect, or transition endpoint await that renderer before mutating composition state. Each operation carries a generation and captured state identity; navigation, teardown, or a newer edit invalidates an older completion. Load failures are logged and native controls are restored instead of producing unhandled rejections or stale authored state.

`runtime-context.svelte.ts` converts controller activation into one reactive revision read by every mount and inspector lookup, including activation-only changes. Resolved renderers remain synchronous during composition mount, frame rendering, snapshot capture, and export. There is no frame-time import, Promise branch, wall-clock fallback, or preview/export divergence. A missing required Surface, Block, Overlay, Annotation, or ordinary Effect renderer throws an invariant error. The route preloads every authored chart and diagram Block renderer; each mount then requires the renderer for the currently visible chart or mounted diagram primitive before mounting DOM or dispatching GPU drawing. The paper Surface resolves focal Annotation renderers from the active bundle and owns no static focal-renderer imports.

### 4. Server catalog evaluation is renderer- and state-free

`preset-catalog.ts` owns eager built-in JSON lookup and listing without importing client engine state. `preset-parser.ts` owns pure ingress and semantic parsing. Both `/p/[slug]/+page.server.ts` and the homepage server load import the catalog directly; the stateful `preset.ts` module is limited to applying/cloning composition state and resolving live transitions. Transitive module-graph tests follow runtime imports and re-exports, including side-effect imports, and reject server paths that reach Svelte modules, renderer family implementations, TypeGPU, `runtime-loader.ts`, or client engine state.

### 5. The Preset Workspace is client-rendered

`/p/[slug]` keeps its data load contract but declares `ssr = false`. The Workspace requires browser-native Svelte, HTML-in-Canvas, and WebGPU facilities, and server evaluation of its renderer loader graph provides no useful HTML. Client rendering also prevents an unrelated Vite SSR module-evaluation failure from turning the editor HTML request into an HTTP 500.

## Rejected alternatives

- **Keep one eager renderer registry and catch import errors.** A failed static module graph cannot be recovered after registry evaluation, and the unrelated route remains coupled to the failure.
- **Duplicate a metadata registry beside renderers.** Defaults and schemas would drift. Runtime renderers instead spread their family definition.
- **Import renderers on demand inside frame execution.** This would make frames asynchronous and violate deterministic preview/export parity.
- **Load every renderer when the Workspace mounts.** This only moves the eager failure boundary; it does not isolate unused Pipelines.

## Consequences

- A Preset route evaluates only the concrete renderer modules required by that Preset, its active Pack chrome, and any transition endpoints.
- Validation and authoring discovery remain immediate and complete because definitions are synchronous.
- Switching types can incur a bounded module-load wait before the authored state changes.
- Loaded renderers are retained for the route session, so revisiting a type does not reload it.
- Adding a Pipeline now requires its `definition.ts`, runtime renderer composition, definition-registry entry, dynamic loader entry, and Identity Spec where applicable.
- Source-boundary and controller tests enforce static-import/re-export lazy isolation, definition and server-catalog purity, concurrent-load deduplication and merge safety, retry after failure, real-loader identity parity, reactive activation, complete catalogued Preset closures, and type-switch accumulation.
