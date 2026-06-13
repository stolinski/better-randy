# Hiviz roadmap

The **single backlog**. One entry per thing we want but don't yet have, with a status. This is where "designed but not built" lives — so it stops scattering across `todos/`, `ideas/`, and ADRs.

**The three tiers (where a thing lives by maturity):**
- **[`adr/`](adr/)** — a decision that is *true now*. The why behind current state.
- **`roadmap.md`** (this file) — *designed or wanted, but not built*. The backlog.
- **[`ideas/`](ideas/)** — *not yet designed*. Pure speculation.

An idea graduates: `ideas → roadmap → (built) → adr`.

**Status legend:** 🔨 building · 📐 designed (spec/ADR exists, no code) · 🧭 wanted (north-star direction, not yet specced) · ✅ shipped (recent, for context).

**Grain — this file vs dex.** This file holds **epics + direction** (coarse, rarely-changing, the *why*). The granular, stateful breakdown — per-task steps, what's in progress, dependencies — lives in **dex** (`.dex/`; run `dex list`). **dex is the source of truth for task state; this file is the strategic map.** Don't grow task-granular checklists here — that's exactly how the old `quality-roadmap.md` rotted into a tracker we had to delete.

Aligned to the north star (see [`../AGENTS.md`](../AGENTS.md)): an opinionated, Netflix-grade, multi-pack motion-graphics engine producing overlays + segments/bumpers, reflowing across horizontal/vertical, authored with full GUI ↔ agent parity.

## How this gets executed (the loop)

The default answer to "what's next?" — an agent self-serves this instead of asking the human to adjudicate every time:

1. **Pick:** `dex list --ready` → take the highest-priority unblocked task in the current epic.
2. **Do it, then close it:** `dex complete <id> --result "<what changed + how verified>" --commit <sha>`; re-run `dex list --ready` and continue.
3. **Within an epic, work autonomously** — no check-in task to task.
4. **At the end of each epic, STOP and check in with the human** — summarize what the epic delivered + anything learned, and get a go-ahead *before* starting the next epic. **This is the leash: epic-by-epic, not fully autonomous.**
5. **Also stop mid-epic and ask** before: removing any pipeline/feature (the prove-or-remove epic), resolving a design fork (a 0006-style tension), starting an undesigned arc, or when a task's intent is ambiguous against the docs/code.
6. **Critical path:** the engine arc (the dex epics) goes first — it unblocks the corpus and the rest.
7. **Activating a roadmap arc** = break its epic into dex tasks. **GUI parity is the exception — it needs a design grill first** (undesigned; task-ifying it cold produces rot). The corpus is demand-pulled: author one ship-grade deliverable per family through the Critic loop as the engine supports it.

**Aligned with the goals** = engine arc done **+** ≥1 ship-grade deliverable per surface/overlay family **+** the GUI reaches agent-parity. The arcs below are the scoreboard.

### Starting / finishing a session

**A clean agent starts with one instruction** (the same every time): *"Read `AGENTS.md` and `docs/roadmap.md` § How this gets executed, run `dex list --ready`, and start the top task; check in with me at each epic boundary."* `AGENTS.md` (auto-loaded) carries the north star + rules; **dex + git carry all state** — so the agent resumes from where dex says, not from the operator's memory. A brand-new agent and a returning one get the identical kickoff.

**At each epic boundary the agent stops and reports:** what the epic delivered, how it was verified, the commit SHA(s), anything it learned that changes the plan, and any decision it needs — then waits for a go-ahead before the next epic. Each finished task must already be `dex complete`d with a `--result` + `--commit`, code committed, and any in-progress task's description updated — so the next session is resumable by a *different* clean agent.

---

## Now — close the gap between the docs' "honest current state" and the north star

These are the engine-truth gaps the [blueprint](engine-architecture.md) flags in its honest-state notes. Highest leverage.

- 🔨 **Finish the structural Pack → pixel contract.** Color + font Roles reach pixels via `resolveAppearanceVars`. **`depth` is now wired** (typed `resolveDepthTreatment`, specific→core; proven on the `newspaper` hard-offset shadow — `syntax` 12px → `editorial-mono` flat), and the dead `resolveStyle`/`resolveRole` accessors are removed. Remaining: wire `edge` / `light` / `material` the same way; the skipped-color pass; a genuinely-editorial-mono-bound deliverable. Multi-pack is north-star-core, so finish — defer only if a clean staging emerges. (ADR-0014/0019/0023/0024 give the model.)
- 📐 **Skipped-color pass.** The alpha/gradient/prop-bound colors the var-ification left behind — `watermark` plate bg, `washi-tape` grain, `cursor-trail` trail, `shader-fill` GPU uniforms — need richer handling (rgb-channel vars / relative color / routing shader uniforms through the Pack). Out of scope for whole-color resolution until an rgb-channel resolver exists.
- 🧭 **Ship a real second-pack (`editorial-mono`) deliverable.** The 2nd pack is proven only via throwaway flips; author a preset genuinely bound to it as the multi-pack acceptance gate.
- 🧭 **Genuine orientation reflow.** Promote `orientation` from an authored constant to a *render target*; move the social safe-areas (already constants in `preset-rubric.ts`) from lint *checks* to layout *inputs*; resolve type/measure/motion-direction per orientation. One Preset → both aspects.
- 🧭 **Output background model.** A composition may declare a background fill (→ full-frame segment/bumper); transparency stays the default. Export lane keys off whether the frame is opaque to its edges (transparent WebM/ProRes 4444 vs opaque ProRes 422/H.264). No `kind` enum — emergent from the fill.

## The corpus (the bulk of remaining hours)

- 🔨 **One Critic-accepted deliverable per surface/overlay family.** Shipped: `lower-third-cinematic` (the reference bar). ~14 families still want a real, ship-grade deliverable authored to that bar. Repeatable now (Critic loop + reference exist); gated on real colors (pack wiring) and, for on-photo/collage families, edge-treatment primitives.
- 📐 **Make lower-third appearance-neutral.** Move "collage card" chrome out of the overlay into the Syntax pack (ADR-0006 → 0023). Overlay content is `kicker` + `title` + `subtitle`.
- ▫️ Carry-forward: `research-paper-attention.json:40` mark `ease:"smooth"` → `"sharp"` (from the closed revise note).

## Pipeline coverage decisions

- 🧭 **Decide the 4 dead-by-use pipelines.** `isolate` (annotation), `watermark` + `shader-fill` (overlays), `chromatic-aberration` (effect) are registered + boot-valid but referenced by zero presets. Each gets a proving fixture **or** removal. (`box`/`strike` are explicitly retained as authorable vocabulary.)
- 🧭 **Resolve camera motion.** `surface.camera` (`push`/`snap`) is in schema + UI + lint but no surface pipeline reads it. Wire it (frame-deterministic) or strip the field + control + lint together.
- 📐 **Make cursor-trail pointer Pack-resolved.** The 4 pointer SVG paths should read from a `cursor-trail.pointer` Role, not inline (ADR-0023).

## Designed, not built (specs exist, no code)

- 📐 **Z-depth / depth-of-field** — [ADR-0021](adr/0021-z-plane-semantics.md). Focal-distance sidecar to the color target; DOF/tilt-shift Effects read it. No depth target in code today.
- 📐 **Multi-state transitions** — [ADR-0022](adr/0022-multi-state-composition.md). `transition: { from, to, effect }`, dual-tree render, two color targets sampled by one mask. Relevant to segments/bumpers.
- 📐 **Starter templates** (ex-[ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md)) — curated Preset+Pack starting points both a human (GUI) and an agent begin from. The parity-era reframe of the never-built recipe cookbook.
- 🧭 **Heavy primitives** — general image/video **substrate input**; a general **configurable edge-treatment** primitive (clean / soft / irregular / torn / none) driven by the pack `edge-treatment` Role (torn is one value, not a default).
- 🧭 **Generalized animation model** — replace the 2-keyframe tween with ordered `keyframes[]` + per-channel ease; per-overlay enter descriptors; staggered follow-through.
- 🧭 **New Block types** — `mermaid` / `code` / `image` / `chart` (only `paragraph` ships).

## GUI ↔ agent parity (north-star surface, mostly unbuilt)

- 🧭 **GUI as a full from-scratch authoring tool**, co-equal with agents over one composition model — either creates a piece end-to-end alone, or they collaborate in either direction. Today the GUI is preview/tune; the parity build is the largest product surface and is net-new.

## Deferred / low-priority

- 🧭 **Export-output verification (real decode).** `scripts/probe-frame-diff.ts` asserts a frame sequence animates + carries alpha, but is only self-tested on captured frames (WebGPU canvas readback returns blank). Open: a frame-dump path from the actual WebM/ProRes encoder output so the probe consumes real exported frames.
- 🧭 **Linear-light blending** — changes composite math; risky; separate pass with heavy before/after verification (deferred from the render-path work).
- 🧭 **Fixer sub-agent** for `preset-choice`/`aesthetic-miss` Critic findings — build-harness; revisit after more Critic runs (open design question, ex-`todos/fixer-sub-agent.md`).
- 🧭 **`probe-timeline.ts`** for the G6/L4 timing rubric gap (currently no probe).
- 🧭 **Recalibrate G4 overlay cap-height bands** — sized for full-width broadcast lower-thirds; too large for a corner chip.

## Code hygiene (pure cleanup, no output impact)

- Remove rename-only `$derived` aliases + the `Controls.svelte` two-way `$effect` mirror; read managers directly.
- Prune `CAP_HEIGHT_BANDS.max` dead data + stale "lands in a follow-up" shaderPass comments (the path is wired).
- Converge the 7 surface `as unknown as SurfaceRenderInstance` double-casts into one typed adapter so `tsc` structurally checks each pipeline.

---

## ✅ Recently shipped (context)

- **The engine substrate:** one preset engine (5 Layers + registry), WebGPU/TypeGPU compositor, WICG HTML-in-Canvas capture, transparent 4K export, frame-determinism, 16-bit-float + dither render path, a substantive safety linter, a probe-backed adversarial Critic.
- **Pack color + font contract** end-to-end (CSS-var injection on mounts); 2 packs (`syntax`, `editorial-mono`); `verify-presets` gate green + enforced; demo presets quarantined as fixtures (`kind` field).
- **`lower-third-cinematic`** — first Critic-grade, ship-grade deliverable (the reference bar).
- **Doc refocus (2026-06)** — north star in [`../AGENTS.md`](../AGENTS.md); current-state [blueprint](engine-architecture.md); [ADR index](adr/README.md) with status + supersession chains; this roadmap.

## Folded in from `docs/todos/` (now superseded by this file)

`quality-roadmap.md` (master tracker — absorbed here) · `doc-and-state-cleanup.md` (engine-arch drift — done in the refocus) · `rubric-recharter.md` (done) · `pack-wiring-cleanup.md` (→ "finish structural Pack → pixel" above) · `lower-third-aesthetic.md` (closed; → edge-treatment primitive) · `research-paper-attention-revise.md` (closed; one item carried above) · `fixer-sub-agent.md` (→ deferred above). History is in git.
