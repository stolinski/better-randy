# `OverlayRenderer.shaderPass` for per-overlay shader work

> Compose-pipeline invocation resolved by [ADR-0010](0010-compose-pipeline-shaderpass-invocation.md). The declarative `shaderPass` field is now executed once per overlay that declares it between DOM upload and final composite.

Supers overlays render to the canvas via HTML-in-Canvas DOM upload only; the `OverlayRenderer.render` placeholder mentioned in `docs/engine-architecture.md § Known follow-ups` was never implemented, and `effects.overlays` is a no-op (only `effects.frame` runs through the effect-chain executor today). The torn-edge / fiber / hard-offset-shadow chrome that the channel aesthetic requires on collage-card overlays (`lower-third`, `watermark`, future card overlays) cannot be expressed in DOM-only output — `clip-path` polygons produce R4-failing aliased edges at 4K and can't carry the fiber inner stroke. We chose to add a **declarative** `shaderPass?: { wgsl, uniforms, packUniforms }` field on `OverlayRenderer` rather than an imperative `render(ctx)` method or extending the effect-chain executor to `effects.overlays`. The composition pipeline runs the shader pass once between an overlay's DOM-to-texture upload and the final overlay composite, with per-overlay uniforms packed by the renderer.

## Considered options

- **Imperative `render(ctx)` on `OverlayRenderer`** (rejected: introduces an imperative escape hatch alongside the rest of the declarative `*Renderer` registry — that asymmetry would bite later).
- **Make `effects.overlays` chain executable** (rejected: effects are deliberately scene-content-agnostic, but per-overlay torn edges need per-overlay bounds + seeds as uniforms — forcing the effect-chain runtime to plumb per-overlay metadata reverses the "effects are pure post-process" rule in `engine-architecture.md`).
- **`clip-path: polygon(...)` with seeded jitter in CSS** (rejected: aliased polygon edges at 4K violate quality-rubric R4 by construction, and the 1–2 px fiber inner stroke can't be expressed in CSS without pseudo-element stacks; this is "below the channel quality bar").

## Consequences

The `shaderPass` field is a v1 contract that covers the ~95% case of per-overlay shader work: a single fragment pass with self-contained uniforms, no cross-layer reads, no multi-pass dependencies. When some future overlay needs multi-pass or cross-layer work, the imperative `render(ctx)` escape hatch can be added alongside `shaderPass` (with `render` taking precedence when both are declared). The first consumer is a `tear-edge` shader pass for `lower-third` and `watermark` — see [`docs/todos/lower-third-aesthetic.md`](../todos/lower-third-aesthetic.md). The grit overlay stays composition-wide via `paper-grain` in `effects.frame`; `shaderPass` is not used to carry grit per-overlay.
