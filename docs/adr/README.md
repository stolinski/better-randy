# ADR index

Architecture Decision Records — the *why* behind Hiviz's shape. Each records a decision and the alternatives rejected. The *what* (current engine truth) lives in [`../engine-architecture.md`](../engine-architecture.md); designed-but-unbuilt work in [`../roadmap.md`](../roadmap.md).

**Near-zero deletion.** Superseded and unbuilt ADRs are kept for history with a status stamp at the top of the file. Status legend:

- **Canon** — current product truth; load to understand why the engine is shaped this way.
- **Build-harness** — scaffolding to produce/verify the proof corpus, not the shipped product (the Critic lane).
- **Superseded** — replaced by a later decision; kept for history.
- **Designed, not built** — pinned semantics with no code yet; tracked in `roadmap.md`.

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-critic-sub-agent-verification.md) | Build-harness | Critic sub-agent + adversarial verification |
| [0002](0002-per-tool-routes-to-preset-engine.md) | Canon (foundational) | Per-tool routes → one preset engine (5 Layers + registry) |
| [0003](0003-aesthetic-neutral-rubric-split.md) | Canon (refined by 0025) | Aesthetic-neutral rubric; channel-fit in the Pack aesthetic doc |
| [0004](0004-recipe-cookbook-over-schema-chrome.md) | **Superseded** → starter templates | Recipe cookbook over schema-enforced chrome (never built) |
| [0005](0005-overlay-renderer-shader-pass.md) | Canon | `OverlayRenderer.shaderPass` for per-overlay shader work |
| [0006](0006-lower-third-corner-collage-card.md) | **Superseded by 0023** | Lower-third as collage card (now appearance-neutral; collage = Syntax dress) |
| [0007](0007-brainstorm-brief-system.md) | Build-harness | Brainstorm → Brief → Producer → Critic, delete-on-ACCEPT |
| [0008](0008-newspaper-surface-pipeline.md) | Canon | `newspaper` surface + `SurfaceRenderer.shaderPass` |
| [0009](0009-washi-tape-overlay.md) | Canon (overlay dead-by-use) | `washi-tape` overlay |
| [0010](0010-compose-pipeline-shaderpass-invocation.md) | Canon | shaderPass invocation (ShaderPassDispatcher) |
| [0011](0011-text-animation-orchestration.md) | Canon | Text animation as engine-state orchestration, not a sixth Layer |
| [0012](0012-effect-pack-context-progress-timestamp.md) | Canon | Time-driven `EffectPackContext` for the effect chain |
| [0013](0013-shaderpass-pack-context.md) | Canon | Time-driven `EffectPackContext` for `ShaderPass.packUniforms` |
| [0014](0014-pack-preset-split.md) | Canon (core) | Pack/Preset split — aesthetic-agnostic Presets, render-time Pack |
| [0015](0015-identity-spec-per-pipeline.md) | Canon (gate partly build-harness) | Identity Spec per Pipeline; engine refuses defaulted renders |
| [0016](0016-anti-patterns-loadbearing-when.md) | Canon | Q-rule anti-patterns: "load-bearing when claimed," not banned |
| [0017](0017-paper-surface-paint-bug-fix.md) | Canon | Paper surface enter/exit via `transform`, not `top` (capture fix) |
| [0018](0018-collapse-effects-to-frame-only.md) | Canon | Collapse effects to a single frame-level chain |
| [0019](0019-identity-spec-via-pack.md) | Canon (refined by 0023, 0024) | Identity dimensions declare `implementation` or `viaPack` |
| [0020](0020-variants-as-data.md) | Canon | Pipeline variants as data — one spec per family, one file per variant |
| [0021](0021-z-plane-semantics.md) | Semantics canon (mechanism refined by 0027) | Z = focal-distance scalar [0,1]; per-Layer defaults |
| [0022](0022-multi-state-composition.md) | Model canon (impl refined by 0026) | Multi-state transitions — `transition: {from,to,effect}` model + schema |
| [0023](0023-pack-is-appearance-only.md) | Canon (core) | Pack is appearance-only; no privileged default |
| [0024](0024-role-resolution-core-fallback.md) | Canon (core) | Role resolution: per-Pipeline override → core fallback |
| [0025](0025-static-linter-checks-safety-and-readability-only.md) | Canon (refines 0003) | Static linter = video-safety + readability only; taste is Critic-judged |
| [0026](0026-transitions-v1-snapshot-and-wipe.md) | Canon (refines 0022) | Transitions v1 = snapshot each state to a texture + mask-wipe; not live dual-tree |
| [0027](0027-dof-v1-multiplane-bokeh.md) | Canon (refines 0021) | DOF v1 = multiplane bokeh (depth-separated planes + CoC bokeh blur); not a per-pixel depth target |
| [0028](0028-dimensional-depth-stage.md) | **Canon (v1 built)** (refines 0027, 0021) | Dimensional depth stage — opt-in WebGPU 3D compositor (`state.stage`: surface plane over a backdrop at depth + per-pixel depth + mip-gather DOF + camera) for continuous-depth pieces; integrated + Critic-accepted; flat multiplane stays default |

## Supersession & refinement chains

- `0003` → made structurally true by `0014` → static-linter line drawn by `0025`
- `0005` + `0008` (shaderPass contracts) → invocation by `0010` → time-context by `0013`
- `0012` (effect-chain time) ↔ `0013` (shaderPass time)
- `0014` + `0015` seam → closed by `0019` → refined by `0023` (appearance-only) + `0024` (core fallback)
- `0015` anti-pattern collision → resolved by `0016`
- `0006` → superseded by `0023`; `0004` → reframed as starter templates ([roadmap](../roadmap.md))
- `0022` (multi-state model) → implementation refined by `0026` (snapshot-and-wipe for v1; live dual-tree deferred)
- `0021` (Z semantics) → mechanism refined by `0027` (multiplane bokeh for v1; per-pixel depth target / z-map deferred) → continuous-depth path realized by `0028` (real 3D stage; per-pixel depth from geometry; flat multiplane stays default)

## Implementation reality (not ADR supersession)

The Pack model (`0014` / `0019` / `0023` / `0024`) is **wired for color + font only**; structural Roles (edge / depth / light / material) are declared + boot-validated but inert. See [`../engine-architecture.md`](../engine-architecture.md) § Appearance and [`../roadmap.md`](../roadmap.md).
