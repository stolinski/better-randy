# Supers roadmap

The **single backlog**. One entry per thing we want but don't yet have, with a status. This is where "designed but not built" lives — so it stops scattering across `todos/`, `ideas/`, and ADRs.

**The three tiers (where a thing lives by maturity):**

- **[`adr/`](adr/)** — a decision that is _true now_. The why behind current state.
- **`roadmap.md`** (this file) — _designed or wanted, but not built_. The backlog.
- **[`ideas/`](ideas/)** — _not yet designed_. Pure speculation.

An idea graduates: `ideas → roadmap → (built) → adr`.

**Status legend:** 🔨 building · 📐 designed (spec/ADR exists, no code) · 🧭 wanted (north-star direction, not yet specced) · ✅ shipped (recent, for context).

**Grain — this file vs dex.** This file holds **epics + direction** (coarse, rarely-changing, the _why_). The granular, stateful breakdown — per-task steps, what's in progress, dependencies — lives in **dex** (`.dex/`; run `dex list`). **dex is the source of truth for task state; this file is the strategic map.** Don't grow task-granular checklists here — that's exactly how the old `quality-roadmap.md` rotted into a tracker we had to delete.

Aligned to the north star (see [`../AGENTS.md`](../AGENTS.md)): an opinionated, Netflix-grade, multi-pack motion-graphics engine producing overlays + segments/bumpers, reflowing across horizontal/vertical, authored with full GUI ↔ agent parity.

## How this gets executed (the loop)

The default answer to "what's next?" — an agent self-serves this instead of asking the human to adjudicate every time:

1. **Pick:** `dex list --ready` → take the highest-priority unblocked task in the current epic.
2. **Do it, then close it:** `dex complete <id> --result "<what changed + how verified>" --commit <sha>`; re-run `dex list --ready` and continue.
3. **Within an epic, work autonomously** — no check-in task to task.
4. **At the end of each epic, STOP and check in with the human** — summarize what the epic delivered + anything learned, and get a go-ahead _before_ starting the next epic. **This is the leash: epic-by-epic, not fully autonomous.**
5. **Also stop mid-epic and ask** before: removing any pipeline/feature (the prove-or-remove epic), resolving a design fork (a 0006-style tension), starting an undesigned arc, or when a task's intent is ambiguous against the docs/code.
6. **Critical path:** the engine arc is done and the corpus is delivered (one Critic-ACCEPTed deliverable per family). The remaining critical path is **GUI ↔ agent parity** — now grilled into a spec ([ADR-0032](adr/0032-gui-agent-parity-authoring.md)) and task-ified in dex (epic `3pkmqyns`); gated on a go-ahead at the corpus epic boundary.
7. **Activating a roadmap arc** = break its epic into dex tasks. **GUI parity needed a design grill first** — done (2026-06, [ADR-0032](adr/0032-gui-agent-parity-authoring.md)); the epic now exists in dex. The corpus is demand-pulled: author one ship-grade deliverable per family through the Critic loop as the engine supports it.

**Aligned with the goals** = engine arc done ✅ **+** ≥1 ship-grade deliverable per surface/overlay family **+** the GUI reaches agent-parity. The arcs below are the scoreboard.

### Starting / finishing a session

**A clean agent starts with one instruction** (the same every time): _"Read `AGENTS.md` and `docs/roadmap.md` § How this gets executed, run `dex list --ready`, and start the top task; check in with me at each epic boundary."_ `AGENTS.md` (auto-loaded) carries the north star + rules; **dex + git carry all state** — so the agent resumes from where dex says, not from the operator's memory. A brand-new agent and a returning one get the identical kickoff.

**At each epic boundary the agent stops and reports:** what the epic delivered, how it was verified, the commit SHA(s), anything it learned that changes the plan, and any decision it needs — then waits for a go-ahead before the next epic. Each finished task must already be `dex complete`d with a `--result` + `--commit`, code committed, and any in-progress task's description updated — so the next session is resumable by a _different_ clean agent.

---

## Now — the corpus tail; GUI parity designed

The engine gap is closed, the make-cinematic push is **done across every surface/overlay family**, and the web-document arc (incl. iMessage) has shipped. The north-star scoreboard is met: **GUI ↔ agent parity shipped** ([ADR-0032](adr/0032-gui-agent-parity-authoring.md), epic `3pkmqyns`) and the **GUI authoring interface shipped** ([ADR-0034](adr/0034-gui-design-authoring-interface.md), epics `jz2yykvi` + `wfonjyb3`, 2026-07-01). What remains:

- a small **corpus refinement tail** — active, epic `ri2qchcm`;
- **Sound design** — ✅ **shipped** ([ADR-0033](adr/0033-sound-design-motion-emitted-cues.md), epic `1frpmv40` complete; amended 2026-07-02 to the final by-ear-approved model — engine defaults per motion kind + per-cue overrides, kit concept removed);
- **the capability arc** — the post-north-star direction, grilled 2026-07-01 (§ below).

**Cinematic-bar recalibration → resolved (2026-06).** A 12-agent cinematic audit (`docs/critic-captures/corpus-cinematic-audit.md`) scored every family **2–5/10** against a Netflix bar — _competent but not cinematic_ — and set the honest bar plus the reusable recipe. That diagnostic drove a family-by-family make-cinematic pass: **all 13 families are now Critic-ACCEPTed** (zero pipeline-bug / default-too-permissive) at the cinematic bar, each with a graded backdrop, felt camera, parallax, and reading-order motion. `pullquote-on-photo` shipped on the ADR-0028 depth stage (real photographic substrate), so it is **no longer blocked**.

**The recipe** (proven on chapter-card, applied corpus-wide): off-center staging · filmic grade + toe · eased felt camera · two-octave fBm parallax · GPU-fade outro · reading-order entrances.

**Reference deliverables:** `lower-third-cinematic` (overlay reference), `server-renders-again` (editorial-mono gate), and `chapter-card-cinematic` (surface reference) are the bar the rest were driven to.

**The remaining corpus tail** (dex epic `ri2qchcm`): opaque-piece Critic probe (`9w7kdptf`), washi-tape fibrous tear-edge (`ukc5ip66`), paper-grain on near-black fields (`3ohrvtc4`), and the heavy image-substrate + edge-treatment primitive (`jhxe2k5w`, in progress — its substrate half already shipped `pullquote-on-photo`; the edge-treatment half is open).

**dex is the source of truth for per-family task state** (run `dex list --ready`).

## The capability arc (grilled 2026-07-01)

With the north star met, the next arc is **capability expansion** — chosen over production dogfooding and content-scale tooling (those pull later). Epic order:

1. **Generalized keyframes** — ✅ **shipped** ([ADR-0035](adr/0035-generalized-keyframes-and-cascade.md); dex epic `4i8gx2i7` complete 2026-07-02): schema (`keyframes[]` + per-property ease + Cascade + static rotation), cascade-resolving manifest builder + channel-owned OverlayMount path, welded sound cues, timeline diamonds + tethers, DaVinci-style inspector keyframe rows (playhead value + prev/◆/next), envelope-aware linter, and the Critic-ACCEPTed reference deliverable `lower-third-cascade-reveal`. Absorbed `5vcak6og` (overlay rotation).
2. **Depth-stage expansion** — ✅ **shipped** (dex epic `jhmh8ax7` complete 2026-07-02): overlay-at-depth (overlays on their own 3D plane at their ADR-0021 z — parallax, per-depth defocus, painter's-order occlusion), scene lighting/shadow (the Pack `light-treatment` Role as a real key light — `resolveLightTreatment`, per-plane rake + plane-to-plane cast shadow), half-res 4K DOF (32→~44 fps preview, in-focus text native-crisp), and the showcase set (`chapter-card-descent` / `title-sequence-signal` / `type-hero-vantage`, each Critic-ACCEPTed). The Critic loop drove 8 engine corrections into the stage's DOF/compositing (ADR-0028 status note) plus one engine-wide fix: text-animation fades now reach pixels (colour-alpha unit fades — the capture quantizes property-opacity on transformed spans). Follow-ups: dex `8ged0rsd` (Critic probe/harness gaps).
3. **Diagram primitives** — **designed** ([ADR-0036](adr/0036-diagram-primitives.md), grilled 2026-07); implementation after keyframes + Cascade land (Cascade is the reveal grammar). Dex epic `phd3zd26`.

**Packs — finish [ADR-0024](adr/0024-role-resolution-core-fallback.md)** runs as a parallel, largely agent-grindable arc (not an epic slot): purge every literal hex fallback from component CSS (`var(--x, #hex)` — specific → core is the only legal fallback; this is the washi-tape-stays-yellow class of bug), make the Pack validator refuse a manifest missing the mandatory core vocabulary, and give `editorial-mono` real core values. Then author the **CRT terminal pack** — the third Pack, chosen to stress the roles a color-swap never touched. **Aesthetic designed (grilled 2026-07-01): [`docs/packs/crt-terminal/aesthetic.md`](packs/crt-terminal/aesthetic.md)** — 80s green-phosphor terminal, emissive not reflective: depth = glow (never shadow), edges = hard pixels, grain = scanline, pointer = block cursor, one hue at several intensities, modern mono type (no bitmap kitsch), per-element screen physics on transparent overlays / full-frame chrome only on opaque pieces, no curvature ever. (Grill note 2026-07-01: "complete per-Pipeline manifests" was considered and rejected again — 0024's hybrid stands; the failure was unfinished wiring, not the design.) Pack switching only reaches pixels at all as of 2026-07-01 — the composition-sync effect never tracked `packState.slug`, so the captured texture went stale; fixed in `Workspace.svelte`.

**Integration demos (corpus v2)** — the corpus proved families in isolation; these prove them together. Each gates on its epic:

- **Show-open bumper** (flagship): a full-frame segment — depth stage + transitions + sound bed + Cascade choreography, 5–10 s.
- **Episode graphics suite**: one topic as a coordinated set (title card + lower third + pullquote + counter + outro), one pack, consistent choreography.
- **Depth-stage showcase set**: ✅ shipped 2026-07-02 — `chapter-card-descent`, `title-sequence-signal`, `type-hero-vantage`, each Critic-ACCEPTed on the completed stage.
- **CRT-pack corpus rerender**: the corpus under the CRT pack — the "same recipe, two publications" money shot and the acceptance test for the finished pack contract.
- **Docu-diagram demos**: high-end YouTube-documentary diagram pieces (animated map, flowchart, timeline, stat build) on the Diagram primitives.

Riding along, small and approved: **export decode verification** (~1 day) — decode the actual exported file (ffmpeg is already server-side in the ProRes route) and feed the frames to `probe-frame-diff`; use ProRes for byte-determinism.

## The pack catalog (grilled 2026-07-10 — the product frame)

**Supers is a product shipped to creators.** Visual Packs are how a creator gets their brand over one engine; **the catalog is the offer** — enough genuinely-distinct house packs that most creators pick one off the shelf. Custom packs are concierge-authored on request from whatever brand material exists (a brand doc, CSS, or a website) and ship in the one shared app bundle — every pack visible to every user. **V1 decisions (no v2 promises): no runtime pack loading, no per-customer builds, no licensing gates.** The old "production dogfooding = a whole Syntax episode" framing is retired — Supers is used _in_ Syntax videos (first-party pack) but the audience is creators broadly.

**Catalog quality gate (the half-assing firewall):** a pack enters the catalog only with a Scott-ratified **Calibration Trio** (the same three reference compositions re-dressed under the pack, iterated live), on top of the boot core-vocabulary validator and the two-Pack pixel-diff lock. **One pack at a time** — the next starts only after the last is ratified. Every authoring session follows [`docs/packs/authoring-playbook.md`](packs/authoring-playbook.md). Direction, not deadline: candidate archetypes beyond the current four (Syntax / Editorial Mono / CRT Terminal / **Clean Light** — ratified 2026-07-13, the first light-field pack) — bold condensed hype, soft pastel friendly, brutalist mono, elegant serif editorial. Dex epic `pack-catalog-v1` complete; presets themselves are bound by [ADR-0039](adr/0039-pack-neutral-compositions-and-listing-hygiene.md) (pack-neutral compositions, no pack/orientation duplicate listings — implementation epic `hkajpcgg`).

## The quality arc (grilled 2026-07-08)

Revisiting "what pulls after the capability arc" (`ku0gh0mc`), the answer was **none of the three deferred pulls yet** — production dogfooding, content-scale tooling, and Electron all wait, because **the output isn't good enough**. A 7-piece visual audit (2026-07-08) confirmed it: quality is **uneven** — `web-document-twitter` and the depth-heroes (`type-hero-vantage`) land, but the references read as a generic house look, the **diagram pieces look like unfinished wireframes** (`docu-timeline-build`: a thin rule floating in an empty frame), the "real photo" substrate is blurred to an invisible gradient (`pullquote-on-photo`), washi edges are flat, and demo bodies are greeked placeholder. Variety today comes from **switching packs/registers, not from range inside a pack** — every Syntax piece is the same dark-minimal-amber look.

**Verification model.** The automated Critic gates _technical_ defects (R-rules: sharpness, contrast, banding) but **cannot judge aesthetic finish** — it ACCEPTed the wireframe-y diagram and the invisible-photo pullquote as Deliverables. So: **the human (Scott, in the GUI) is the aesthetic critic now**, and a **finish-judging Critic** (vision-model / reference-image comparison) runs as a **separate, non-gating research track**. Both in sequence — quality work is not blocked on the AI-judgment research.

**Three workstreams** (dex epic `vgi2krdc`):

1. ✅ **Calibrate the bar — with Scott** (complete 2026-07-09, task `7sshp8rj`). Three ratified references — `docu-timeline-build`, the lower-third **Syntax house card**, `type-hero-vantage` flat-graphic — and the ruling that reframed everything: **the brand source of truth is [`github.com/randyrektor/syntax-overlay`](https://github.com/randyrektor/syntax-overlay)** (aesthetic doc rewritten). The playbook for workstream 2: flat warm-black fields, the card system (chrome proportioned to the card), one `#ffd54a` gesture, Space Grotesk/Space Mono at true cuts, real content, decisive ~180ms physical sound hits, no atmosphere/gloss/lens grammar; substrate ≠ chrome. Key lesson: _brand tokens ≠ brand grammar_ — re-dressing means rebuilding the composition's language, not repainting it.
2. **Propagate + fix systemically.** Kill within-pack sameness (range/variety inside a pack, or more packs), rebuild the weak registers (diagrams), and fix the wasted features: invisible photo-substrate, flat washi edge (`ukc5ip66`), and greeked placeholder → **real content** throughout.
3. **Finish-Critic research** (parallel, non-gating) — prototype the aesthetic judge (vision-model / reference-image comparison).

**Running principle:** _real content over synthetic filler._ Half of what makes the demos read as demos is lorem bodies and fake data — real tweets, real Syntax topics, real quotes (also chips at "not enough real-world demos").

## The corpus

- ✅ **One Critic-accepted deliverable per surface/overlay family — delivered (2026-06).** Every family passes the Critic (zero pipeline-bug / default-too-permissive) at the cinematic bar, via dex epic `ri2qchcm`:
  - **T1 — full-frame title surfaces** (depth-stage candidates): `chapter-card`, `title-sequence`, `type-hero`.
  - **T2 — document surfaces** (flat path, A+ text): `newspaper`, `paper`.
  - **T3 — overlays** (flat, transparent, over footage): `washi-tape`, `watermark`, `counter`, `cursor-trail`, `instance-stack`, `shader-fill`, `text-3d`.
  - **`pullquote-on-photo`** — shipped on the ADR-0028 depth stage (photographic substrate); not blocked.
  - Open: a refinement tail only (opaque probe + washi tear-edge + paper-grain + edge-treatment primitive — see **Now**).
- 📐 **Make lower-third appearance-neutral.** Move "collage card" chrome out of the overlay into the Syntax pack (ADR-0006 → 0023). Overlay content is `kicker` + `title` + `subtitle`.

## The web-document arc

A **web-document Surface** — pixel-faithful mocks of real sites used as transparent-overlay substrate, with highlight Annotations drawn over real-looking site UI (the "as seen on X" reference shot). Authoring-time `scripts/url-to-preset.mjs` turns a URL into a preset.

- ✅ **v1 shipped (2026-06).** Surface skeleton + schema + emissive-screen Identity Spec (shaderPass); 5 site mocks — Twitter/Reddit/Wikipedia/Hacker News/GitHub — H + vertical presets, highlight Annotation over a hero span, URL→preset scraper. (dex epic `dj3nyv17`, [ADR-0030](adr/0030-web-document-emissive-surface.md).)
- ✅ **Expansion shipped (2026-06)** (dex epic `peo8i346`). YouTube + news-article mocks behind `surface.site`, plus **iMessage** — the first **interactive / choreographed Surface** ([ADR-0031](adr/0031-imessage-interactive-surface.md)): its own `type`, an ordered `content.messages[]`, and a frame-deterministic show (bubbles pop in, typing indicator → reply, tapback, Delivered→Read) where the _motion_ is the deliverable, not a screenshot.

## Pipeline coverage decisions

- ✅ **The 4 dead-by-use pipelines — proven, kept.** `isolate`, `watermark`, `shader-fill`, `chromatic-aberration` each got a proving fixture (`*-demo`); every registered pipeline is now referenced by ≥1 preset.
- ✅ **camera motion stripped.** `surface.camera` (`push`/`snap`) was inert (no pipeline read it); field, UI control, and lint rule removed together.
- ✅ **cursor-trail pointer Pack-resolved.** The 4 pointer SVG paths now read from a `cursor-trail.pointer` Role (ADR-0023).

## Designed, not built (specs exist, no code)

- 📐 **Z-depth / depth-of-field** — [ADR-0021](adr/0021-z-plane-semantics.md). Focal-distance sidecar to the color target; DOF/tilt-shift Effects read it. DOF v1 ships flat (multiplane bokeh, [ADR-0027](adr/0027-dof-v1-multiplane-bokeh.md)); no per-pixel depth target in code today.
- 📐 **Dimensional depth stage** — [ADR-0028](adr/0028-dimensional-depth-stage.md). Opt-in WebGPU 3D compositor for continuous-depth pieces: Layer textures on perspective planes at their ADR-0021 z, per-pixel depth from geometry, mip-prefiltered gather DOF, real camera (`stage.camera`) + light. **Validated end-to-end in a POC** (`src/routes/poc/dof3d/`): determinism, parallax + rack-focus motion, export==preview through Mediabunny, clean at 4K + vertical. Engine work (stage selector + schema, scene renderer on the 0026/0027 capture seam, depth+DOF passes, orientation framing, Critic checks, demo Preset) not yet broken into dex tasks. Flat multiplane (0027) stays default + backbone for text-critical pieces.
- ✅ **Multi-state transitions (v1)** — [ADR-0022](adr/0022-multi-state-composition.md) model + [ADR-0026](adr/0026-transitions-v1-snapshot-and-wipe.md) impl. Shipped: `transition: { from, to, effect, durationMs }`, snapshot each state to a texture, `mask-wipe` Effect composites a true per-pixel wipe. **Upgrade path:** live dual-tree (states animating mid-wipe) via a context-scoped engine-state refactor, when a Preset needs it.
- 📐 **Starter templates** (ex-[ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md)) — curated Preset+Pack starting points both a human (GUI) and an agent begin from. Mechanism now specified by GUI parity ([ADR-0032](adr/0032-gui-agent-parity-authoring.md)): a corpus preset opened read-only as a fork-base.
- 🧭 **Heavy primitives** — general image/video **substrate input**; a general **configurable edge-treatment** primitive (clean / soft / irregular / torn / none) driven by the pack `edge-treatment` Role (torn is one value, not a default).
- 📐 **Generalized animation model** — **designed: [ADR-0035](adr/0035-generalized-keyframes-and-cascade.md)** (2026-07-01). Ordered per-channel `keyframes[]` + per-property ease (constrained enum) + **Cascade** (ms-offset enter anchoring, topo-sorted at manifest build); keyframes **replace** the pipeline's intrinsic motion-form (composition takes the pen); `enter`/`exit` survives as lossless sugar; rubric lints the derived enter envelope. Dex epic `4i8gx2i7`; absorbs overlay-rotation task `5vcak6og`.
- 📐 **Diagram primitives** — **designed: [ADR-0036](adr/0036-diagram-primitives.md)** (2026-07). Five Blocks (node / edge-arrow / label / stat-callout / timeline-segment) on any Surface; map = demo over image substrate, not a schema type; authored routes with Pack-resolved stroke; stroke-draw + Cascade reveals; demo set = map · flowchart · stat build · timeline. Dex epic `phd3zd26` (after ADR-0035). `code` / `image` Blocks remain wanted separately (only `paragraph` ships).

## GUI ↔ agent parity (north-star surface — ✅ shipped, [ADR-0032](adr/0032-gui-agent-parity-authoring.md))

✅ **Shipped (2026-07)** — epics `3pkmqyns` (local round-trip authoring), `y8bsqobp` (schema↔inspector gap closure), and `wfonjyb3` (design-completeness pass) are all complete. The GUI two-way-binds the full editable `engineState` with forking + autosave persistence; every schema field has an inspector editor. What remains are the deferred own-arcs below, not the core parity.

- ✅ **GUI as a full authoring tool**, co-equal with agents over one composition model. Reframed by the 2026-06 grill: the GUI already two-way-binds a full editable `engineState`, so the pieces built were **persistence** (a transport-agnostic save port, Electron-ready) and **coverage** (transport / stage / pack / structure) — _not_ a net-new app.
- **Model:** corpus presets are **read-only Starter templates**; the first param change **forks** a **User composition** to a user-writable store and autosaves; **revert** discards the fork. **Lossless round-trip** (preserve loaded Preset, patch only the GUI-owned subtree, gated by a byte-identical round-trip test) makes save safe with partial coverage and widens incrementally. Scope is single-user/local, architected to ship as an Electron app later. Glossary: **User composition**, **Corpus vs user store** in [`CONTEXT.md`](CONTEXT.md).
- **Deferred (own arcs):** verification parity (linter/Critic over GUI-authored comps), create-from-blank (fast-follow), the multi-user / product-document model.

## GUI design — the authoring interface ([ADR-0034](adr/0034-gui-design-authoring-interface.md))

The _interface_ over the GUI-parity data model. **Designed (2026-06, [ADR-0034](adr/0034-gui-design-authoring-interface.md)) — interaction model + visual design; task-ified in dex epic `jz2yykvi`.**

- 🔨 **Interaction model** ([ADR-0034](adr/0034-gui-design-authoring-interface.md)): **hybrid** manipulation (the inspector is the complete surface; the canvas does position + scale, two-way-bound); **the timeline IS the layer outline** (outline gutter + track area, every Layer a row); selection = click a row → Layer inspector, click off → root inspector (transport / Pack / Effects); per-type inspectors + progressive disclosure; the per-Layer **Sound-kit** picker lives in the Layer inspector.
- 🔨 **Visual design** ([ADR-0034](adr/0034-gui-design-authoring-interface.md) §7): three zones — **inspector right · timeline-outline full-width bottom · canvas center**; **dark, neutral, recessive** chrome on Graffiti tokens (the canvas is the only light); transparent overlays on a **checkerboard + optional reference-footage backdrop**; an **H↔V orientation toggle**; fit + zoom. Built by the styling task (`uno1jth1`).

## Sound design (new domain — built, [ADR-0033](adr/0033-sound-design-motion-emitted-cues.md))

Grilled into a spec (2026-06). Overturns the old `ideas/` "audio stays out — Resolve's job" lean **for the cues case**; in-app mixing stays out.

- 🔨 **Sound design — motion-emitted cues + swappable Sound kit** ([ADR-0033](adr/0033-sound-design-motion-emitted-cues.md)). The sound **rides the animation**: a motion primitive emits a semantic **sound event** (`whoosh-in`, `impact`, `tick`) at its own frame, intrinsic to the motion — so it's automatic (no hand-placing whooshes) and stays welded through re-time/reflow. A **Sound kit** — assigned **per Layer** (ADR-0024 resolution) — resolves that Layer's events → samples ("choose a sound style" per Layer; no whole-piece pack; a Layer with no kit is silent). Automatic cues are _derived_ from motion (not stored); `audioCues[]` holds only manual cues + the optional **bed** (segments/bumpers only). **Determinism:** export is a deterministic offline mix muxed via Mediabunny `addAudioTrack`; preview is real-time playback-only, scrub silent. **Not a 6th Layer** (peer to `textAnimations[]` / `marks.timings[]`). **Includes its GUI surface** — a timeline audio-cue rail + a sidebar Sound section (kit picker / per-motion overrides / manual cue + bed authoring), extending the existing ControlPanel + timeline like ADR-0011's Text Motion section (no dependency on the GUI-design grill). Glossary: **Sound event**, **Sound kit**, **Audio cue**, **Bed** in [`CONTEXT.md`](CONTEXT.md). Task-ified in dex epic `1frpmv40` (10 tasks: engine spine + GUI). **Shipped 2026-07-01, epic complete** — schema (`audioCues[]`, per-Layer `soundKit`, per-motion `sound` override), derived emission (`sound-cues.ts`), kit registry/resolver + deterministic core WAVs (`gen-core-sounds.mjs`), offline mix (`audio-mix.ts`, byte-identical across renders via fixed-order JS summing), WebM + ProRes muxing, playback-only preview (`audio-preview.ts`), the escape-hatches fixture (`/p/sound-escape-hatches`), the timeline Sound rail, the sidebar Sound section, and the first designed kit `syntax` (CC0 quick fwips, by-ear approved) on `server-renders-again` / `title-card-newspaper` (+ lower-third, chapter-card with the ambient bed). Sourcing designed tick/impact/pop samples rides future kit passes.
- **Deferred (own arcs):** an in-app mixer, scrubbable preview audio, automated sound verification (by-ear for now).

## Deferred / low-priority

- 📐 **Export-output verification (real decode)** — **promoted into the capability arc (2026-07-01, ~1 day)**. `scripts/probe-frame-diff.ts` asserts a frame sequence animates + carries alpha, but is only self-tested on captured frames (WebGPU canvas readback returns blank). The path: decode the actual exported file with ffmpeg (already server-side in the ProRes route) to PNGs and feed them to the probe; ProRes for byte-determinism.
- 🧭 **Depth-stage bit-determinism residual** — the ADR-0028 depth stage renders deterministically to ~0.002% (ProRes ×2: ~200 of 8.3M px/frame differ; the flat path is byte-identical). Scattered-pixel signature ⇒ a GPU barrier race in the scene→mip-pyramid→DOF chain (a tap reading a mip level a hair before the prior pass finished). Visually invisible; spirit of frame-determinism holds (preview==export, no wall-clock). Strict bit-determinism would need the mip chain as separate half/quarter-res textures (explicit read-after-write) rather than mip levels of one texture. NOTE: vp9/WebM export adds its own (invisible) encoder non-determinism — that's the WebCodecs hardware encoder, not the render; use ProRes for byte-exact masters.
- 🧭 **Linear-light blending** — changes composite math; risky; separate pass with heavy before/after verification (deferred from the render-path work).
- 🧭 **Fixer sub-agent** for `preset-choice`/`aesthetic-miss` Critic findings — build-harness; revisit after more Critic runs (open design question, ex-`todos/fixer-sub-agent.md`).
- 🧭 **`probe-timeline.ts`** for the G6/L4 timing rubric gap (currently no probe).
- 🧭 **Opaque-piece probe mode** (rubric-gap from the depth-stage Critic, 2026-06) — **luma auto-detection shipped** (`_probe-channel.ts`): `probe-banding`, `probe-edge-aa`, and `probe-ink-coverage` now resolve their measurement channel — auto-detecting opaque→luma (or forced with `--channel luma`), `probe-ink-coverage` measuring deviation from the field's modal luma — so R3/R4/R5/Q9 ARE measurable on opaque full-frame pieces, not only alpha-keyed overlays. Residual under `9w7kdptf`: alpha-preserving verification of the opaque _export_ rides the export-decode lane (`probe-export-decode.ts`), and any remaining per-probe `--opaque` ergonomics.
- 🧭 **Recalibrate G4 overlay cap-height bands** — sized for full-width broadcast lower-thirds; too large for a corner chip.

---

## ✅ Recently shipped (context)

- **Corpus made cinematic — every family Critic-ACCEPTed (2026-06):** the audit-driven make-cinematic pass closed. All 13 surface/overlay families (plus `pullquote-on-photo` on the depth stage) clear the Critic at the cinematic bar — graded backdrops, felt camera, parallax, reading-order motion. The recipe was proven on `chapter-card-cinematic` and applied corpus-wide. Open: a refinement tail only (see Now).
- **web-document Surface — v1 + expansion (2026-06):** faithful site-mock transparent overlays — Twitter/Reddit/Wikipedia/Hacker News/GitHub, then YouTube + news article ([ADR-0030](adr/0030-web-document-emissive-surface.md)) — highlight Annotation over a hero span + URL→preset scraper. Plus **iMessage** ([ADR-0031](adr/0031-imessage-interactive-surface.md)), the first **interactive** Surface: a frame-deterministic chat show (bubbles, typing indicator, tapback, read receipt) where the motion is the deliverable.
- **Dimensional depth stage — ADR-0028 (2026-06):** a real WebGPU 3D compositor (`state.stage`). POC-validated → integrated → Critic-accepted: `DepthStage` renderer (surface plane over a backdrop at depth, perspective camera push/drift, per-pixel-depth mip-prefiltered gather DOF), `renderAt` branch (preview + export, export==preview, deterministic to ~0.002%), orientation reflow, `depth-stage-demo` fixture. Flat multiplane (ADR-0027) stays the default. The residuals — overlay-at-depth, scene lighting/shadow, half-res 4K perf — all shipped 2026-07-02 with the depth-stage-expansion epic (see § The capability arc).
- **Two engine bugs fixed (2026-06, surfaced driving chapter-card cinematic):** (1) opacity-exit ease head-loaded fades — `getEaseGsap` now direction+property-aware (opacity exits use `.inOut`, transform exits keep `.out`). (2) `copyElementImageToTexture` can't capture CSS `opacity<1` (it's a compositing-layer promoter → captures transparent), so `style:opacity` surface fades were BINARY; fix is a GPU alpha-multiply (done for chapter-card; generalization tracked). See `docs/critic-captures/text-fade-bug-investigation.md`.
- **Corpus cinematic audit (2026-06):** 12-agent parallel critique set the honest Netflix bar (every family 2–5/10) + the reusable recipe; `chapter-card-cinematic` driven toward the surface-reference bar. See `docs/critic-captures/corpus-cinematic-audit.md`.
- **Multi-state transitions v1 (2026-06):** snapshot-and-wipe (ADR-0026). A `transition` Preset snapshots its `from`/`to` states into textures and the `mask-wipe` Effect composites a true per-pixel wipe between them; pixel-verified end-to-end. Came with a render-path hardening pass: fixed an infinite `$effect` loop that froze all rendering, then reduced Workspace render orchestration from 7 effects to a single explicit render path + one untracked authoring→canvas bridge. Also: built `scripts/cdp-capture.mjs` (drives a flag-enabled Chrome over CDP) — the first real pixel-verification harness.
- **Engine arc complete (2026-06):** structural Pack→pixel contract (rgb-channel resolver, skipped-color pass, depth/font Roles end-to-end); genuine orientation reflow (safe-areas as layout inputs, per-orientation type/motion); output background model (emergent segment/bumper lane via `backgroundFill`); camera motion stripped; cursor-trail pointer Pack-resolved; 4 dead pipelines proven; code hygiene (double-casts converged, dead accessors removed).
- **`server-renders-again`** — editorial-mono acceptance gate; proves multi-pack is live end-to-end.
- **The engine substrate:** one preset engine (5 Layers + registry), WebGPU/TypeGPU compositor, WICG HTML-in-Canvas capture, transparent 4K export, frame-determinism, 16-bit-float + dither render path, a substantive safety linter, a probe-backed adversarial Critic.
- **Pack color + font contract** end-to-end (CSS-var injection on mounts); 2 packs (`syntax`, `editorial-mono`); `verify-presets` gate green + enforced; demo presets quarantined as fixtures (`kind` field).
- **`lower-third-cinematic`** — first Critic-grade, ship-grade deliverable (the reference bar).
- **Doc refocus (2026-06)** — north star in [`../AGENTS.md`](../AGENTS.md); current-state [blueprint](engine-architecture.md); [ADR index](adr/README.md) with status + supersession chains; this roadmap.

## Folded in from `docs/todos/` (now superseded by this file)

`quality-roadmap.md` (master tracker — absorbed here) · `doc-and-state-cleanup.md` (engine-arch drift — done in the refocus) · `rubric-recharter.md` (done) · `pack-wiring-cleanup.md` (→ shipped) · `lower-third-aesthetic.md` (closed; → edge-treatment primitive) · `research-paper-attention-revise.md` (closed; one item carried into corpus task) · `fixer-sub-agent.md` (→ deferred above). History is in git.
