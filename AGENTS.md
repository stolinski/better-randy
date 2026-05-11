# Hiviz Agent Instructions

## Product Direction

Hiviz is a SvelteKit app for designing and exporting transparent-background video overlays for use in video editors such as DaVinci Resolve.

The app should be organized as a collection of focused tools. Each tool lives on its own route and presents the working composition plus a control panel for that specific generator. Keep tool routes independent enough that a user can open a route, adjust controls, preview the animation, and export without moving through a wizard.

The main rendering idea is:

- Use SvelteKit for the app shell, routing, stateful controls, and authoring UI.
- Use HTML/CSS/Svelte markup as the authoring surface for rich typography, document layouts, annotation layers, and styled interface-like visuals.
- Use the WICG HTML-in-Canvas proposal as the intended future rendering model for drawing real HTML into canvas.
- Use Mediabunny for browser-side media output, especially canvas-driven transparent video exports.
- Prefer deterministic, frame-addressable animation timelines so preview and export produce the same visual result.
- Preserve transparency all the way through the render pipeline. Do not paint an opaque canvas background unless the selected tool explicitly needs one.

Example target tool: a research-paper animation route. The user can paste HTML or Markdown and provide a source URL. The tool extracts body text, lays it out like a research paper, flies the paper into frame, and animates marks such as highlights, circles, cross-outs, marginal notes, callouts, and handwritten-style annotations. The final export should be a stylistic transparent video overlay suitable for compositing above other footage.

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
- Clear the canvas before every frame with `clearRect` to preserve transparent areas.
- Add frames with stable timestamps and durations.
- Surface encoder support failures clearly.
- Avoid long-running UI freezes where practical by yielding between frame batches or moving export work into a worker when the implementation grows.

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
- Do not test WICG HTML-in-Canvas proposed APIs through browser automation unless a compatible flagged browser is explicitly provided.
