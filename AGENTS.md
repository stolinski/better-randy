# Hiviz Agent Instructions

## Product Direction

Hiviz is a SvelteKit app for designing and exporting transparent-background video overlays for use in video editors such as DaVinci Resolve.

The app should be organized as a collection of focused tools. Each tool lives on its own route and presents the working composition plus a control panel for that specific generator. Keep tool routes independent enough that a user can open a route, adjust controls, preview the animation, and export without moving through a wizard.

The main rendering idea is:

- Use SvelteKit for the app shell, routing, stateful controls, and authoring UI.
- Use HTML/CSS/Svelte markup as the authoring surface for rich typography, document layouts, annotation layers, and styled interface-like visuals.
- Use the WICG HTML-in-Canvas proposal (`copyElementImageToTexture` on a `layoutsubtree` canvas) as the active rendering path for drawing real DOM into WebGPU textures.
- Use TypeGPU as the WebGPU layer for device init, bind group layouts, buffers, samplers, and WGSL render pipelines.
- Use GSAP timelines to drive animation. Timelines are built paused and scrubbed by progress, not played by wall-clock, so preview and export use the same animation state.
- Use Mediabunny for browser-side media output, especially canvas-driven transparent video exports.
- Prefer deterministic, frame-addressable animation timelines so preview and export produce the same visual result.
- Preserve transparency all the way through the render pipeline. Do not paint an opaque canvas background unless the selected tool explicitly needs one.

Example target tool: a research-paper animation route. The user can paste HTML or Markdown and provide a source URL. The tool extracts body text, lays it out like a research paper, flies the paper into frame, and animates marks such as highlights, circles, cross-outs, marginal notes, callouts, and handwritten-style annotations. The final export should be a stylistic transparent video overlay suitable for compositing above other footage.

## Repo Layout

- `src/routes/tools/<tool>/+page.svelte` — thin tool route that composes the stage and controls (see `src/routes/tools/research-paper/+page.svelte` as the canonical example). Also: `quote-focus`, `timeline-explainer`, `tweet-highlighter`, `webpage-evidence-scanner`.
- `src/lib/platform/` — cross-tool infrastructure: `gpu-host.ts`, `html-in-canvas.ts`, `timeline.svelte.ts`, `TimelineScrubber.svelte`, `TimelineTrackView.svelte`, `VideoFrame.svelte`, `ToolWorkspace.svelte`, `ControlPanel.svelte`, `ControlGroup.svelte`, `ExportPanel.svelte`, `export-video.ts`.
- `src/lib/tools/<tool>/` — feature module for each tool. The research-paper module is the reference shape: `research-paper-state.svelte.ts` (runes state + ease/font/mark maps), `research-paper-pipeline.ts` (TypeGPU pipeline + GSAP timeline + DOM upload + mark layers), `ResearchPaperCanvasSource.svelte` (the canvas child rendered via HTML-in-Canvas), `ResearchPaperControls.svelte`, `research-paper-content.ts`, `export-research-paper.ts`.
- `src/lib/annotations/` — annotation-mark layout and 2D drawing routines shared by tools that overlay highlights, underlines, circles, and strikes (`annotation-marks.ts`, `AnnotationTextEditor.svelte`).
- `src/lib/utils/` — shared pure utilities (`math.ts`, `video-frame.ts`, etc.). Only utility folder; do not add new ones.
- `docs/` — design notes the agents must read before working in a given area (`html-in-canvas-typegpu.md`).

## Route And UI Expectations

- Give every tool its own SvelteKit route under `src/routes`.
- Put reusable feature-specific components, state, types, and tests together under `src/lib/<feature>/`.
- Keep route files thin. Route files compose the tool; feature modules own the tool-specific behavior.
- Each tool should have a visible composition/stage area and a control panel.
- Each tools should be able to output to 4k with a toggle for vertical or horizontal aspect ratio.
- Do not add refresh buttons. Data should be fresh by design.
- Do not add explanatory UI text that tells the user how to use the tool. The controls and labels should make the path obvious.
- Use the simplest, flattest semantic HTML that communicates the content.
- Less UI is better than too much UI.

## HTML-In-Canvas Guidance

Source: https://github.com/WICG/html-in-canvas

HTML-in-Canvas is a WICG proposal for customizing the rendering of HTML content inside 2D and 3D canvas contexts. It is not a normal web platform API available in our current browser automation environment.

Important status note:

- The proposal describes APIs implemented behind the Chromium flag `chrome://flags/#canvas-draw-element`.
- The Codex browser, browser agent, and normal local browser/devtools flow should be treated as not having this API.
- Do not try to verify HTML-in-Canvas behavior with Chrome DevTools, Playwright, the browser agent, or the Codex in-app browser unless the user explicitly says they have launched a compatible Chromium build with the flag enabled.
- For now, tests should validate our own abstractions, timeline math, parsing, state, and fallback behavior, not the browser's implementation of `drawElementImage`.

Core concepts from the proposal:

- A `<canvas layoutsubtree>` opts canvas children into layout and hit testing.
- Direct children of that canvas are laid out like normal DOM, but they are not visibly painted to the user by default.
- Canvas children become renderable sources. They only appear in the canvas when explicitly drawn.
- `CanvasRenderingContext2D.drawElementImage(element, ...)` draws a canvas child or an `ElementImage` snapshot into the canvas.
- WebGL and WebGPU equivalents are proposed for copying element rendering into textures.
- A `paint` event fires on the canvas when the rendering of a canvas child changes.
- `canvas.requestPaint()` requests a paint event even when children did not change, similar in spirit to `requestAnimationFrame()` for apps that intentionally update every frame.
- `canvas.captureElementImage(element)` creates a transferable snapshot for worker/`OffscreenCanvas` workflows.
- `drawElementImage()` returns a transform that can be applied to the source element so the DOM location stays synchronized with the drawn canvas location for hit testing and accessibility.

Architectural implications for this repo:

- Keep all HTML-to-canvas behavior behind a small rendering boundary so the proposal can be adopted when it becomes available without rewriting every tool.
- Do not spread direct calls to proposed APIs throughout route files or controls.
- Type proposed APIs explicitly in local types when needed. Avoid `any`; use narrow interfaces for the exact experimental methods being called.
- Design each tool as a scene graph or timeline that can be rendered by multiple backends:
  - current fallback backend for preview/export paths available today,
  - future HTML-in-Canvas backend for true DOM-to-canvas rendering,
  - possible worker/`OffscreenCanvas` backend for export performance.
- Treat DOM content as the source of visual truth where practical, but keep export rendering deterministic by driving all animation from an explicit timestamp/frame value.
- If a fallback renderer is needed before HTML-in-Canvas is broadly available, name it as a fallback and keep it isolated. Do not pretend it is equivalent to the proposal.

Known proposal constraints to design around:

- `layoutsubtree` must be present on the canvas.
- The element passed to `drawElementImage()` must be a direct child of the canvas.
- The element must generate boxes; `display: none` cannot be drawn.
- Canvas transforms affect drawing.
- CSS transforms on the source element are ignored for drawing, although they still matter for DOM hit testing/accessibility synchronization.
- Overflow is clipped to the element border box.
- Calls made during the `paint` event use the current frame's snapshot; calls outside `paint` use the previous snapshot.
- DOM writes inside the `paint` event do not affect the current frame.

## HTML-In-Canvas + Shaders

For any tool that mixes html-in-canvas with shaders, read `docs/html-in-canvas-typegpu.md` before designing the pipeline. It documents the canonical WebGPU pattern (`device.queue.copyElementImageToTexture` on a layoutsubtree canvas), the TypeGPU API shape, WGSL/TypeGPU pitfalls, and why the 2D `drawElementImage` path is unsuitable for shader work. Reference implementation: https://github.com/WICG/html-in-canvas/tree/main/Examples/webgpu-jelly-slider.

The platform layer wraps these APIs:

- `src/lib/platform/gpu-host.ts` — `createGpuHost(canvas)` boots TypeGPU (`tgpu.init()`), configures the WebGPU canvas context with `alphaMode: 'premultiplied'`, and returns a disposable `GpuHost` exposing `root`, `device`, `context`, and `format`. Tools build pipelines against this host instead of touching `navigator.gpu` directly.
- `src/lib/platform/html-in-canvas.ts` — narrow typed wrappers for the experimental surface: `getHtmlInCanvasQueue(queue)` returns the queue with `copyElementImageToTexture` typed, plus `requestCanvasPaint`, `setCanvasPaintHandler`, and `clearCanvasPaintHandler` for the `onpaint` / `requestPaint()` cycle. Throw with a clear message when the API is unavailable; do not silently fall back.

When a tool needs the source DOM in a texture, set `transform = ''` on the source element around the `copyElementImageToTexture` call (CSS transforms on the source are ignored for the draw, but clearing them keeps DOM hit testing and mark layout in sync), then restore the previous transform.

## TypeGPU Conventions

- Always go through `GpuHost.root` (a `TgpuRoot`). Do not call `tgpu.init()` from tool code.
- Use `d.struct` / `d.vec4f` / `d.texture2d(d.f32)` for uniform layouts and bind group layouts. Build bind group layouts with `tgpu.bindGroupLayout({...})` and reference resources via `layout.$.name` inside WGSL.
- Author vertex/fragment shaders with `tgpu['~unstable'].vertexFn(...)` / `fragmentFn(...)` tagged WGSL templates, then `.$uses({ layout })` to bind the layout.
- Build pipelines with `root['~unstable'].withVertex(...).withFragment(..., { format }).createPipeline()` and draw with `pipeline.with(bindGroup).withColorAttachment({...}).draw(n)`.
- Allocate uniform buffers with `root.createBuffer(StructDef, initial).$usage('uniform')` and update with `.write({...})` per frame.
- Use a full-screen triangle (3 vertices) when the fragment shader is the whole composition; skip vertex buffers.
- For transparent output, set `clearValue: [0, 0, 0, 0]`, `loadOp: 'clear'`, and use `alphaMode: 'premultiplied'` on the canvas context.
- Dispose textures and `root.destroy()` (the host's `dispose()`) on teardown. Tools should call `pipeline.dispose()` then `host.dispose()` in `onDestroy`.

## GSAP Animation Conventions

- Use GSAP for keyframed animation curves only. The clock is the tool's `Timeline` (see below), not GSAP playback.
- Build timelines with `gsap.timeline({ paused: true })` and scrub them every frame with `timeline.progress(frameProgress)`, where `frameProgress = clampNumber(timestamp / durationSeconds, 0, 1)`. Never call `play()`/`resume()` on GSAP timelines.
- Mutate a plain `animState` object owned by the pipeline and read it back when computing layout/rendering. Use `onUpdate` for any animated value that needs to round-trip through a custom setter.
- Memoize the GSAP timeline against a stable key derived from the inputs that affect its tweens (e.g. eases + durations + per-mark start/duration/ease). Rebuild only when that key changes; `kill()` the previous timeline before replacing it.
- Keep eases configurable through a label map (`RESEARCH_PAPER_EASES`) so controls stay declarative and timeline rebuilds use the same label set as the UI.
- Dispose: `animTimeline?.kill()` on pipeline disposal.

## Timeline Platform

Every tool drives animation and export from a single `Timeline` instance from `src/lib/platform/timeline.svelte.ts`:

- `new Timeline({ durationSeconds, fps, tick, loop? })`. `tick(timestamp)` is the tool's render-at-time function. Loop defaults to `true`.
- `Timeline` exposes runed state (`time`, `isPlaying`, `durationSeconds`, `fps`, `loop`) and methods `seek`, `stepFrames`, `play`, `pause`, `toggle`, `dispose`.
- Playback uses `requestAnimationFrame` with a `playStartedAt` / `playStartedFrom` anchor so the displayed `time` matches `tick`'s timestamp every frame. Do not derive playback from `Date.now()` or accumulators that drift.
- Treat `Timeline.time` as the single source of truth for "where are we in the animation right now." UI controls should call `timeline.seek()` and read `timeline.time`; the renderer should call `tick`/`render({ timestamp })`.

UI components for the timeline (already in `src/lib/platform/`):

- `TimelineScrubber.svelte` — play/pause, frame-step buttons, a range scrubber bound to `timeline.time`, and a frame readout. Keyboard: space toggles play, ←/→ step by 1 frame (shift = 10), Home/End jump to ends. The scrubber ignores key events while focus is in an editable target.
- `TimelineTrackView.svelte` — horizontal lanes for timed segments. Tools pass a `TimelineTrack[]` derived from state. Each track has `start`, `duration`, optional `min/max` clamps, a `color`, and an `onUpdate({ start, duration })` callback. Bands are draggable (move) with left/right trim handles, and clicking empty lane space seeks the playhead.
- Place `TimelineScrubber` and `TimelineTrackView` inside the tool's stage snippet of `ToolWorkspace` so they sit below the canvas frame.

When wiring a tool:

1. Build the GPU host and pipeline asynchronously inside an `$effect` that depends on the bound `canvas` / source element. Bail if the host is already initialized.
2. Construct the `Timeline` with `tick: renderAt`, where `renderAt(timestamp)` calls `pipeline.render({ ..., timestamp })`.
3. Wire `setCanvasPaintHandler(canvas, () => { pipeline.uploadDom(); renderAt(timeline?.time ?? 0); })` and call `requestCanvasPaint(canvas)` once on init. Re-`requestCanvasPaint` from a small `$effect` that touches the DOM-visible state fields (title, body, fonts, colors) so HTML changes refresh the texture.
4. Re-render on parameter changes by reading the relevant state in another `$effect` and calling `renderAt(timeline.time)` (do not rebuild the pipeline for parameter tweaks).
5. On `onDestroy`: clear the paint handler, then dispose `timeline`, `pipeline`, and `host` in that order.

## Mediabunny Export Guidance

Use Mediabunny for browser-side video creation. It supports canvas-driven output and transparent WebM creation.

Preferred transparent export shape:

- Use a canvas or `OffscreenCanvas` with an alpha channel.
- Use `WebMOutputFormat` for the in-browser transparent video path.
- Use `CanvasSource` for frame input.
- Use VP9 when targeting transparent WebM.
- Set `alpha: "keep"` on the canvas video source so alpha data is encoded.
- Use `BufferTarget` for in-memory downloads unless a future route has a clear need for streaming or direct file-system writes.

Keep the export code tolerant of future format needs. DaVinci Resolve workflows may require different containers/codecs depending on the user's system and import path, so avoid baking "WebM only forever" assumptions into tool state. The first implementation can target transparent WebM; the architecture should allow adding MOV or another alpha-preserving output later.

Export loops should:

- Render frame `n` from an explicit timestamp, not from elapsed wall-clock time.
- Clear the canvas before every frame. WebGPU render passes already do this via `loadOp: 'clear'` with `clearValue: [0, 0, 0, 0]`; 2D fallback paths should use `clearRect`. Either way, do not paint an opaque background.
- Add frames with stable timestamps and durations.
- Surface encoder support failures clearly.
- Avoid long-running UI freezes where practical by yielding between frame batches (the shared exporter awaits a single `requestAnimationFrame` once per second of frames) or moving export work into a worker when the implementation grows.

The shared transparent-export helper lives in `src/lib/platform/export-video.ts`:

- `exportTransparentWebM({ canvas, durationSeconds, fps, renderFrame, onProgress })` wires `Output` + `WebMOutputFormat` + `CanvasSource(codec: 'vp9', alpha: 'keep')` + `BufferTarget`, calls `renderFrame(frame, timestamp)` per frame, and returns a `Blob`.
- `downloadVideoBlob(blob, filename)` triggers the browser download.

Tools should not call Mediabunny directly. Wrap export in a tool-local function (e.g. `exportResearchPaperOverlay`) whose `renderFrame` calls `pipeline.render({ ..., timestamp })` with the current state snapshot. Pause the timeline before exporting and surface errors through the tool's `status` field.

## Codebase Rules

- Never run `git revert`, `git restore`, `git reset --hard`, or destructive git commands without explicit user permission.
- Follow the existing style in each touched file.
- Avoid reformatting unrelated lines.
- Use semicolons consistently.
- Prefer trailing commas where already in use.
- Do not introduce new frameworks or tooling unless requested.
- Avoid incidental refactors.
- Do not change build or packaging config without a clear task need.
- Keep preload and renderer typing changes in sync when desktop code exists.

## Imports

Group imports in this order:

1. Node built-ins using `node:*`.
2. External packages.
3. Internal relative modules.

Keep type imports explicit with `import type`. Avoid wildcard imports. Never re-export code or types; import directly from the source module.

## TypeScript

- Preserve strict typing.
- Do not use `any`.
- Use `unknown` at trust boundaries and narrow it before property access.
- Use literal unions for finite statuses and events.
- Use `type` for unions and aliases.
- Use `interface` for object contracts when useful.
- Add explicit return types for exported functions and APIs.

## Utilities And Abstractions

- Never write a utility function in the same context where it is used.
- Put shared or pure utilities in `src/lib/utils/`.
- Do not create new utility folders.
- Before adding a helper, check `src/lib/utils/` and extend existing helpers when appropriate.
- Prefer inline expressions for trivial one-off formatting.
- Extract helpers only when there is meaningful reuse or domain logic.
- Do not add pass-through wrappers that only call another function with the same arguments.
- Name extracted helpers for their domain meaning.
- Never leave TODOs, placeholder implementations, or no-op stubs.

## Svelte

- Do not use `$effect` unless it is genuinely necessary.
- Prefer nested SvelteKit layouts for shared route-level UI composition.
- Do not introduce wrapper components when layout hierarchy solves the problem.
- Do not fall back to React patterns.
- If a global manager/store is the source of truth, read it directly where it is used.
- Components own their own data.
- If data is available from global state or from the route, do not compute it in a parent just to pass it down.
- Use props at real generic boundaries.
- Do not create thin wrapper components or prop-forwarding layers.
- In runes/state logic, keep derived values deterministic and side-effect free.
- Do not create rename-only `$derived` or `$derived.by` aliases.
- Never use `$derived` or `$derived.by` for side effects.
- Prefer small components and refactor when components grow too large.
- Use direct event handlers such as `onclick={handleExport}` instead of wrapping them only to call the same function.

## CSS And Graffiti

- CSS should be systemic.
- Avoid one-off route styles unless they are truly needed.
- Prefer Graffiti UI patterns and classes before custom CSS.
- Use Graffiti tokens and patterns before adding tokens or variables.
- Do not add a custom aesthetic layer unless explicitly requested.
- No visual treatment unless explicitly requested.
- Structural CSS for layout, spacing, sizing, and overflow is allowed.
- Decorative gradients, tints, shadows, and motion are not the default.
- Do not reimplement Graffiti built-ins when equivalent patterns exist.
- Never add a `button` class to a `<button>` element.
- Any new custom class or token must be justified in the final report.

## Testing

- Unit tests live near code as `*.test.ts` or `*.spec.ts`.
- Svelte component tests should use `@testing-library/svelte`.
- Prefer role/text assertions over brittle selectors.
- Keep tests deterministic and independent.
- During iteration, run one file or one test title first.
- NEVER test WICG HTML-in-Canvas proposed APIs through browser automation unless a compatible flagged browser is explicitly provided.
- NEVER start a new dev process, one is already running at http://localhost:5173
