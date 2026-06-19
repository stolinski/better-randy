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
6. **Critical path:** the engine arc is done — the corpus is now the critical path.
7. **Activating a roadmap arc** = break its epic into dex tasks. **GUI parity is the exception — it needs a design grill first** (undesigned; task-ifying it cold produces rot). The corpus is demand-pulled: author one ship-grade deliverable per family through the Critic loop as the engine supports it.

**Aligned with the goals** = engine arc done ✅ **+** ≥1 ship-grade deliverable per surface/overlay family **+** the GUI reaches agent-parity. The arcs below are the scoreboard.

### Starting / finishing a session

**A clean agent starts with one instruction** (the same every time): *"Read `AGENTS.md` and `docs/roadmap.md` § How this gets executed, run `dex list --ready`, and start the top task; check in with me at each epic boundary."* `AGENTS.md` (auto-loaded) carries the north star + rules; **dex + git carry all state** — so the agent resumes from where dex says, not from the operator's memory. A brand-new agent and a returning one get the identical kickoff.

**At each epic boundary the agent stops and reports:** what the epic delivered, how it was verified, the commit SHA(s), anything it learned that changes the plan, and any decision it needs — then waits for a go-ahead before the next epic. Each finished task must already be `dex complete`d with a `--result` + `--commit`, code committed, and any in-progress task's description updated — so the next session is resumable by a *different* clean agent.

---

## Now — the corpus arc

The engine gap is closed. The current arc is producing one Critic-accepted, ship-grade deliverable per surface/overlay family. Two families are done (`lower-third-cinematic` as the reference bar; `server-renders-again` as the editorial-mono acceptance gate). Thirteen families remain.

Gating note: on-photo and collage families (`pullquote-on-photo`) are partially blocked on edge-treatment primitives (still in "Designed, not built"). All other families are unblocked — pack wiring is live.

**dex is the source of truth for per-family task state** (run `dex list --ready`).

## The corpus

- 🔨 **One Critic-accepted deliverable per surface/overlay family.** Shipped: `lower-third-cinematic` + `server-renders-again`. Remaining surfaces: `chapter-card`, `newspaper`, `paper`, `pullquote-on-photo`, `title-sequence`, `type-hero`. Remaining overlays: `counter`, `cursor-trail`, `instance-stack`, `shader-fill`, `text-3d`, `washi-tape`, `watermark`.
- 📐 **Make lower-third appearance-neutral.** Move "collage card" chrome out of the overlay into the Syntax pack (ADR-0006 → 0023). Overlay content is `kicker` + `title` + `subtitle`.

## Pipeline coverage decisions

- ✅ **The 4 dead-by-use pipelines — proven, kept.** `isolate`, `watermark`, `shader-fill`, `chromatic-aberration` each got a proving fixture (`*-demo`); every registered pipeline is now referenced by ≥1 preset.
- ✅ **camera motion stripped.** `surface.camera` (`push`/`snap`) was inert (no pipeline read it); field, UI control, and lint rule removed together.
- ✅ **cursor-trail pointer Pack-resolved.** The 4 pointer SVG paths now read from a `cursor-trail.pointer` Role (ADR-0023).

## Designed, not built (specs exist, no code)

- 📐 **Z-depth / depth-of-field** — [ADR-0021](adr/0021-z-plane-semantics.md). Focal-distance sidecar to the color target; DOF/tilt-shift Effects read it. DOF v1 ships flat (multiplane bokeh, [ADR-0027](adr/0027-dof-v1-multiplane-bokeh.md)); no per-pixel depth target in code today.
- 📐 **Dimensional depth stage** — [ADR-0028](adr/0028-dimensional-depth-stage.md). Opt-in WebGPU 3D compositor for continuous-depth pieces: Layer textures on perspective planes at their ADR-0021 z, per-pixel depth from geometry, mip-prefiltered gather DOF, real camera (`stage.camera`) + light. **Validated end-to-end in a POC** (`src/routes/poc/dof3d/`): determinism, parallax + rack-focus motion, export==preview through Mediabunny, clean at 4K + vertical. Engine work (stage selector + schema, scene renderer on the 0026/0027 capture seam, depth+DOF passes, orientation framing, Critic checks, demo Preset) not yet broken into dex tasks. Flat multiplane (0027) stays default + backbone for text-critical pieces.
- ✅ **Multi-state transitions (v1)** — [ADR-0022](adr/0022-multi-state-composition.md) model + [ADR-0026](adr/0026-transitions-v1-snapshot-and-wipe.md) impl. Shipped: `transition: { from, to, effect, durationMs }`, snapshot each state to a texture, `mask-wipe` Effect composites a true per-pixel wipe. **Upgrade path:** live dual-tree (states animating mid-wipe) via a context-scoped engine-state refactor, when a Preset needs it.
- 📐 **Starter templates** (ex-[ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md)) — curated Preset+Pack starting points both a human (GUI) and an agent begin from.
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

---

## ✅ Recently shipped (context)

- **Multi-state transitions v1 (2026-06):** snapshot-and-wipe (ADR-0026). A `transition` Preset snapshots its `from`/`to` states into textures and the `mask-wipe` Effect composites a true per-pixel wipe between them; pixel-verified end-to-end. Came with a render-path hardening pass: fixed an infinite `$effect` loop that froze all rendering, then reduced Workspace render orchestration from 7 effects to a single explicit render path + one untracked authoring→canvas bridge. Also: built `scripts/cdp-capture.mjs` (drives a flag-enabled Chrome over CDP) — the first real pixel-verification harness.
- **Engine arc complete (2026-06):** structural Pack→pixel contract (rgb-channel resolver, skipped-color pass, depth/font Roles end-to-end); genuine orientation reflow (safe-areas as layout inputs, per-orientation type/motion); output background model (emergent segment/bumper lane via `backgroundFill`); camera motion stripped; cursor-trail pointer Pack-resolved; 4 dead pipelines proven; code hygiene (double-casts converged, dead accessors removed).
- **`server-renders-again`** — editorial-mono acceptance gate; proves multi-pack is live end-to-end.
- **The engine substrate:** one preset engine (5 Layers + registry), WebGPU/TypeGPU compositor, WICG HTML-in-Canvas capture, transparent 4K export, frame-determinism, 16-bit-float + dither render path, a substantive safety linter, a probe-backed adversarial Critic.
- **Pack color + font contract** end-to-end (CSS-var injection on mounts); 2 packs (`syntax`, `editorial-mono`); `verify-presets` gate green + enforced; demo presets quarantined as fixtures (`kind` field).
- **`lower-third-cinematic`** — first Critic-grade, ship-grade deliverable (the reference bar).
- **Doc refocus (2026-06)** — north star in [`../AGENTS.md`](../AGENTS.md); current-state [blueprint](engine-architecture.md); [ADR index](adr/README.md) with status + supersession chains; this roadmap.

## Folded in from `docs/todos/` (now superseded by this file)

`quality-roadmap.md` (master tracker — absorbed here) · `doc-and-state-cleanup.md` (engine-arch drift — done in the refocus) · `rubric-recharter.md` (done) · `pack-wiring-cleanup.md` (→ shipped) · `lower-third-aesthetic.md` (closed; → edge-treatment primitive) · `research-paper-attention-revise.md` (closed; one item carried into corpus task) · `fixer-sub-agent.md` (→ deferred above). History is in git.
