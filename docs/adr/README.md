# ADR index

Architecture Decision Records are the _why_ behind Supers's shape. Current engine truth lives in [`../engine-architecture.md`](../engine-architecture.md); work that is genuinely designed but not built lives in [`../roadmap.md`](../roadmap.md).

**Near-zero deletion.** Superseded and unbuilt ADRs remain as history with a status stamp at the top. Decision-time prose may describe a state that later changed; this index and each ADR's current status header control.

- **Canon** — current product truth; load to understand why the engine is shaped this way.
- **Build-harness** — proof-corpus authoring/verification scaffolding, not product law.
- **Superseded** — replaced by a later decision; retained for history.
- **Designed, not built** — pinned semantics with no implementation yet; tracked in `roadmap.md`.

| ADR                                                              | Status                                                    | Decision                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [0001](0001-critic-sub-agent-verification.md)                    | Superseded (build-harness history)                        | Critic sub-agent + adversarial verification                                              |
| [0002](0002-per-tool-routes-to-preset-engine.md)                 | Canon (foundational)                                      | Per-tool routes -> one Preset engine with five Layers + registry                         |
| [0003](0003-aesthetic-neutral-rubric-split.md)                   | Canon (refined by 0025)                                   | Aesthetic-neutral rubric; Pack aesthetic owns channel fit                                |
| [0004](0004-recipe-cookbook-over-schema-chrome.md)               | Superseded -> Starter templates in 0032                   | Recipe cookbook over schema-enforced chrome (cookbook never built)                       |
| [0005](0005-overlay-renderer-shader-pass.md)                     | Canon                                                     | Per-overlay shader work via `OverlayRenderer.shaderPass`                                 |
| [0006](0006-lower-third-corner-collage-card.md)                  | Superseded by 0023                                        | Lower-third collage appearance moved out of composition truth                            |
| [0007](0007-brainstorm-brief-system.md)                          | Superseded (authoring-harness history)                    | Brainstorm -> Brief -> Producer; historical Critic ACCEPT retirement                     |
| [0008](0008-newspaper-surface-pipeline.md)                       | Canon                                                     | `newspaper` Surface + `SurfaceRenderer.shaderPass`                                       |
| [0009](0009-washi-tape-overlay.md)                               | Canon                                                     | `washi-tape` Overlay                                                                     |
| [0010](0010-compose-pipeline-shaderpass-invocation.md)           | Canon                                                     | `ShaderPassDispatcher` invocation                                                        |
| [0011](0011-text-animation-orchestration.md)                     | Canon                                                     | Text animation is orchestration, not a sixth Layer                                       |
| [0012](0012-effect-pack-context-progress-timestamp.md)           | Canon                                                     | Frame-deterministic Effect context                                                       |
| [0013](0013-shaderpass-pack-context.md)                          | Canon                                                     | Frame-deterministic ShaderPass context                                                   |
| [0014](0014-pack-preset-split.md)                                | Canon (core)                                              | Pack/Preset split                                                                        |
| [0015](0015-identity-spec-per-pipeline.md)                       | Canon (gate partly build-harness)                         | Identity Spec per visible Pipeline                                                       |
| [0016](0016-anti-patterns-loadbearing-when.md)                   | Canon                                                     | Q anti-patterns are load-bearing when claimed, not globally banned                       |
| [0017](0017-paper-surface-paint-bug-fix.md)                      | Canon                                                     | Capture-safe paper Surface entrance                                                      |
| [0018](0018-collapse-effects-to-frame-only.md)                   | Canon                                                     | One flat composition-wide `effects[]` list with registry-routed execution classes        |
| [0019](0019-identity-spec-via-pack.md)                           | Canon (refined by 0023/0024)                              | Identity dimensions declare implementation or `viaPack`                                  |
| [0020](0020-variants-as-data.md)                                 | Canon                                                     | Pipeline variants as data                                                                |
| [0021](0021-z-plane-semantics.md)                                | Canon semantics (mechanisms refined by 0027/0028)         | Z is focal-distance scalar `[0,1]`                                                       |
| [0022](0022-multi-state-composition.md)                          | Canon model (implementation refined by 0026)              | Multi-state transition model                                                             |
| [0023](0023-pack-is-appearance-only.md)                          | Canon (core)                                              | Pack is appearance-only; no privileged default                                           |
| [0024](0024-role-resolution-core-fallback.md)                    | Canon (core)                                              | Per-Pipeline Role override -> core fallback                                              |
| [0025](0025-static-linter-checks-safety-and-readability-only.md) | Canon                                                     | Static linter owns safety/readability only; Critic owns taste                            |
| [0026](0026-transitions-v1-snapshot-and-wipe.md)                 | Canon (v1 built)                                          | Multi-state transitions use cached snapshots + mask wipe                                 |
| [0027](0027-dof-v1-multiplane-bokeh.md)                          | Canon                                                     | Flat DOF uses multiplane bokeh                                                           |
| [0028](0028-dimensional-depth-stage.md)                          | Canon (v1 built)                                          | Optional dimensional depth stage with camera, focus, overlays, and Pack light            |
| [0029](0029-image-substrate-on-depth-stage.md)                   | Canon (v1 built)                                          | Registered image substrate on the depth-stage backdrop plane                             |
| [0030](0030-web-document-emissive-surface.md)                    | Canon (v1 built)                                          | Pack-immune emissive `web-document` Surface                                              |
| [0031](0031-imessage-interactive-surface.md)                     | Canon (v1 built)                                          | Choreographed Pack-immune `imessage` Surface                                             |
| [0032](0032-gui-agent-parity-authoring.md)                       | Canon (v1 built)                                          | Shared-Preset GUI/agent round trip, Starter-template fork-on-edit, autosave              |
| [0033](0033-sound-design-motion-emitted-cues.md)                 | Canon (built; Sound-kit section superseded by amendment)  | Motion-emitted cues resolve through engine defaults + per-motion overrides; no Sound kit |
| [0034](0034-gui-design-authoring-interface.md)                   | Canon (built; Sound-kit references historical)            | Three-zone authoring UI: canvas, timeline-outline, inspector                             |
| [0035](0035-generalized-keyframes-and-cascade.md)                | Canon (built)                                             | Generalized keyframe channels + Cascade timing welds                                     |
| [0036](0036-diagram-primitives.md)                               | Canon (built)                                             | Five art-directed diagram Block Pipelines                                                |
| [0037](0037-imessage-chrome-mode.md)                             | Canon (v1 built)                                          | Faithful-artifact Surface chrome mode                                                    |
| [0038](0038-full-pack-buy-in.md)                                 | Canon (built)                                             | Optional typography color overrides + declared Pack immunity                             |
| [0039](0039-pack-neutral-compositions-and-listing-hygiene.md)    | Canon policy, substantially built; one demand-gated mechanism deferred | Pack-neutral compositions, one Preset per piece/orientation, listing hygiene             |
| [0040](0040-checklist-surface.md)                                | Canon (v1 built)                                          | Checklist Surface                                                                        |
| [0041](0041-achievement-overlay-family.md)                       | Canon (v1 built)                                          | Achievement Overlay family                                                               |
| [0042](0042-resolve-marker-sync.md)                              | Canon (v1 built; v2 grammar)                              | Resolve marker sync with frame-exact timing                                              |
| [0043](0043-source-video-underlay.md)                            | Canon foundation; singular model superseded by 0045       | Deterministic video underlay/compositor/audio/export foundation                          |
| [0044](0044-optical-lens-and-frost-family.md)                    | Canon (v1 built)                                          | Shared optical vocabulary for Magnify, clear refraction, and deterministic frost         |
| [0045](0045-composition-media-library-and-video-track.md)        | Canon (current model)                                     | Composition Media library + one primary Video track                                      |
| [0046](0046-seekable-simulation-and-deformation-families.md)    | Canon (v1 built)                                          | Typed transition families + fixed-step seekable material/deformation runtime              |
| [0047](0047-reject-general-asset-to-geometry-import.md)          | Canon (broad scope rejected)                              | Reject general SVG/image/GLB-to-geometry import; revisit only for a bounded consumer       |
| [0048](0048-agent-authored-chart-domain.md)                      | Canon (built)                                             | Strict Block-domain charts with Pack-owned appearance and intrinsic deterministic motion   |
| [0049](0049-lazy-pipeline-renderer-loading.md)                   | Canon (built)                                             | Synchronous Pipeline definitions with Preset-scoped lazy renderer loading                   |
| [0050](0050-layout-contract-verification.md)                     | Build-harness (built)                                     | Geometry-first exhaustive Layout Contract verification; pixel capture is diagnostic only   |

## Supersession And Refinement

- `0003` -> structurally realized by `0014` -> static-linter boundary drawn by `0025`.
- `0005` + `0008` -> invocation by `0010` -> deterministic context by `0013`.
- `0014` + `0015` -> `0019` -> appearance-only/core fallback in `0023` + `0024` -> Preset-side completion in `0038`.
- `0004` -> superseded recipe cookbook -> shipped Starter-template fork model in `0032`.
- `0022` -> shipped snapshot-and-wipe implementation in `0026`; live dual-tree remains deferred.
- `0033`'s original Sound-kit section -> superseded by its 2026-07-02 amendment; engine defaults + per-motion overrides are current.
- `0034`'s three-zone/no-left-panel UI -> retained by `0045`; the existing right rail switches between Inspector and Media modes.
- `0043`'s deterministic decoder/compositor/audio/export/privacy foundation -> retained by `0045`; its singular `state.sourceVideo`, authoring, and opacity model -> superseded by composition `state.media` + coverage-aware Video clips.

## Implementation Reality

The Pack path is live across color/font and structural treatments: depth, edge, light, and material each have typed resolvers and pixel consumers. Pack immunity is explicit in the Identity registry. The remaining Pack work is Pipeline-specific coverage and calibration, not an inert core model; see [`../engine-architecture.md`](../engine-architecture.md) and [`../roadmap.md`](../roadmap.md).
