# Hiviz Agent Instructions

Hiviz is a SvelteKit app for designing and exporting transparent-background video overlays for video editors like DaVinci Resolve. Compositions are authored as JSON **Presets** that compose five Layers (Surface / Block / Annotation / Overlay / Effect) from a registry of Pipelines. HTML/CSS/Svelte is the authoring surface; WICG HTML-in-Canvas + TypeGPU is the active rendering path; GSAP scrubs paused timelines by progress; Mediabunny produces transparent WebM exports. Glossary: [`docs/CONTEXT.md`](docs/CONTEXT.md). Why the per-tool routes are gone: [ADR-0002](docs/adr/0002-per-tool-routes-to-preset-engine.md).

## Binding rules — apply to every task

- **Transparent output is the contract.** Never paint an opaque canvas background. `loadOp: 'clear'` with `clearValue: [0, 0, 0, 0]`; canvas context `alphaMode: 'premultiplied'`.
- **Frame-determinism.** Drive all animation from an explicit `timestamp` / `frame` value. Scrub paused GSAP timelines by `progress`; never play by wall-clock. Preview and export must produce the same pixels at the same time.
- **Native target resolution.** 3840×2160 horizontal or 2160×3840 vertical. No upscaling from a smaller intermediate.
- **Strict TypeScript.** No `any`. `unknown` at trust boundaries, narrowed before use. Explicit return types on exports. No re-exports — import from source.
- **Verification is a separate agent.** Producer agents do not self-verify Presets. A Critic sub-agent runs the adversarial verification protocol (see [`docs/critic.md`](docs/critic.md)). "Done" means the Critic returned with no `pipeline-bug` or `default-too-permissive` findings.
- **Svelte runes discipline.** No `$effect` unless genuinely necessary. No rename-only `$derived` aliases. Components own their own data — read from managers / route directly where used; no prop-forwarding wrappers.
- **UI restraint.** No refresh buttons, save buttons, or explanatory text. Less UI > more UI. Use the simplest, flattest semantic HTML. Graffiti tokens and patterns before custom CSS.
- **Never run destructive git** (`git reset --hard`, `git revert`, `git restore`, `git clean -f`, force-push) without explicit user permission.
- **Never start a new dev server.** One runs at `http://localhost:5173`.
- **Utilities live in `src/lib/utils/`.** No new utility folders. Extend existing helpers before adding new ones.
- **No TODOs, placeholders, or no-op stubs.** Wire it now or the task isn't done.

## Dispatcher — what to read for what you're doing

Always read the doc named here for the task type. Skipping the dispatched doc is an instruction violation, not under-information.

| Task | Bind to |
|---|---|
| Brainstorming a new Preset / Pipeline / domain (pre-implementation) | [`docs/briefs/README.md`](docs/briefs/README.md), [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), [`docs/preset-format.md`](docs/preset-format.md), [ADR-0007](docs/adr/0007-brainstorm-brief-system.md) |
| Authoring a Preset *from a Brief* | [`docs/briefs/<slug>.md`](docs/briefs/), [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), [`docs/preset-format.md`](docs/preset-format.md) |
| Authoring or modifying a Preset (JSON, content, channel-fit) | [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), [`docs/preset-format.md`](docs/preset-format.md), [`docs/recipes/`](docs/recipes/) when present |
| Verifying a Preset's render | [`docs/critic.md`](docs/critic.md), [`docs/quality-rubric.md`](docs/quality-rubric.md), [`docs/animation-rubric.md`](docs/animation-rubric.md) |
| Building or fixing the rendering pipeline (TypeGPU, WGSL, effect chain) | [`docs/engine-architecture.md`](docs/engine-architecture.md), [`docs/html-in-canvas-typegpu.md`](docs/html-in-canvas-typegpu.md) |
| Adding a new Surface / Block / Annotation / Overlay / Effect type | [`docs/engine-architecture.md`](docs/engine-architecture.md) (pipeline registry), [`docs/preset-format.md`](docs/preset-format.md) (variant declarations) |
| Animation timing or motion design | [`docs/animation-rubric.md`](docs/animation-rubric.md), [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md) (motion vocabulary) |
| Channel-aesthetic decisions (palette, type, collage, chrome) | [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), `docs/inspo/` |
| Looking up a term | [`docs/CONTEXT.md`](docs/CONTEXT.md) |
| Looking up why a past decision was made | [`docs/adr/`](docs/adr/) |
| Open design questions still on the table | [`docs/todos/`](docs/todos/) |

## Repo layout

- `src/routes/` — SvelteKit routes. Presets render through a unified shell, not per-tool routes.
- `src/lib/platform/` — engine shell: `Workspace`, `Composition`, `SurfaceMount`, `OverlayLayer`, `gpu-host.ts`, `html-in-canvas.ts`, `timeline.svelte.ts`, `engine-state.svelte.ts`, `engine-schema.ts`, `preset.ts`, `runtime-audit.ts`, `preset-rubric.ts`, `export-video.ts`, and timeline UI components.
- `src/lib/platform/pipelines/` — the **Registry**, organized by Layer: `surfaces/`, `blocks/`, `annotations/`, `overlays/`, `effects/`.
- `src/lib/annotations/` — annotation-mark geometry and 2D drawing shared across Annotation Pipelines.
- `src/lib/presets/` — the built-in **Presets** as JSON.
- `src/lib/utils/` — the only utility folder. Don't create new ones.
- `scripts/` — verification and probe scripts (`scripts/probe-*.ts` for Critic measurements).
- `docs/` — reference docs dispatched from this file.
