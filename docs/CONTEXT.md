# Hiviz Context

The shared language for Hiviz's preset engine, channel aesthetic, and agent workflow. Every doc and agent in this repo should use these terms with these meanings.

## Language

### Composition model

**Preset**:
A JSON document declaring a **composition recipe** — motion, content, and role references — against the `hiviz@1` schema. A Preset is *aesthetic-agnostic*: it names which surface, which marks, which timings, which text, and which **Roles** the engine should resolve. It does **not** carry hex codes, font names, edge behavior, or effect chains directly — those live in the **Pack** the Preset names. The unit of authoring.
_Avoid_: tool, scene, template (when referring to a finished composition).

**Recipe**:
A starter scaffold preset stored under `docs/recipes/`, one per surface variant. An agent copies a recipe and varies it; it is not itself a deliverable.
_Avoid_: template, starter, boilerplate.

**Layer**:
One of the five composition layers — **Surface**, **Block**, **Annotation**, **Overlay**, **Effect**. Render order and registry membership are defined by which layer a renderer belongs to.
_Avoid_: tier, level, stage (in the composition context).

**Surface**:
The renderable material claim of a composition (`pullquote-on-photo`, `newspaper-clipping`, `modern-web-article`, `photographed-frame`, `collage-card`). The bottommost layer.
_Avoid_: background, base, canvas (the canvas is the WebGPU target, not the surface).

**Substrate**:
The underlying material a surface depicts — paper, photo, web document. A **Surface** is the renderer; the **Substrate** is the material it claims to be.
_Avoid_: surface (those are distinct), background.

**Block**:
A discrete content unit rendered on a Surface (title, body, image, kicker). One Surface carries multiple Blocks.
_Avoid_: component, region, element.

**Annotation**:
A mark layered on a Block. Includes hand-claiming marks (highlight, underline, circle, strike) and reference marks. Hand-claiming Annotations carry Q6 deterministic imperfection.
_Avoid_: mark (which is the narrower hand-claiming subset), decoration.

**Mark**:
A hand-tool-claiming Annotation — highlighter, marker, circle, strike, scribble. Every Mark is an Annotation; not every Annotation is a Mark.
_Avoid_: annotation (broader), stroke (which is the geometry, not the role).

**Overlay**:
A renderable element layered over the composition that isn't bound to a Block — lower third, kicker chip, source URL plate, watermark.
_Avoid_: chrome (broader; see Channel chrome).

**Effect**:
A composition-wide post-process pass run after the final composite into the canvas — grit overlay, chromatic aberration, color grade, film grain. Effects compose into one chain on the composed frame. Per-target shader work (substrate physics, per-overlay edge treatment) is not an Effect — it is a `shaderPass` on the SurfaceRenderer or OverlayRenderer per ADR-0005 / ADR-0008. See [ADR-0018](adr/0018-collapse-effects-to-frame-only.md).
_Avoid_: filter, shader (a shader is the WebGPU implementation; an Effect is the registry entry), per-layer effect (the engine no longer supports per-layer chains — see ADR-0018).

### Pack model

**Pack**:
A swappable **appearance** dress resolved at render time. One Pack folder lives at `docs/packs/<slug>/` and contains `aesthetic.md`, `inspo/`, and a machine-readable manifest resolving the engine's **Roles** to concrete appearance values — color (fill, ink), edge treatment, depth treatment, light, font, material, and assets. A Pack carries **appearance only**; it carries **no motion** (form, timing, and easing live entirely in the **Preset** and **Pipeline**). A Preset declares exactly one Pack as its default; the runtime may override the active Pack so the same Preset can render under any Pack ("render preset X under pack Y"). There is **no privileged default Pack** — `syntax` is one Pack among N, not a fallback. The engine is general-purpose and supports N Packs.
_Avoid_: theme, skin, style (under-specified), aesthetic doc (the doc is one artifact inside a Pack), motion pack (Packs never carry motion).

**Role**:
A named appearance slot a **Pipeline** declares (in its **Identity Spec** `viaPack` clause) and the active **Pack** resolves to a concrete value. Resolution is **two-level, with fallback** (like `var(--specific, var(--core))`): a Pipeline names a specific Role (`chapter-card.fill`); the resolver returns the Pack's value for it if present, else falls back to the **core Role** of the same dimension (`fill-treatment`). The engine pins the core Role vocabulary every Pack must implement (`fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`, plus font/material/asset cores); per-Pipeline Roles are **optional overrides** a Pack supplies only where it wants that Pipeline to diverge. Roles are appearance-only — there are no motion Roles.
_Avoid_: token (collides with design-token systems), variable, slot (overloaded with Focal slot), motion role (Roles never carry motion).

**Identity Spec**:
A per-Pipeline declaration of the **dimensions of identity** the Pipeline owes when it claims to render *something*. Every visible Pipeline (Surface, Block, Annotation, Overlay) ships one. An Identity Spec has a `kind`, a one-line `claim`, and an explicit list of `dimensions`. Each dimension has (a) a one-sentence operational definition, (b) a Pipeline-side implementation contract, and (c) a Critic-side probe (script or named-observation). A Pipeline whose Identity Spec ships with any dimension unimplemented, or any dimension without a probe, is rejected *at Pipeline registration time* — the engine refuses to expose a renderer that would collapse to a defaulted, div-shaped approximation of its claim. Lives at `src/lib/pipelines/<layer>/<variant>/identity.ts` alongside the Pipeline.

Three `kind`s exist:

- **material** — the Pipeline claims to be a material (paper, photo, web doc, photographed frame). Dimensions are physical/optical (grain-multi-scale, ink-bleed-at-edges, edge-occlusion-shadow, optical-misregistration, camera-defocus-budget). Subsumes the previous *Material Physics Spec* concept.
- **graphic** — the Pipeline claims to be a piece of designed motion graphics (lower-third chip, kicker plate, watermark, source URL plate). Dimensions are formal: the appearance ones (fill-treatment, edge-treatment, depth-treatment, light-treatment) are declared `viaPack` (a **Role**); the motion ones (motion-form, frame-relationship) are **intrinsic** (`implementation`, owned by the Pipeline — motion never concedes to a Pack). Required because the appearance defaults stacked together is the structural definition of "animated div."
- **tool** — the Pipeline claims to be a hand tool acting on a surface (highlighter, marker, circle, strike). Dimensions are tool-physics (stroke-pressure-variation, end-cap-behavior, opacity-along-path, overshoot-budget, saturation-curve, registration-offset).

_Avoid_: material spec (the narrower predecessor; now the `material` kind), identity rubric (the Spec is per-Pipeline data, not a global rubric), realism checklist.

### Pack-scoped vocabulary (Syntax pack)

These terms historically lived in the core glossary; they are vocabulary **of the Syntax Pack**, not of the engine, and will move into `docs/packs/syntax/aesthetic.md` once the Pack folder lands. They are listed here only so the glossary remains usable while the migration is in flight.

**Channel chrome**:
The Syntax Pack's signature elements that distinguish its output from generic motion graphics — at minimum a **Mono signature thread**, grit overlay, hard offset shadow on Collage cards. Defined in `docs/aesthetic.md` (will move to `docs/packs/syntax/aesthetic.md`).

**Mono signature thread**:
At least one mono-typeface element per composition (kicker, source URL, date stamp, watermark). The channel's identity stamp.
_Avoid_: mono label (one specific use), watermark (one specific use).

**Collage card**:
A torn-paper element layered on a Substrate with channel chrome (hard offset shadow, mono label, torn edge). The distinguishing channel layer.

**Hard offset shadow**:
A solid-color, no-blur, 8–15 px-offset shadow on Collage cards. Reads as risograph / screen-print. Distinct from the Q16 multi-zone photographic shadow on underlying surfaces.

**Registration jitter**:
Deterministic 1–3 px offset between layers (typically saturated marks vs. underlying ink). Simulates risograph misalignment. Required to be seeded, not random at render time.

**Focal slot**:
A content slot in the composition designed for emphasis — the active word in a brightness-reveal, the magnified phrase in a quote-magnify. Only one Focal slot is the hero per beat (Q10).

### Engine internals

**Pipeline**:
A registered renderer for one Layer type and one variant — e.g. the `pullquote-on-photo` Surface pipeline, the `highlight` Annotation pipeline. Each pipeline owns its TypeGPU bind groups, WGSL, and uniform layout.
_Avoid_: backend, driver, plugin.

**Registry**:
The catalog of available Pipelines that Presets compose from, organized by Layer (`src/lib/platform/pipelines/{surfaces,blocks,annotations,overlays,effects}/`).

**Timeline**:
The single `Timeline` instance per Preset that owns playback state (`time`, `isPlaying`, `durationSeconds`, `fps`). Animation is scrubbed by progress, never played by wall-clock.

**Track**:
A horizontal lane in the **Timeline** UI representing a timed segment with `start`, `duration`, and an `onUpdate` callback. A Mark, Overlay, or Focal slot is typically backed by a Track.

**TextAnimation**:
A choreographed motion applied to a single text slot (`surface.content.title`, `body`, `kicker`, `sourceUrl`, `dateLabel`, `author`, `source`, or a `lower-third` overlay's `title` / `kicker` / `subtitle`). Declared as an entry in `state.textAnimations[]`, peer to `marks.timings[]`. The orchestration domain is not a Layer — it does not render — it choreographs the DOM the HTML-in-Canvas path captures. See [ADR-0011](adr/0011-text-animation-orchestration.md).
_Avoid_: text effect (collides with **Effect (text)** below), text mark (collides with **Mark**).

**Effect (text)**:
One entry in the 24-effect catalog vendored from `pixel-point/animate-text` (e.g. `soft-blur-in`, `kinetic-center-build`, `fade-through`, `typewriter`). Identified by `effect` on a **TextAnimation** entry. Disjoint from the per-layer post-process **Effect** Layer — same word, different concept. Where ambiguous, write _text effect_ or _post-process Effect_.
_Avoid_: text animation (broader; an Effect is a catalog id, an animation is the configured instance).

**Split mode**:
The unit a text effect operates on — `whole`, `per-character`, `per-word`, or `per-line`. Declared by the effect's catalog entry, not by the **TextAnimation**. Parse-time rule: `per-character` and layout-aware renderers accept title-scale slots only; `whole` / `per-word` / `per-line` accept every text slot.
_Avoid_: split granularity, target mode.

**Renderer family**:
One of four algorithms underneath the 24 catalog effects: `generic-stagger` (covers 21 effects via per-effect keyframe endpoints), `kinetic-center-build`, `kinetic-top-build`, `shared-slide-opacity-stage`. Identified by `effect.showcase.renderer.id` in the catalog. Each family has a dedicated strategy file under `src/lib/text-animations/strategies/`.
_Avoid_: renderer kind, animator (which collides with the AnimationManager).

### Workflow roles

**Brief**:
A markdown document under `docs/briefs/<slug>.md` defining a not-yet-shipped **Preset**, **Pipeline**, or content domain. One Brief per in-flight idea; no separate backlog. The **Producer** authors from a Brief. The **Critic** never reads it. The Brief is deleted when its target Preset (or, for non-Preset Briefs, its declared verification Preset) returns the Critic's `ACCEPT`. See [ADR-0007](adr/0007-brainstorm-brief-system.md) and `docs/briefs/README.md`.
_Avoid_: proposal, plan, sketch, spec, draft.

**Producer**:
A sub-agent spawned with fresh context to author a Preset (or the engine work + Preset declared by a pipeline / domain Brief). Reads the Brief plus the binding docs; does not see the brainstorm conversation. Never the same invocation as the **Brainstorm** or **Critic** agent.

**Brainstorm**:
The agent that grills the user through a Brief and writes `docs/briefs/<slug>.md`. Actively proposes options from `docs/aesthetic.md` and the existing Registry rather than just capturing user input. Invoked via `/brainstorm <slug>`. Hands off to the **Producer** (via `/author <slug>`), not to authoring directly.

**Critic**:
A sub-agent spawned with fresh context to adversarially verify a Producer's output. Sees only the Preset + renders + rubrics; never the Brief, never the brainstorm conversation, never the Producer's session. See [ADR-0001](adr/0001-critic-sub-agent-verification.md) and `docs/critic.md`.

**Probe**:
A script under `scripts/probe-*.ts` that reads a captured screenshot and returns numeric measurements (banding, dimensions, hue count). Probes exist so the Critic can quote unfakeable numbers for rules with a measurable form.

### Rubric tiers

There are two distinct layers, often confused. The **rubric tiers** (R/Q/G) are human-readable rules judged *by eye* by the **Critic** against rendered pixels (R and Q require pixels; some G are measurable via Probes). The **Preset linter** is a separate code gate that checks only the JSON-computable slice *before* rendering. Per [ADR-0025](adr/0025-static-linter-checks-safety-and-readability-only.md), the linter owns objective video-safety + readability; the rubric tiers own everything that needs an eye.

**Preset linter**:
The static code gate at `src/lib/platform/preset-rubric.ts` (run by `scripts/verify-presets.ts` as `lintPreset`). Checks only what is computable from the Preset JSON plus frame size — **objective video-safety and readability, orientation-aware** (read-window, title/action-safe margins, minimum legible size, frame-fit / no bleed, line measure, contrast). Hard-errors on those; carries **no motion or aesthetic taste** (that is the Critic's). See [ADR-0025](adr/0025-static-linter-checks-safety-and-readability-only.md).
_Avoid_: rubric (the linter is not the R/Q/G rubric tiers), validator (that is schema parsing).

**R-rule**:
A render-quality rule from `docs/quality-rubric.md` (R1–R8). Non-negotiable; a failing R-rule means a pipeline bug to fix, not a Preset to tune. Critic-judged against pixels — not in the **Preset linter**.

**Q-rule**:
A composition-craft rule from `docs/quality-rubric.md` (Q1–Q18). Aesthetic-neutral; evaluated only after every R-rule passes.

**G-rule**:
A general animation rule from `docs/animation-rubric.md` (G1–G12, plus per-overlay rules). Governs how the composition moves over time.

**R-protocol**:
The named-observation format every R-rule check must follow — pixel coordinate, saved screenshot path, and (for measurable rules) numeric Probe output. Prevents prose-only rubber-stamping.

## Relationships

- A **Preset** declares one **Surface**, one or more **Blocks** on that Surface, zero or more **Annotations** per Block, zero or more **Overlays** over the composition, and zero or more **Effects** per Layer.
- Every **Mark** is an **Annotation**; not every **Annotation** is a **Mark**.
- A **Pipeline** belongs to exactly one **Layer** and one variant; the **Registry** is the union of all Pipelines.
- A **Brainstorm** agent writes a **Brief**; a **Producer** authors from it; a **Critic** verifies the result. The three are never the same agent invocation.
- A **Brief**'s existence in `docs/briefs/` implies its target Preset (or declared verification Preset) is not yet Critic-`ACCEPT`-ed. The converse does not hold — pre-Brief presets shipped before the system landed have no Brief and don't need one for `/critic` to run.
- A **Critic** invokes **Probes** to satisfy the **R-protocol** for measurable **R-rules**.
- **Channel chrome** is enforced at **Critic** time (`aesthetic-miss`), not at schema-validation time — see [ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md).

## Example dialogue

> **Scott:** "The new pullquote preset looks generic — what's missing?"
> **Critic agent:** "Three findings, all `aesthetic-miss`. (1) No **Mono signature thread** — the kicker uses Inter, not Operator Mono. (2) The **Collage card** has rounded corners; channel rule is torn edges, not crops. (3) **Hard offset shadow** is missing — the shadow on the card is gaussian, which belongs on the **Substrate**, not the card."
> **Scott:** "Why didn't the schema catch (1) and (3)?"
> **Critic agent:** "Per [ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md), **Channel chrome** is enforced at critic time, not schema-validation time — the trade is flexibility for stripped / test presets at the cost of one revise loop per preset."

## Flagged ambiguities

- **"annotation"** was historically used both for the broad layer category and for the hand-claiming subset. Resolved: **Annotation** is the Layer; **Mark** is the narrower hand-claiming subset.
- **"tool"** historically meant a per-route generator (`research-paper`, `quote-focus`). After [ADR-0002](adr/0002-per-tool-routes-to-preset-engine.md), the term is retired; the unit of authoring is a **Preset**.
- **"layer"** was used loosely for any z-stacked element. Resolved: **Layer** refers specifically to one of the five composition layers, each with its own Pipeline type and Registry section.
- **"surface"** vs **"substrate"** were used interchangeably. Resolved: **Surface** is the renderer; **Substrate** is the material it claims.
- **"chrome"** was used both for the channel's signature elements and for any layered Overlay. Resolved: **Channel chrome** is the specific channel-identity subset; **Overlay** is the general Layer.
- **Pack scope (appearance vs motion)** was unresolved — the code put some motion (`enterMotion`, `bodyEnter`, `focalMotion`) into Pack Roles while treating motion-form as intrinsic, leaving the seam undrawn. Resolved: a **Pack is appearance-only**; all motion (form, timing, easing) is intrinsic to the **Preset**/**Pipeline**. The motion Roles are to be removed and made `implementation`-declared.
- **Declared-but-not-consumed Pack system.** As of this writing the Pack/Role/Identity-Spec system is *declared* (manifest, ~26 `identity.ts`, boot-gate validator) but **not consumed by rendering** — `resolveStyle`/`resolveRole` are never called; CanvasSources hardcode color and Presets carry inline hex, and some manifest values contradict what their Pipeline actually paints. The committed direction is to **finish** it (wire resolution to pixels, render-is-truth refactor, a second Pack as the acceptance gate), not to cut it. Until that lands, treat the glossary's Pack/Role definitions as the *target* model, and the inline hex in code as the *current* reality.
