# GFX Context

The shared language for GFX's preset engine, channel aesthetic, and agent workflow. Every doc and agent in this repo should use these terms with these meanings.

## Language

### Product and namespace

**GFX**:
The current product and technical namespace, whose reserved domain is **gfx.computer**. Identifiers and protocol values spell it `gfx`; environment variables use the `GFX_` prefix. GFX names the product and the domain — not a Layer, a Pack, or an engine concept, so nothing inside the composition model is renamed by it. The product is local-first: public deployment was descoped on 2026-08-31 and the domain is reserved for a future docs site ([ADR-0052](adr/0052-public-runtime-and-retention-architecture.md) status).
_Avoid_: Supers (the legacy name — see below), GFX Computer as a product noun, gfx.computer as an identifier prefix, "the public origin" as a thing that exists.

**Legacy Supers artifact**:
Any value, file, or record that still spells the old product name — the `supers@1` composition schema id, a `supers-sync@1` marker receipt on an editor's Resolve timeline, a `supers@<sha>` Sentry release, a `SUPERS_*` environment variable. It is not a defect by itself; it is a value that owes exactly one **name disposition**. An occurrence inside a historical record is never a naming violation.
_Avoid_: legacy code (broader), stale name (implies every occurrence is a mistake), old branding (the artifacts are protocol values, not branding).

**Name disposition**:
The single recorded classification every current or legacy name carries, fixed in [ADR-0053](adr/0053-gfx-namespace-and-legacy-supers-compatibility.md): `current`, `rename-now`, `accept-old / write-new`, `deprecated alias`, `frozen`, or `historical`. The disposition follows one question — does a reader outside the working tree depend on the string? Legacy readers ship before GFX writers, and no surface is migrated by a tree-wide find-and-replace.
_Avoid_: migration status, deprecation level, rename phase (a disposition is a standing classification, not a stage a name moves through).

**Public demo session**:
The browser-scoped, no-account working context a visitor has on a host running the `public` runtime profile — today a local production-shaped origin, since public deployment is descoped. Its composition state lives only in that browser: never sent to the origin, never written to origin disk, never tied to an identity. There are no accounts, no server-side composition store, and no durable visitor content. Reloading continues the same session; clearing browser storage ends it and leaves nothing behind on our side.
_Avoid_: account, workspace (the **Workspace** is the engine shell), project, cloud document, saved session; also "the public site", which does not exist.

**Export session**:
The bounded server-side unit of work in [ADR-0052](adr/0052-public-runtime-and-retention-architecture.md) — one private temp directory, one ffmpeg process, one single-shot download. It carries rendered frames, never composition JSON, and is destroyed on completion, failure, cancellation, idle expiry, and once the download drains. Where one render happens, not where a composition lives.
_Avoid_: **Public demo session** (opposite lifetime and opposite storage), render job, export queue (there is no queue).

### Agent authoring transport

**Operation**:
One authoring decision a person or an agent can make — set the orientation, add an Overlay, weld this entrance to that one. Every operation exists exactly once in the **operation inventory**, is owned by exactly one **operation family**, and is reachable from both the GUI and WebMCP. Fixed in [ADR-0054](adr/0054-webmcp-operation-transaction-and-security-contract.md).
_Avoid_: action, command, mutation, edit (too broad — an edit is what an operation applies), tool call (that is the WebMCP transport, not the decision).

**Operation family**:
One of the fifteen non-overlapping domains an **Operation** belongs to, defined by what an author decides rather than by which panel the control lives in. Each family declares the composition pointers it alone writes; where pointers nest, the longest pointer wins, and a `membership` claim covers only adding, removing, reordering, and identifying entries.
_Avoid_: namespace, tool group, category, module.

**Operation inventory**:
The machine-readable contract in `src/lib/platform/webmcp-operation-inventory.ts` — one row per **Operation**, naming its family, WebMCP tool, written pointers, registration precondition, revision and undo obligations, Workspace focus, and GUI surface. The bidirectional parity gate (`pnpm audit:webmcp-parity`) reads it: a row reachable from only one transport is a defect, unless the row is annotated `internal-only`.
_Avoid_: tool manifest, tool registry (the **Registry** is the Pipeline registry), API surface, schema.

**Composition revision**:
The monotonic counter the open composition carries. Every mutating **Operation** supplies the revision its caller observed; a mismatch fails as `stale_revision` and applies nothing, so an agent cannot overwrite an edit it never saw. GUI and agent edits advance the same counter and record into the same undo history.
_Avoid_: version (a Pack Calibration bundle and a placed Resolve clip both use `version`), sequence number, generation.

**Operation receipt**:
What a successful mutating **Operation** returns: the new **Composition revision**, a bounded description of what changed, the validation findings that appeared or cleared, the undo label recorded, and the focus moved. Bounded by character budget on purpose — an agent continues from the receipt rather than re-reading the document.
_Avoid_: response, diff, patch, changelog.

### Composition model

**Preset**:
A JSON document declaring a **composition recipe** — motion, content, Pipeline choices, and appearance-role references — against the `gfx@1` schema (a Legacy Supers `supers@1` document is accepted and folded at ingress). A Preset is _Pack-neutral_: it names the Surface, Blocks, Annotations, Overlays, timings, text, optional composition-wide Effects, and one default **Pack**. `typography.paperColor` / `inkColor` may be explicit hex overrides, but absent colors resolve from the active Pack; edge, depth, light, material, font, and Pack chrome remain Pack-owned. The unit of authoring.
_Avoid_: tool, scene, template (when referring to a finished composition).

**Starter template** (formerly _Recipe_):
A curated starting point — Preset + Pack — that a human (GUI) or an agent begins a new composition from, varying rather than authoring from scratch; not itself a deliverable. In the GUI this is concretely a **corpus Preset opened read-only as a fork-base**: the first edit forks a new **User composition**, never mutating the original. **Shipped** through the fork-on-edit GUI parity model ([ADR-0032](adr/0032-gui-agent-parity-authoring.md)); this replaced the never-built recipe cookbook from superseded [ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md).
_Avoid_: recipe, boilerplate, scaffold.

**User composition**:
A **Preset** authored and saved through the GUI to the **user store** — created by forking a **Starter template** or by choosing the shipped homepage **New composition** action, which forks the `blank` Preset as an untitled User composition. Identical artifact format to a corpus Preset (the engine loads either identically); distinguished only by **provenance and store**, never by schema. The product-side unit of authoring, peer to the agent-authored corpus Preset.
_Avoid_: document, override, patch, project (all imply a non-Preset or base-bound artifact — a User composition is a standalone Preset).

**Corpus** vs **user store**:
The two places a **Preset** lives. The **corpus** is the git-tracked set under `src/lib/presets/` — Critic-accepted, build-harness reference artifacts, **read-only from the GUI** (they serve as Starter templates). The **user store** is a separate user-writable location holding **User compositions**. Both hold the same Preset format. Pre-parity, everything lived in the corpus; the store split is what lets GUI authoring coexist with the proof corpus without polluting it.
_Avoid_: conflating the two; calling the user store a "database" or "project" (it is a Preset store).

**Layer**:
One of the five composition layers — **Surface**, **Block**, **Annotation**, **Overlay**, **Effect**. Render order and registry membership are defined by which layer a renderer belongs to.
_Avoid_: tier, level, stage (in the composition context).

**Surface**:
The renderable material claim of a composition. The bottommost Layer. Registered Surfaces include reflective documents, transparent fields, emissive mocks, and stored captures; `SurfaceTypeSchema` and the Pipeline registry are the live catalog. `website-screenshot` is the Pack-immune stored-capture Surface, distinct from the structured `web-document` mock family.
_Avoid_: background, base, canvas (the canvas is the WebGPU target, not the surface); the fictional names `newspaper-clipping` / `modern-web-article` / `photographed-frame` / `collage-card` (never existed as Surfaces — `collage-card` is a Syntax-pack _appearance_, see below).

**Substrate**:
The underlying material a surface depicts — paper, photo, web document. A **Surface** is the renderer; the **Substrate** is the material it claims to be.
_Avoid_: surface (those are distinct), background.

**Media asset**:
Immutable creator-owned media bytes in the local content-addressed asset store. Bytes are globally deduplicated by content while composition membership stays in the Preset; two **User compositions** may reference the same bytes through different **Media library entries**. V1 accepts video bytes only. Removing a library entry never deletes shared bytes.
_Avoid_: project asset (there is no Project artifact), embedded media, Source video (the retired singular authoring model; retained only in migration/history).

**Media library entry**:
A composition-scoped stable record in `state.media.assets[]`: `{ id, kind: "video", name, assetUrl }`. `id`, `kind`, `name`, and `assetUrl` persist and round-trip with the standalone Preset. Duration, dimensions, rotation, frame rate, codecs, channels, sample rate, byte size, readiness, and probe errors are volatile observations of the referenced bytes and never Preset data. An unused entry is legal.
_Avoid_: Media asset (the immutable bytes, not membership), global library entry, Project asset.

**Video track**:
The one ordered primary footage lane at `state.media.videoTrack`, rendered beneath all five composition **Layers**. It is not a Layer, Surface, Substrate, Effect, or Add-layer option. V1 has exactly one fixed 1x track with hard cuts and transparent gaps; its **Video clips** must be ordered and non-overlapping.
_Avoid_: Layer, video Surface, background video, multiple video tracks.

**Video clip**:
A stable edit decision in `state.media.videoTrack.clips[]` that references one **Media library entry** and maps a half-open Timeline frame interval `[timelineStartFrame, timelineStartFrame + durationFrames)` to **Source time**. Clip audio carries `enabled` and `gain`. Move, trim, slip, snapping, and clip creation are Timeline-only gestures; the right-rail Media mode owns library membership and selected-clip audio/removal, not numeric timing.
_Avoid_: animation Track, transition clip, Source video.

**Source time**:
Media-relative time within a **Media asset**. For active output frame `F`, `localFrame = F - timelineStartFrame` and `sourceTime = sourceStartSeconds + framesToSeconds(localFrame, transport rate)`. The decoder adds the media track's first presentation timestamp and selects the last presentation sample at or before that requested timestamp. This exact mapping drives preview, audio, and export.
_Avoid_: Timeline time (composition placement), container-absolute PTS.

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

**Orientation placement override**:
An optional target-specific placement for one **Overlay** inside the same **Preset**. The Overlay's shared placement remains the fallback; a horizontal or vertical override changes its staging only for that transport orientation. This preserves orientation as a dial without pretending materially different anchor geometry can be derived from one coordinate pair. Authored geometry remains exact; platform safe areas validate the resolved placement but never clamp or mutate it.
_Avoid_: orientation variant, vertical Preset, responsive duplicate (the composition and Overlay remain singular).

**Orientation geometry override**:
An optional target-specific complete geometry snapshot for one **Diagram primitive** inside the same **Preset**. Positioned primitives snapshot position and scale; edge-arrows snapshot endpoints, route, and control; timeline-segments snapshot both endpoints. Shared content, timing, animation, ink, and direction remain the fallback composition. The GUI edits shared geometry until the author explicitly enables **Customize horizontal** or **Customize vertical**.
_Avoid_: vertical diagram, responsive primitive copy, partial geometry patch (the primitive remains singular and snapshots never inherit individual geometry fields).

**Effect**:
A composition-wide authored operation with one of three registry-owned execution lanes. Ordinary entries in `effects[]` are post-process passes run after the selected render branch — grit overlay, chromatic aberration, color grade, film grain. Composition-owned entries in `effects[]` alter branch dispatch before the remaining post-process chain; `depth-of-field` is the current example. Transition Effects are named by top-level `transition.effect` and composite the two cached endpoint snapshots through the distinct transition registry. Per-target shader work (substrate physics, per-overlay edge treatment) is not an Effect — it is a `shaderPass` on the SurfaceRenderer or OverlayRenderer per ADR-0005 / ADR-0008. See [ADR-0018](adr/0018-collapse-effects-to-frame-only.md) and [ADR-0026](adr/0026-transitions-v1-snapshot-and-wipe.md).
_Avoid_: filter, shader (a shader is the WebGPU implementation; an Effect is the authored registry entry), per-layer effect (the engine no longer supports per-layer chains — see ADR-0018), assuming every Effect is a post-process pass or an `effects[]` entry.

**Dimensional Stage**:
The optional composition-wide spatial compositor that places captured Layer output and bounded Pipeline-owned geometry inside one camera, depth, focus, and lighting space. It changes how the five Layers compose and is not content or a sixth Layer; the shipped `depth` Stage is its current registered form, with Pipeline-defined geometry expansion designed in [ADR-0051](adr/0051-pipeline-defined-dimensional-stage-geometry.md).
_Avoid_: 3D canvas (the Canvas is the output target), 3D Layer, scene Layer, generic scene editor.

**Stage geometry contribution**:
A bounded 3D render contribution owned by a registered Surface, Block, or Overlay Pipeline and consumed by the **Dimensional Stage**. It retains the Pipeline's Layer identity; it is not a free-standing scene object or entry in a generic object tree.
_Avoid_: 3D object Layer, scene node, model document, `stage.objects`.

**Cascade**:
A declarative timing relationship between elements: an element's enter anchors to another element's enter plus an offset (kicker → title +120 ms → subtitle), so reading-order choreography re-times as one unit instead of drifting apart across hand-set absolute starts. The timing peer of an automatic **audio cue** — welded, never hand-synced. Shipped with generalized keyframes ([ADR-0035](adr/0035-generalized-keyframes-and-cascade.md)).
_Avoid_: stagger (the narrower per-glyph text-animation mechanism), sequence, chain, follow-through (the animation-craft effect a Cascade is used to achieve, not the mechanism).

**Diagram primitive**:
The five-**Block** vocabulary for art-directed, documentary-style diagrams — `node`, `edge-arrow`, `label`, `stat-callout`, `timeline-segment` — living on any Surface, positioned explicitly (schema + GUI drag), revealed with stroke-draw + **Cascade** choreography, and reflowed through optional **Orientation geometry overrides**. Edge _route_ is authored geometry; edge _stroke_ is appearance (Pack-resolved Role). A map is a **composition** (primitives over an image substrate), not a primitive. Explicitly _not_ auto-layout: mermaid was rejected as the model (auto-layout reads as documentation, not documentary); at most a future compile-into-primitives authoring shortcut. Shipped in [ADR-0036](adr/0036-diagram-primitives.md).
_Avoid_: mermaid Block (auto-layout is not the model), infographic, map primitive (a map is a composition, not a type).

**Chart group**:
The optional `surface.chart` declaration that carries one to four **Chart Blocks** on a `plain` or `paper` Surface; other Surface types reject it semantically. `single` mode contains exactly one item; `sequence` mode contains two to four declaration-ordered items with non-overlapping visibility windows. It is one bounded composition mechanism, not a dashboard or a sixth Layer. Agents and the GUI author this same strict inline Preset model.
_Avoid_: chart layer, dashboard, data source, ingestion model, orientation-specific chart Preset.

**Chart Block**:
One factual statistical graphic rendered in the **Block Layer** with a stable Pipeline identity: `bar-chart`, `column-chart`, `unit-grid-chart`, or `dot-field-chart`. It owns explicit categories and series, factual domain or normalization, semantic targets for highlights and computed callouts, label visibility, a semantic fill role, and the five deterministic phases `entry`, `reveal`, `emphasis`, `annotation`, and `exit`. Shared layout reflows the same declaration at both native orientations; Packs own mark and chrome appearance but never values, geometry, or motion. Shipped in [ADR-0048](adr/0048-agent-authored-chart-domain.md).
_Avoid_: chart (when the group or Pipeline identity matters), graph, visualization widget, canvas chart, Pack-specific chart variant.

### Pack model

**Pack**:
A swappable **appearance** dress resolved at render time. Pack artifacts have two roots: `docs/packs/<slug>/` holds the human aesthetic contract and inspiration; `src/lib/packs/<slug>/` holds the machine manifest and bundled fonts/assets. The manifest resolves engine **Roles** to concrete appearance values — color (fill, ink, accent), edge treatment, depth treatment, light, font, material, chrome, and assets. A Pack carries **appearance only**; it carries **no motion** (form, timing, and easing live entirely in the **Preset** and **Pipeline**). A Preset declares exactly one Pack as its default; the runtime may override the active Pack so the same Preset can render under any Pack ("render preset X under pack Y"). There is **no privileged default Pack** — `syntax` is the completeness-reference Pack, not a fallback. `PACK_REGISTRY` is the live catalog.
_Avoid_: theme, skin, style (under-specified), aesthetic doc (the doc is one artifact inside a Pack), motion pack (Packs never carry motion).

**Role**:
A named appearance slot a **Pipeline** declares (in its **Identity Spec** `viaPack` clause) and the active **Pack** resolves to a concrete value. Resolution is **two-level, with fallback** (like `var(--specific, var(--core))`): a Pipeline names a specific Role (`chapter-card.fill`); the resolver returns the Pack's value for it if present, else falls back to the **core Role** of the same dimension (`fill-treatment`). Every registered Pack must implement the seven mandatory cores (`fill-treatment`, `ink-treatment`, `accent-treatment`, `field-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`); `field-ink-treatment`, `font-treatment`, and `material-treatment` are recognized optional cores. `field-treatment` is the Pack's full-frame field colour — the backdrop a full-frame piece sits on, distinct from the card/plate `fill-treatment` — and is what `backgroundFill: "pack"` resolves to (ADR-0039 §3). `field-ink-treatment` is its explicit foreground companion for content sitting directly on that field; it falls back to `ink-treatment`, never to runtime luminance adaptation. Per-Pipeline Roles are optional overrides a Pack supplies only where it wants that Pipeline to diverge. Roles are appearance-only — there are no motion Roles.
_Avoid_: token (collides with design-token systems), variable, slot (overloaded with Focal slot), motion role (Roles never carry motion).

**Identity Spec**:
A per-Pipeline declaration of the **dimensions of identity** the Pipeline owes when it claims to render _something_. Every visible Pipeline (Surface, Block, Annotation, Overlay) ships one. An Identity Spec has a `kind`, a one-line `claim`, and an explicit list of `dimensions`. Each dimension has (a) a one-sentence operational definition, (b) a Pipeline-side implementation contract, and (c) a Critic-side probe (script or named-observation). A Pipeline whose Identity Spec ships with any dimension unimplemented, or any dimension without a probe, is rejected _at Pipeline registration time_ — the engine refuses to expose a renderer that would collapse to a defaulted, div-shaped approximation of its claim. Lives at `src/lib/pipelines/<layer>/<variant>/identity.ts` alongside the Pipeline.

Three `kind`s exist:

- **material** — the Pipeline claims to be a material (paper, photo, web doc, photographed frame). Dimensions are physical/optical (grain-multi-scale, ink-bleed-at-edges, edge-occlusion-shadow, optical-misregistration, camera-defocus-budget). Subsumes the previous _Material Physics Spec_ concept.
- **graphic** — the Pipeline claims to be a piece of designed motion graphics (lower-third chip, kicker plate, watermark, source URL plate). Dimensions are formal: the appearance ones (fill-treatment, edge-treatment, depth-treatment, light-treatment) are declared `viaPack` (a **Role**); the motion ones (motion-form, frame-relationship) are **intrinsic** (`implementation`, owned by the Pipeline — motion never concedes to a Pack). Required because the appearance defaults stacked together is the structural definition of "animated div."
- **tool** — the Pipeline claims to be a hand tool acting on a surface (highlighter, marker, circle, strike). Dimensions are tool-physics (stroke-pressure-variation, end-cap-behavior, opacity-along-path, overshoot-budget, saturation-curve, registration-offset).

_Avoid_: material spec (the narrower predecessor; now the `material` kind), identity rubric (the Spec is per-Pipeline data, not a global rubric), realism checklist.

### Sound model

**Sound event**:
A semantic sound a **motion primitive emits** at a frame-deterministic moment — `whoosh-in` at an overlay slide's start, `impact` at a card-drop's settle, `tick` per character of a kinetic build. The trigger time and default event are intrinsic to the motion (owned by the Pipeline, like motion-form). `DEFAULT_EVENT_SAMPLES` resolves each event to one engine-default sample from the 28-cue Foley library; `sound.event`, `sound.sample`, and `sound.mute` override one motion. Foley cues are stored as seeded, fixed WAV renders so preview and export consume identical bytes. The iMessage bubble and tapback recordings remain locked-specific exceptions. Sound does not resolve through a Pack or kit.
_Avoid_: cue (the cue is the scheduled realization), sfx, sound effect.

**Sound kit**:
**Removed term.** The proposed per-Layer sample bundle was never part of the final model and was removed on 2026-07-02 after GUI testing. Current sound is engine defaults + per-motion overrides; no `soundKit`, Palette picker, kit registry, or kit fallback exists. This entry is a tombstone so historical ADR prose is not mistaken for active guidance.
_Avoid_: sound pack, sound style, Palette, kit fallback.

**Audio cue**:
A scheduled sound on the timeline. **Automatic cues** are _derived_ (not stored) from a motion's **sound event** at the motion's own frame and resolve through `DEFAULT_EVENT_SAMPLES` unless that motion overrides or mutes the cue, so they stay welded through every re-time/reflow. **Manual cues** are author-placed at an absolute timeline fraction (an outro sting, the **bed** start) and live in `audioCues[]` on `EngineState` (peer to `textAnimations[]` / `marks.timings[]`). Either way a cue does **not** render pixels — sound is **not a Layer**.
_Avoid_: sound event (the semantic trigger vs. its scheduled realization).

**Bed**:
An optional single music/ambient track for a self-contained **segment / bumper** (a full-frame piece). Transparent **Overlays** carry no bed — the footage they composite over owns the audio.
_Avoid_: soundtrack, score, music track (when naming the slot).

### Pack-scoped vocabulary (Syntax pack)

These terms are vocabulary **of the Syntax Pack**, not of the engine. They are defined in [`docs/packs/syntax/aesthetic.md`](packs/syntax/aesthetic.md) and listed here only as cross-reference; a different Pack carries different appearance vocabulary.

**Channel chrome**:
The Syntax Pack's signature elements that distinguish its output from generic motion graphics — at minimum a **Mono signature thread**, grit overlay, hard offset shadow on Collage cards. Defined in [`docs/packs/syntax/aesthetic.md`](packs/syntax/aesthetic.md).

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

### Pack catalog (product)

**Pack Catalog**:
The set of house-authored **Packs** bundled in the one shared app — the product's primary offer (grilled 2026-07-10). Creators pick the pack closest to their look; variety spans distinct design systems (grammar, not colorways). Custom packs are concierge-authored on request from whatever brand material exists (a brand doc, CSS, or a website) and ship in the same shared bundle. There is no runtime pack loading and no per-customer build.
_Avoid_: marketplace, theme store, skin.

**Calibration Trio**:
The three reference compositions re-dressed under a candidate **Pack** and iterated live with Scott until ratified — the quality gate for catalog entry (alongside the boot core-vocabulary validator and the two-Pack pixel-diff lock). One pack at a time; no pack enters the catalog without its ratified trio. Doubles as the pack's pack-switch demo.
_Avoid_: smoke test, sample renders.

**Pack-neutral composition**:
A shipped Preset staged in no single brand's grammar, so it reads well under every catalog **Pack** ([ADR-0039](adr/0039-pack-neutral-compositions-and-listing-hygiene.md)). Brand-specific staging (e.g. the taped-clipping collage) belongs to a Pack's roles/variants or doesn't ship as a shared Preset. Corollaries: Pack and orientation are dials, not grounds for duplicate deliverables. Fixture-only calibration re-dresses and retained reflow proofs may use suffixes because they are excluded from the listing and remain loadable only as development evidence.
_Avoid_: pack-agnostic (the composition still consumes pack roles — it just presumes no particular pack).

### Engine internals

**Pipeline**:
A registered renderer for one Layer type and one variant — e.g. the `pullquote-on-photo` Surface pipeline, the `highlight` Annotation pipeline. Each pipeline owns its TypeGPU bind groups, WGSL, and uniform layout.
_Avoid_: backend, driver, plugin.

**Registry**:
The catalog of available Pipelines that Presets compose from, organized by Layer under `src/lib/pipelines/<layer>/` (the renderers). `src/lib/platform/pipelines/` holds only registry + runner infrastructure, not renderers.

**Timeline**:
The single `Timeline` instance per Preset that owns playback state (`time`, `isPlaying`, `durationSeconds`, `fps`). Animation is scrubbed by progress, never played by wall-clock.

**Track**:
A horizontal lane in the **Timeline** UI representing a timed segment with `start`, `duration`, and an `onUpdate` callback. A Mark, Overlay, or Focal slot is typically backed by a Track.
_Avoid_: **Video track**, which is the authored primary-footage domain rather than a generic animation track.

**TextAnimation**:
A choreographed motion applied to a single text slot (`surface.content.title`, `body`, `kicker`, `sourceUrl`, `dateLabel`, `author`, `source`, or a `lower-third` overlay's `title` / `kicker` / `subtitle`). Declared as an entry in `state.textAnimations[]`, peer to `marks.timings[]`. The orchestration domain is not a Layer — it does not render — it choreographs the DOM the HTML-in-Canvas path captures. See [ADR-0011](adr/0011-text-animation-orchestration.md).
_Avoid_: text effect (collides with **Effect (text)** below), text mark (collides with **Mark**).

**Effect (text)**:
One entry in `TEXT_EFFECT_CATALOG`, vendored from `pixel-point/animate-text` (e.g. `soft-blur-in`, `kinetic-center-build`, `fade-through`, `typewriter`). Identified by `effect` on a **TextAnimation** entry. Disjoint from the composition-wide **Effect** Layer — same word, different concept. Source vocabulary is always qualified (`TextEffectSpec`, `TextEffectId`, `TextEffectPhase`, `compileTextAnimation`); in prose, write _text effect_, _post-process Effect_, or _composition-owned Effect_ where ambiguous.
_Avoid_: text animation (broader; an Effect is a catalog id, an animation is the configured instance).

**Split mode**:
The unit a text effect operates on — `whole`, `per-character`, `per-word`, or `per-line`. Declared by the effect's catalog entry, not by the **TextAnimation**. Parse-time rule: `per-character` and layout-aware renderers accept title-scale slots only; `whole` / `per-word` / `per-line` accept every text slot.
_Avoid_: split granularity, target mode.

**Renderer family**:
An algorithm underneath the text-effect catalog, such as `generic-stagger`, `kinetic-center-build`, `kinetic-top-build`, or `shared-slide-opacity-stage`. Identified by `effect.showcase.renderer.id` in the catalog. Each family has a dedicated strategy file under `src/lib/text-animations/strategies/`.
_Avoid_: renderer kind, animator (which collides with the AnimationManager).

### Workflow roles

**Brief**:
A markdown document under `docs/briefs/<slug>.md` defining a not-yet-shipped **Preset**, **Pipeline**, or content domain. One Brief per in-flight idea; no separate backlog. The **Producer** authors from a Brief. The **Critic** never reads it. Retirement is a separately classified Delivery change after the declared implementation and documentation boundary is complete; historical Critic `ACCEPT` has no current authority. See the current lifecycle in `docs/briefs/README.md` and the superseded decision history in [ADR-0007](adr/0007-brainstorm-brief-system.md).
_Avoid_: proposal, plan, sketch, spec, draft.

**Producer**:
A sub-agent spawned with fresh context to author a Preset (or the engine work + Preset declared by a pipeline / domain Brief). Reads the Brief plus the binding docs; does not see the brainstorm conversation. Never the same invocation as the **Brainstorm** or **Critic** agent.

**Brainstorm**:
The agent that grills the user through a Brief and writes `docs/briefs/<slug>.md`. Actively proposes options from the active Pack's aesthetic doc (`docs/packs/<pack>/aesthetic.md`) and the existing Registry rather than just capturing user input. Invoked via `/brainstorm <slug>`. Hands off to the **Producer** (via `/author <slug>`), not to authoring directly.

**Critic**:
An optional sub-agent spawned with fresh context to supply adversarial observations about a Producer's output. It sees only the Preset + renders + rubrics; never the Brief, brainstorm conversation, or Producer session. Its prose is advisory and has no Delivery authority. See the superseded build-harness history in [ADR-0001](adr/0001-critic-sub-agent-verification.md) and the current advisory protocol in `docs/critic.md`.

**Probe**:
A script under `scripts/probe-*.ts` that reads an explicitly requested Pixel diagnostic and returns numeric measurements (banding, dimensions, hue count). Probes do not participate in routine Layout Contract verification or scheduled Sentry. Only closed-code evidence can route objective failure.

### Rubric tiers

There are two distinct layers, often confused. The **rubric tiers** (R/Q/G) contain deterministic rules and human review criteria evaluated against rendered pixels. Closed-code measured failures own objective routing; exact-evidence-bound human approval owns subjective acceptance. Optional Critic prose remains advisory. The **Preset linter** is a separate code gate that checks only the JSON-computable slice _before_ rendering. Per [ADR-0025](adr/0025-static-linter-checks-safety-and-readability-only.md), the linter owns objective video-safety + readability; the remaining criteria belong to deterministic render checks or the human aesthetic decision.

**Preset linter**:
The static code gate at `src/lib/platform/preset-rubric.ts` (run by `scripts/verify-presets.ts` as `lintPreset`). It checks only objective video-safety/readability facts computable from Preset JSON plus target frame size: authored read windows, safe-area placement, contrast, frame fit, and related structural timing floors. Render-measured cap height, line measure, and density live in `lintPresetVisual` and the visual audit harness, not `verify-presets`. Neither lane carries motion or aesthetic taste; exact-evidence-bound human review owns that judgment. See [ADR-0025](adr/0025-static-linter-checks-safety-and-readability-only.md).
_Avoid_: rubric (the linter is not the R/Q/G rubric tiers), validator (that is schema parsing).

**Layout Contract Frame**:
A strict numeric safety/readability receipt for one exact Preset, Pack, orientation, and frame address. It records native geometry, readable identity coverage, safe-area intersections, clipping, cap heights, font readiness, reading windows, and deterministic layout replay. It contains no image evidence and makes no aesthetic claim.
_Avoid_: screenshot, render sample, visual approval.

**Layout Contract Matrix**:
The exhaustive set of **Layout Contract Frames** required by one verification scope. Routine Delivery and scheduled Sentry use it to prove objective rendered safety across the corpus without retaining screenshots. Missing coordinates or incomplete identity authority are unavailable evidence, never inferred passes.
_Avoid_: screenshot matrix, gallery, contact sheet.

**Pixel diagnostic**:
An explicitly requested bounded capture or probe for a genuinely pixel-only question such as antialiasing, blur, banding, codec artifacts, or local composited contrast. It is diagnostic evidence, not the routine safety matrix and not subjective approval.
_Avoid_: Layout Contract (numeric geometry authority), Critic observation, automatic corpus screenshot gate.

**R-rule**:
A render-quality rule from `docs/quality-rubric.md` (R1–R8). Non-negotiable; a closed-code measured failure means a pipeline bug to fix, not a Preset to tune. Rules without closed measurement remain human criteria, never Critic routing authority.

**Q-rule**:
A composition-craft rule from `docs/quality-rubric.md` (Q1–Q18). Aesthetic-neutral; evaluated after every closed R-rule passes.

**G-rule**:
A general animation rule from `docs/animation-rubric.md` (G1–G12, plus per-overlay rules). Governs how the composition moves over time.

**R-protocol**:
The named-observation format for advisory R-rule observations — pixel coordinate, saved screenshot path, and (for measurable rules) numeric Probe output. It prevents prose-only rubber-stamping but does not grant routing authority.

## Relationships

- A **Preset** declares one **Surface**, its **Blocks**, zero or more **Annotations** on those Blocks, zero or more **Overlays**, and one flat `effects[]` list. Registry ownership determines whether each list entry changes branch dispatch or runs in the final post-process chain; optional `transition.effect` names the distinct two-snapshot transition lane.
- A **Preset** may also declare composition-scoped **Media library entries** and one primary **Video track** beneath that complete Layer stack. Neither is a sixth Layer or an Add-layer option.
- A **Video clip** references one **Media library entry**; the entry references globally deduplicated **Media asset** bytes. Only the stable entry and clip decisions persist in the Preset.
- Every **Mark** is an **Annotation**; not every **Annotation** is a **Mark**.
- A **Pipeline** belongs to exactly one **Layer** and one variant; the **Registry** is the union of all Pipelines.
- A **Brainstorm** agent writes a **Brief**; a **Producer** authors from it; an optional **Critic** supplies independent advisory observations. The three are never the same agent invocation.
- A **Brief**'s existence in `docs/briefs/` means its declared implementation and documentation boundary remains active. Brief retirement is a classified Delivery change, not a Critic side effect.
- A **Critic** may invoke **Probes** to support the **R-protocol** for measurable **R-rules**, but its output cannot block, approve, reject, mutate, or route Delivery.
- **Channel chrome** is judged by the human aesthetic authority, which is bound to the exact integrated revision/tree and matrix evidence. Critic `aesthetic-miss` observations are optional context only — see [ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md).

## Example dialogue

> **Scott:** "The new pullquote preset looks generic — what's missing?"
> **Critic agent:** "Three findings, all `aesthetic-miss`. (1) No **Mono signature thread** — the kicker uses Inter, not Space Mono. (2) The card paints a scrim gradient; the house style is a flat plate with a visible border. (3) The **stepped hard-offset shadow** is missing — the card carries a gaussian shadow, which never appears on chrome."
> **Scott:** "Why didn't the schema catch (1) and (3)?"
> **Critic agent:** "Per [ADR-0004](adr/0004-recipe-cookbook-over-schema-chrome.md), **Channel chrome** is not schema-enforced. These observations are advisory context for your exact-evidence aesthetic decision; they cannot route a revision themselves."

## Flagged ambiguities

- **"Supers"** was simultaneously the product name, the technical prefix, and the composition schema id. Resolved: **GFX** is the current namespace, and every remaining `supers` spelling is a **Legacy Supers artifact** carrying one **name disposition** ([ADR-0053](adr/0053-gfx-namespace-and-legacy-supers-compatibility.md)). This glossary, the product copy, and the current guidance docs have been renamed; the `supers` spellings that remain in them are quoted protocol values, not prose.
- **"public"** now means one thing only. It is the name of a runtime profile — `GFX_RUNTIME_PROFILE=public`, and with it the public export lane, the public surface inventory, and the public response headers — which says how strictly a host behaves, not who can reach it. It never means "deployed to the internet": public deployment was descoped on 2026-08-31 ([ADR-0052](adr/0052-public-runtime-and-retention-architecture.md) status), GFX is local-first, and gfx.computer is a reserved domain awaiting a docs site. A doc that says GFX is live is wrong, not merely imprecise.
- **"session"** meant both the visitor's browsing context and a server-side encode. Resolved: a **Public demo session** is browser-scoped and holds composition state; an **Export session** is server-side, holds rendered frames only, and destroys itself. They never share storage or lifetime.
- **"annotation"** was historically used both for the broad layer category and for the hand-claiming subset. Resolved: **Annotation** is the Layer; **Mark** is the narrower hand-claiming subset.
- **"tool"** historically meant a per-route generator (`research-paper`, `quote-focus`). After [ADR-0002](adr/0002-per-tool-routes-to-preset-engine.md), that sense is retired; the unit of authoring is a **Preset**. The word now has exactly one live meaning: a **WebMCP tool**, the registered `document.modelContext` entry that exposes one **Operation** ([ADR-0054](adr/0054-webmcp-operation-transaction-and-security-contract.md)). A tool is the transport; the **Operation** is the decision.
- **"layer"** was used loosely for any z-stacked element. Resolved: **Layer** refers specifically to one of the five composition layers, each with its own Pipeline type and Registry section.
- **"surface"** vs **"substrate"** were used interchangeably. Resolved: **Surface** is the renderer; **Substrate** is the material it claims.
- **"chrome"** was used both for the channel's signature elements and for any layered Overlay. Resolved: **Channel chrome** is the specific channel-identity subset; **Overlay** is the general Layer.
- **Pack scope (appearance vs motion)** was unresolved — the code put some motion (`enterMotion`, `bodyEnter`, `focalMotion`) into Pack Roles while treating motion-form as intrinsic, leaving the seam undrawn. Resolved and shipped: a **Pack is appearance-only**; all motion (form, timing, easing) is intrinsic to the **Preset**/**Pipeline**, and the former motion Roles were removed in favor of `implementation`-declared identity dimensions.
- **Pack wiring is live.** Color and font Roles reach pixels through `resolveAppearanceVars`; `resolveDepthTreatment` drives hard-offset or glow depth; `resolveEdgeTreatment` drives the shared silhouette ShaderPass; `resolveLightTreatment` drives the depth stage's scene key light; and `resolveMaterialTreatment` drives the shared alpha-masked CRT scanline ShaderPass. All use typed, resolver-recognized values; the old generic `resolveStyle` / `resolveRole` accessors are gone. `PACK_IMMUNE_PIPELINE_KEYS` is the complete runtime-derived authority for FULLY immune faithful artifacts; PARTIAL substrate immunity (ADR-0039 §2 — immune document body + enumerated claimable chrome slots, e.g. the newspaper's kicker chip) is queried per-slot via `isAppearanceSlotPackClaimable`. Do not copy a concrete immunity list into guidance.
