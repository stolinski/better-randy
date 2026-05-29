# Hiviz docs index

Each doc has one purpose. Don't load docs that don't apply to the task at hand.

| Doc | Purpose | Load when | Don't load when |
|---|---|---|---|
| [`/AGENTS.md`](../AGENTS.md) | Entry point. Architecture summary, universal binding rules, dispatcher to deep docs. | Always loaded by the harness. | — |
| [`CONTEXT.md`](CONTEXT.md) | Glossary of project terms (Preset, Layer, Surface, Block, Annotation, Mark, Overlay, Effect, Pipeline, Critic, etc.) and how they relate. | A term in another doc is ambiguous, or you're about to use one yourself. | You already know the term means what it usually means here. |
| [`aesthetic.md`](aesthetic.md) | The Hiviz channel aesthetic: palette, type, Surface vocabulary, Collage system, motion vocabulary, anti-aesthetic. *Which well-made the channel wants.* | Authoring a Preset, judging channel-fit, picking palette/type/chrome. | Working on pipeline code or rubric craft floor (aesthetic-neutral, see [ADR-0003](adr/0003-aesthetic-neutral-rubric-split.md)). |
| [`quality-rubric.md`](quality-rubric.md) | The craft floor: R-rules (render quality, gating) and Q-rules (composition). Aesthetic-neutral. | Verifying a Preset; spawning the Critic; fixing a `pipeline-bug` finding. | Picking palette / type / channel chrome (those belong to `aesthetic.md`). |
| [`animation-rubric.md`](animation-rubric.md) | Motion rules: G-rules (general) and per-Overlay rules. | Choosing eases, durations, motion vocabulary; verifying a Preset's animation. | Working on a still composition with no motion concern. |
| [`critic.md`](critic.md) | Adversarial verification protocol: how the Critic sub-agent runs, what it outputs, which probe scripts exist, how findings are classified. | Spawning the Critic. Acting on Critic findings. Implementing probe scripts. | Authoring a Preset (the Critic is downstream). |
| [`engine-architecture.md`](engine-architecture.md) | Engine internals: data model, five-Layer rendering, pipeline registry, composition shader, effect chain, acceptance criteria, AI-authoring contract, authoring risks, constraints. | Building or modifying engine internals; adding a new Layer/Pipeline type; writing or reviewing a new Preset against the constraints. | Pure aesthetic / channel-fit work. |
| [`preset-format.md`](preset-format.md) | Reference for the `hiviz@1` Preset JSON format. Companion: [`preset-format.schema.json`](preset-format.schema.json) (machine-readable). | Authoring or validating a Preset. | Working on engine internals (those are in `engine-architecture.md`). |
| [`html-in-canvas-typegpu.md`](html-in-canvas-typegpu.md) | The canonical WebGPU pattern: `copyElementImageToTexture` on a layoutsubtree canvas, TypeGPU API shape, WGSL pitfalls. | Building or fixing a Pipeline that mixes HTML-in-Canvas with shaders. | Pure preset authoring, pure 2D annotation work. |
| [`adr/`](adr/) | Architecture Decision Records. One file per decision; numbered sequentially. | Wondering why something is the way it is, or about to revisit a past decision. | You don't need the historical rationale to do the task. |
| [`briefs/`](briefs/) | The current in-flight surface: one Brief per not-yet-shipped Preset, Pipeline, or domain. Authored by `/brainstorm`, read by `/author`, never seen by `/critic`. Deleted on Critic ACCEPT. | About to start, continue, or hand off the build of a specific Preset / Pipeline / domain. | Verifying (Critic) or just executing engine internals against an existing Preset. |
| [`todos/`](todos/) | Open design questions still on the table — not yet ADR-worthy, not yet resolved. One file per question. | A decision you're about to make might be already-debated; or you're looking for the next system-level call. | You're executing a known plan. |
| [`ideas/`](ideas/) | Forward-looking exploration of features not yet committed — speculative product surface (CLI shape, transcript-driven workflows, etc.). One file per idea. | Considering a new feature area; checking whether something has already been sketched. | Executing a resolved plan; building shipping features. |
| [`inspo/`](inspo/) | Channel reference images. Subdirectories: `newspaper/`, `pullquote/`, `website/`. | Authoring a Surface; calibrating channel-fit; resolving an `aesthetic-miss` finding. | Engine or rubric work. |

## Currently open ADRs

- [`adr/0001-critic-sub-agent-verification.md`](adr/0001-critic-sub-agent-verification.md) — Critic sub-agent + adversarial verification.
- [`adr/0002-per-tool-routes-to-preset-engine.md`](adr/0002-per-tool-routes-to-preset-engine.md) — Why `src/lib/tools/` is gone.
- [`adr/0003-aesthetic-neutral-rubric-split.md`](adr/0003-aesthetic-neutral-rubric-split.md) — Quality rubric is aesthetic-neutral; channel-fit lives in `aesthetic.md`.
- [`adr/0004-recipe-cookbook-over-schema-chrome.md`](adr/0004-recipe-cookbook-over-schema-chrome.md) — Channel chrome enforced at Critic time, not schema validation.
- [`adr/0005-overlay-renderer-shader-pass.md`](adr/0005-overlay-renderer-shader-pass.md) — `OverlayRenderer.shaderPass` for per-overlay shader work (torn-edge, fiber, hard offset shadow).
- [`adr/0006-lower-third-corner-collage-card.md`](adr/0006-lower-third-corner-collage-card.md) — Lower-third is a corner collage card with `{ kicker, title }`.
- [`adr/0007-brainstorm-brief-system.md`](adr/0007-brainstorm-brief-system.md) — Brainstorm → Brief → Producer → Critic, with delete-on-ACCEPT.

## Pending build-outs

These are decided in principle but haven't landed yet:

- `docs/recipes/` — per-Surface starter scaffolds. The generation-side floor-raiser from the grill (ADR-0004 / Q10).
- Lower-third + watermark visual rebuild and the `shaderPass` infrastructure — see [`todos/lower-third-aesthetic.md`](todos/lower-third-aesthetic.md). 4–6 hour focused build; all design decisions captured in ADR-0005 + ADR-0006.
- Fixer sub-agent for `preset-choice` and `aesthetic-miss` findings — see [`todos/fixer-sub-agent.md`](todos/fixer-sub-agent.md).
