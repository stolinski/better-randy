# GFX docs index

Entry point is [`../AGENTS.md`](../AGENTS.md) (auto-loaded; `CLAUDE.md` symlinks to it) — north star, binding rules, dispatcher. Each doc below has one purpose; don't load docs that don't apply to the task.

| Doc | Purpose | Load when |
|---|---|---|
| [`engine-architecture.md`](engine-architecture.md) | **The current-state blueprint** — data model, pipeline registry (live contents), render path, the Pack appearance system, output/orientation, and an honest "designed, not built" section. | Building or understanding how the engine works today; adding a Layer/Pipeline type. |
| [`CONTEXT.md`](CONTEXT.md) | Glossary of project terms (Preset, Layer, Surface, Pack, Role, Pipeline, Critic, …). | A term is ambiguous, or you're about to use one yourself. |
| [`preset-format.md`](preset-format.md) | The `supers@1` Preset JSON format. Companion: [`preset-format.schema.json`](preset-format.schema.json) (machine-readable). | Authoring or validating a Preset. |
| [`packs/syntax/aesthetic.md`](packs/syntax/aesthetic.md) | The **Syntax** channel aesthetic: palette, type, surface vocabulary, collage system, motion vocabulary, anti-aesthetic. *(A different Pack carries different appearance.)* | Authoring for channel-fit; picking palette/type/chrome. |
| [`quality-rubric.md`](quality-rubric.md) · [`animation-rubric.md`](animation-rubric.md) | The craft floor: R/Q-rules (render + composition) and G-rules (motion). Aesthetic-neutral. | Verifying a Preset; spawning the Critic. |
| [`critic.md`](critic.md) | The adversarial verification protocol *(build-harness — see [ADR-0001](adr/0001-critic-sub-agent-verification.md))*. | Running the Critic / acting on its findings. |
| [`html-in-canvas-typegpu.md`](html-in-canvas-typegpu.md) | The WebGPU + WICG HTML-in-Canvas pattern, TypeGPU shape, WGSL pitfalls. | Building or fixing a Pipeline that mixes HTML-in-Canvas with shaders. |
| [`adr/`](adr/) | Architecture Decision Records — the *why*. Start at the [**ADR index**](adr/README.md) (status + supersession chains). | Wondering why something is the way it is. |
| [`roadmap.md`](roadmap.md) | **The single backlog** — designed/wanted/building, one entry per item with status. Absorbed the old `todos/` + `quality-roadmap`. | Looking for what's planned, or what's designed-but-unbuilt. |
| [`project-control-plane.md`](project-control-plane.md) | The lean control plane — deterministic checks, the planning-drift audit, the `gfx-factory`, and the `sentry-autofix` lane. | Understanding how repo checks, planning audits, and automation fit together. |
| [`user-composition-workflows.md`](user-composition-workflows.md) | User-composition interchange, validation, verification, and the CLI render/batch lane. | Importing/exporting compositions or automating renders. |
| [`sentry-dev-flow.md`](sentry-dev-flow.md) | Sentry capture boundaries and the fix-broken-code loop. | Investigating runtime errors, traces, or export performance. |
| [`ideas/`](ideas/) | Pre-design speculation — a thing that *might* be built someday. | Considering a new feature area not yet designed. |
| [`history/`](history/) | Historical explorations and shipped design docs, kept for reference. | Tracing how a shipped design evolved. |
| [`briefs/`](briefs/) | The in-flight build queue *(build-harness)* — one Brief per about-to-be-built Preset/Pipeline. | Starting/continuing the build of a specific thing. |
| [`inspo/`](inspo/) | Channel reference images (`newspaper/`, `pullquote/`, `website/`). | Calibrating channel-fit; resolving an `aesthetic-miss`. |
| [`critic-captures/`](critic-captures/) | Archived Critic investigation reports (cinematic audit, fade-bug forensics). | Following a roadmap/ADR pointer into a past investigation. |

**Maturity flow:** an idea graduates `ideas/` → `roadmap.md` (designed/wanted) → `briefs/` (about to build) → built → `adr/` (decided + true); historical explorations land in `history/`. The glossary, blueprint, and rubrics describe the present; the roadmap describes the future; the ADRs explain the past.

> `docs/aesthetic.md` is a redirect stub kept only so older references resolve — the real channel aesthetic is [`packs/syntax/aesthetic.md`](packs/syntax/aesthetic.md). Don't bind new work to the stub.
