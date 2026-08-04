# Supers Agent Instructions

Supers is an opinionated, high-end **motion-graphics engine** on a web stack (TypeGPU/WebGPU + WICG HTML-in-Canvas + GSAP + Mediabunny). It produces broadcast-quality motion pieces — **transparent overlays** composited over footage, and **full-frame segments/bumpers** — authored by a GUI and by agents over one composition model. Local schema, persistence, and create-from-blank parity are shipped; end-to-end interchange, verification, shared-store access, and headless-render parity remain tracked in Dex. Compositions are JSON **Presets** that compose five Layers (Surface / Block / Annotation / Overlay / Effect) from a Pipeline registry; **appearance** is supplied by a swappable **Pack** (the engine is general, the look is not); pieces **reflow** across horizontal (YouTube) and vertical (TikTok/Reels) targets with platform safe-areas. The quality bar is Netflix-grade: *After Effects is the quality ceiling, not the architecture* — Supers stays a tasteful, constrained vocabulary with smart defaults, never a general node compositor. Glossary: [`docs/CONTEXT.md`](docs/CONTEXT.md). Why per-tool routes became one engine: [ADR-0002](docs/adr/0002-per-tool-routes-to-preset-engine.md).

> `CLAUDE.md` is a symlink to this file — this is the single canonical entry point for every agent tool.

## Binding rules — apply to every task

- **Transparency is the default, not a law.** Overlays render transparent — `loadOp: 'clear'`, `clearValue: [0, 0, 0, 0]`, canvas context `alphaMode: 'premultiplied'`. A composition **may** declare a background fill, which makes it a full-frame piece (segment/bumper); output classification changes the filename and WebM pixel format, while the current ProRes lane remains 4444 for both transparent and opaque compositions. Never paint a background a composition didn't ask for.
- **Frame-determinism.** Drive all animation from an explicit `timestamp` / `frame` value. Scrub paused GSAP timelines by `progress`; never play by wall-clock. Preview and export must produce the same pixels at the same time.
- **Native target resolution.** 3840×2160 horizontal or 2160×3840 vertical. No upscaling from a smaller intermediate.
- **Every deliverable Preset is orientation- and Pack-neutral.** One Preset must render and look good in *both* horizontal and vertical *and* under every Pack ([ADR-0039](docs/adr/0039-pack-neutral-compositions-and-listing-hygiene.md)). Never create per-orientation or per-Pack variants of a composition, and never ask whether a preset "should support" vertical or horizontal — *how* it reflows is designable; *whether* it reflows is not. Existing fixture-only recompositions and Pack calibration re-dresses document engine gaps or validate Packs; they are not listed deliverables or authoring precedent.
- **Strict TypeScript.** No `any`. `unknown` at trust boundaries, narrowed before use. Explicit return types on exports. No re-exports — import from source.
- **Proof-corpus discipline (build-harness — not product law).** While we build the reference corpus that proves the engine hits the bar, agent-authored Presets are verified by a separate Critic; producers don't self-verify (see [`docs/critic.md`](docs/critic.md)). This is bootstrap scaffolding, *not* the product's authoring model — shipped core authoring gives the GUI and agents one Preset model, while operational verification parity remains tracked in Dex; the human in the GUI is the live critic today. "Done" for a corpus Preset still means the Critic returned no `pipeline-bug` or `default-too-permissive` findings.
- **Svelte runes discipline.** No `$effect` unless genuinely necessary. No rename-only `$derived` aliases. Components own their own data — read from managers / route directly where used; no prop-forwarding wrappers.
- **UI restraint.** No refresh buttons, save buttons, or explanatory text. Less UI > more UI. Use the simplest, flattest semantic HTML. Graffiti tokens and patterns before custom CSS.
- **Never run destructive git** (`git reset --hard`, `git revert`, `git restore`, `git clean -f`, force-push) without explicit user permission.
- **Never start a new dev server.** One runs at `http://localhost:7263`.
- **Local-only — there is no Cloudflare.** Supers runs on the local dev server and is not deployed anywhere. The `@sveltejs/adapter-cloudflare` / `wrangler` entries in the repo are vestigial build config — never treat Workers/edge constraints as binding, never pick libraries or architectures "for Cloudflare compatibility," and never reach for Cloudflare services (KV, D1, R2, Workers). Server routes freely use Node APIs, the local filesystem, and local binaries.
- **Canvas-verification Chrome is already solved — never improvise a launch.** Rendering needs `--enable-blink-features=CanvasDrawElement`; an unflagged browser captures a blank canvas. Two sanctioned paths only: (1) the `chrome-devtools` MCP browser already carries the flag (configured in `~/.claude.json`) — just use its tools; (2) the CDP harness on port 9223 — start/confirm it with `scripts/launch-cdp-chrome.sh`, drive it with `scripts/cdp-capture.mjs` and the other `scripts/cdp-*.mjs`.
- **Utilities live in `src/lib/utils/`.** No new utility folders. Extend existing helpers before adding new ones.
- **No TODOs, placeholders, or no-op stubs.** Wire it now or the task isn't done.

## Agent discoverability

- **Write names for search.** Exported symbols, methods, domain types, files, and directories must be distinctive search terms. Prefer two or three descriptive words including a domain noun (`createStripeClient`, `PresetRenderResult`) over generic names (`create`, `Client`, `Result`, `Data`, `Config`).
- **Use one spelling per concept.** Follow the canonical terminology in `docs/CONTEXT.md`; do not mix aliases or abbreviations such as `organizationId` / `orgId`, or rename imports without a concrete conflict.
- **Keep modules concept-focused.** Prefer domain-named files over generic grab bags. Split large mixed-concern modules when the resulting files can be named after coherent concepts; do not split solely to satisfy a line-count target.
- **Make types searchable and corrective.** Use precise domain types instead of primitive-shaped parameters where values can be confused. Prefer distinct ID types when swapping IDs would otherwise type-check.
- **Document where search lands.** Put short comments about non-obvious constraints or intent directly above the relevant definition. Document intentional absences where a reader would reasonably search for the behavior.
- **Pair source and test names.** Name colocated tests after the source unit they cover (`preset.ts` -> `preset.test.ts`) so implementations and verification are found together.
- **Identify legacy code.** Remove obsolete paths when possible; otherwise mark retained APIs with `@deprecated` and name the supported replacement.

## Dispatcher — what to read for what you're doing

Always read the doc named here for the task type. Skipping the dispatched doc is an instruction violation, not under-information.

| Task | Bind to |
|---|---|
| Brainstorming a new Preset / Pipeline / domain (pre-implementation) | [`docs/briefs/README.md`](docs/briefs/README.md), [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), [`docs/preset-format.md`](docs/preset-format.md), [ADR-0007](docs/adr/0007-brainstorm-brief-system.md) |
| Authoring a Preset *from a Brief* | [`docs/briefs/<slug>.md`](docs/briefs/), [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), [`docs/preset-format.md`](docs/preset-format.md) |
| Authoring or modifying a Preset (JSON, content, channel-fit) | [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), [`docs/preset-format.md`](docs/preset-format.md) |
| Verifying a Preset's render | [`docs/critic.md`](docs/critic.md), [`docs/quality-rubric.md`](docs/quality-rubric.md), [`docs/animation-rubric.md`](docs/animation-rubric.md) |
| Syncing a piece to a DaVinci Resolve edit (markers → timings → export → place) | [`.claude/skills/resolve-sync/SKILL.md`](.claude/skills/resolve-sync/SKILL.md), [ADR-0042](docs/adr/0042-resolve-marker-sync.md) |
| Building or fixing the rendering pipeline (TypeGPU, WGSL, effect chain) | [`docs/engine-architecture.md`](docs/engine-architecture.md), [`docs/html-in-canvas-typegpu.md`](docs/html-in-canvas-typegpu.md) |
| Adding a new Surface / Block / Annotation / Overlay / Effect type | [`docs/engine-architecture.md`](docs/engine-architecture.md) (pipeline registry), [`docs/preset-format.md`](docs/preset-format.md) (variant declarations) |
| Animation timing or motion design | [`docs/animation-rubric.md`](docs/animation-rubric.md), [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md) (motion vocabulary) |
| Channel-aesthetic decisions (palette, type, collage, chrome) | [`docs/packs/syntax/aesthetic.md`](docs/packs/syntax/aesthetic.md), `docs/inspo/` |
| Authoring a new Pack (house archetype or customer brand) | [`docs/packs/authoring-playbook.md`](docs/packs/authoring-playbook.md) — intake → contract → manifest/fonts/aesthetic doc → machine gates → Calibration Trio |
| Looking up a term | [`docs/CONTEXT.md`](docs/CONTEXT.md) |
| Looking up why a past decision was made | [`docs/adr/`](docs/adr/) — start at the [ADR index](docs/adr/README.md) |
| What's planned, and what to work on next | [`docs/roadmap.md`](docs/roadmap.md) — strategic backlog + the execution loop (check in per epic); live tasks in **dex** (`dex list --ready`) |
| Understanding how the engine actually works today | [`docs/engine-architecture.md`](docs/engine-architecture.md) — the current-state blueprint |
| Investigating runtime errors, traces, or export performance | [`docs/sentry-dev-flow.md`](docs/sentry-dev-flow.md) — Sentry capture boundaries and the fix-broken-code loop |

## Repo layout

- `src/routes/` — SvelteKit routes. Presets render through a unified shell, not per-tool routes.
- `src/lib/platform/` — engine shell: `Workspace`, `Composition`, mounts and inspectors; `composition-frame-renderer.ts`, `composition-export-controller.ts`, and `transition-snapshot-controller.ts` own their named orchestration; `timeline-entity-identity.ts` owns runtime timeline identities; `user-composition-store.ts` owns the client-side User composition transport; plus state, schema, preset, GPU, HTML-in-Canvas, audit, lint, and encoding modules.
- `src/lib/pipelines/<layer>/` — the per-Layer **Pipeline** renderers (`surfaces/`, `blocks/`, `annotations/`, `overlays/`, `effects/`), one folder per variant.
- `src/lib/platform/pipelines/` — Registry + runner **infrastructure** only (`index.ts`, `identity-registry.ts`, `effect-chain.ts`, `shader-pass-runner.ts`, `types.ts`) — not the renderers.
- `src/lib/annotations/` — annotation-mark geometry and 2D drawing shared across Annotation Pipelines.
- `src/lib/presets/` — the built-in **Presets** as JSON.
- `src/lib/utils/` — the only utility folder. Don't create new ones.
- `scripts/` — verification and probe scripts (`scripts/probe-*.ts` for Critic measurements).
- `docs/` — reference docs dispatched from this file.

<!-- BEGIN swamp managed section - DO NOT EDIT -->
# Project

This repository is managed with [swamp](https://github.com/swamp-club/swamp).

## Rules

1. **Search before you build.** When automating AWS, APIs, or any external service: (a) search community extensions with `swamp extension search <query>` — prefer `@swamp/*` official extensions first, (b) search local/installed types with `swamp model type search <query>`, (c) if a community extension exists, install it with `swamp extension pull <package>` instead of building from scratch, (d) extend an existing type if it covers the domain but lacks the method you need, (e) only create a custom extension model in `extensions/models/` as a last resort. Use the `swamp` skill for guidance. The `command/shell` model is ONLY for ad-hoc one-off shell commands, NEVER for wrapping CLI tools or building integrations.
2. **Extend, don't be clever.** When a model covers the domain but lacks the method you need, extend it with `export const extension` — don't bypass it with shell scripts, CLI tools, or multi-step hacks. One method, one purpose. Use `swamp model type describe <type> --json` to check available methods.
3. **Use the data model.** Once data exists in a model (via `lookup`, `start`, `sync`, etc.), reference it with CEL expressions. Don't re-fetch data that's already available.
4. **CEL expressions everywhere.** Wire models together with CEL expressions. Always prefer `data.latest("<name>", "<dataName>").attributes.<field>` over the deprecated `model.<name>.resource.<spec>.<instance>.attributes.<field>` pattern.
5. **Verify before destructive operations.** Always `swamp model get <name> --json` and verify resource IDs before running delete/stop/destroy methods.
6. **Prefer fan-out methods over loops.** When operating on multiple targets, use a single method that handles all targets internally (factory pattern) rather than looping N separate `swamp model method run` calls against the same model. Multiple parallel calls against the same model contend on the per-model lock, causing timeouts. A single fan-out method acquires the lock once and produces all outputs in one execution. Check `swamp model type describe` for methods that accept filters or produce multiple outputs.
7. **Extension npm deps are bundled, not lockfile-tracked.** Swamp's bundler inlines all npm packages (except zod) into extension bundles at bundle time. `deno.lock` and `package.json` do NOT cover extension model dependencies — this is by design. Always pin explicit versions in `npm:` import specifiers (e.g., `npm:lodash-es@4.17.21`).
8. **Reports for reusable data pipelines.** When the task involves building a repeatable pipeline to transform, aggregate, or analyze model output (security reports, cost analysis, compliance checks, summaries), create a report extension. Use the `swamp` skill for guidance.
9. **"Workflow" means a swamp workflow.** In this repository the word "workflow" (and "create/run/execute/validate/debug workflow", "automate", "orchestrate", "automated/nightly job") refers to a swamp workflow — a declarative YAML DAG of model-method steps authored via `swamp workflow create`. Load and follow the `swamp` skill for these requests. Do NOT interpret these as a request to build an agent task list, spin up worktrees, or schedule a cron/remote agent. Only use those orchestration mechanisms when the user explicitly names one (e.g. "task list", "subagent", "worktree", "cron", "remote agent") or explicitly asks you to do the work yourself step by step rather than author a swamp workflow.
10. **Use swamp, don't bypass it.** Always work through swamp commands — don't go around them with raw shell tools. Use `swamp data query` to find data, not `grep`/`find` on `.swamp/` files. Use model methods to interact with resources, not `curl`/`aws`/`gcloud`/`kubectl` when a model type already wraps that API — check with `swamp model type search`. Use `swamp help` for CLI discovery, not guesswork. Composing with swamp output is fine (e.g. piping `--json` through `jq`) — the anti-pattern is bypassing swamp entirely.
11. **Inspect reports after failures.** When a model method or workflow run fails, inspect its generated reports before retrying or changing definitions. Reports run even on failure and capture structured diagnostics — error messages, execution status, arguments, and data output pointers. Use `swamp report get @swamp/method-summary --model <model> --json` for method failures or `swamp report get @swamp/workflow-summary --workflow <workflow> --json` for workflow failures. Run `swamp help report get` to confirm current retrieval syntax.

## Skills

**IMPORTANT:** Always load swamp skills, even when in plan mode. The skills provide
essential context for working with this repository.

- `swamp` - Swamp CLI — models, workflows, data, vaults, extensions, publishing, repos, reports, issues, and troubleshooting
- `swamp-getting-started` - Interactive onboarding for new swamp users

## Getting Started

**IMPORTANT:** At the start of every conversation, run
`swamp model search --json`. If no models are returned (empty result), you MUST
immediately invoke the `swamp-getting-started` skill before doing anything else.
This walks new users through an interactive onboarding tutorial.

If models already exist, start by using the `swamp` skill to work with
swamp models.

## Commands

Use `swamp --help` to see available commands. For a machine-readable JSON
schema of the CLI (commands, options, arguments) intended for agent
consumption, run `swamp help [<command>...]` — e.g. `swamp help` returns
the full tree, and `swamp help model method run` scopes to a subtree.
<!-- END swamp managed section -->
