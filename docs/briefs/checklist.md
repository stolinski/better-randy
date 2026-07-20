# Checklist — a half-frame progress-tracker Surface

**Kind:** pipeline
**Slug:** checklist
**Verification preset:** checklist-project-setup

## Pitch

A creator block that puts the video's agenda on screen as a numbered checklist occupying half the frame, riding beside the talking-head / footage. As the creator finishes each step on camera, a red marker strokes through the item — the animated strike is the recurring completion beat viewers wait for. Each item can be either **statically struck** (already done when the shot opens) or **animated** (the strike draws through mid-clip on cue), and the block reflows from a horizontal right-half column to a vertical bottom-half panel. It's reusable across episodes: the list is the structure, and checking items off is the payoff. A Syntax.fm viewer reads it instantly as "here's the plan, and we're knocking it out."

## Surface(s) involved

A **new `checklist` Surface** (`SurfaceTypeSchema` gets a `checklist` member) — no existing Surface carries an ordered list of independently-completable items. The single-`body` model (`paper`) can't carry per-item `checked` state, per-item strike timing, or per-item timeline tracks; a checklist is an *ordered list of items* the same way `imessage` is an *ordered list of messages* (ADR-0031's reasoning applies directly).

The Surface reuses the **`paper` compositor** for DOM upload + the marks system (the `createPaperPipeline` pattern iMessage uses), and reuses the existing **`strike` Annotation** as the red completion mark — no new Annotation pipeline. It ships in two presentations selected by a `chrome` mode field (see ADR-0037 precedent):

- **`chrome: "card"`** (default) — the flat channel card: plate + border + stepped shadow (all Pack-resolved via Roles), Grotesk title, Mono numbers.
- **`chrome: "bare"`** — no card at all: just the title and numbered items floating over footage, each line carrying a **hard (no-blur) drop-shadow** underneath for legibility over any grade. This is the "just text, no card, just shadows under" presentation. The drop-shadow is a *legibility* treatment (flat, hard-offset — matching the card's stepped-shadow physics, in the caption-outline register), never a gaussian glow.

## Content sample

Ships verbatim in `checklist-project-setup`:

- **Title:** `PROJECT SETUP`
- **Items:**
  1. `pnpm install` — `checked: true`, **static** strike (struck from frame 0)
  2. `Env vars set` — `checked: true`, **animated** strike (draws through mid-clip — the beat)
  3. `DB migrated` — `checked: false` (open)
  4. `Dev server up` — `checked: false` (open)
  5. `First commit` — `checked: false` (open)

## Motion plan

- **Card / text enter:** **settled-place** once at open (small overshoot = "placed with intent"). One entrance, then the block holds.
- **Stable layout:** every item reserves its final space from frame 0 (visibility, not reflow) — like iMessage's stable thread. The list never re-flows as strikes land, so each red rule stays pinned to its phrase.
- **Completion strike (the signature beat):** the red marker **stroke-draws** through a completed item. Reuses the `strike` Annotation tool geometry, so it carries **hand-marker physics** — pressure variation, slight overshoot past the last glyph, subtle seeded wobble.
  - **Static** (`checked: true`, no strike window): the strike is locked fully drawn from frame 0 (progress pinned to 1) — no draw-on.
  - **Animated** (`checked: true` + `strike: { start, duration, ease }`): the strike draws on over its window. `ease` defaults to `sharp` (decisive check-off).
- **Done-item de-emphasis:** as a strike lands, that item's ink **dims toward byline gray** (`#c9c6bc` under Syntax, Role-resolved), so completed reads as "done and quieted." Open items stay full ink. Static-struck items open already dim.
- **Focal slot:** the item whose strike is currently drawing is the hero beat (Q10 — one hero per beat).
- **Numbers** in Space Mono (chrome voice); **title** in Space Grotesk (display voice).

Per-item **sound**: an animated strike emits a `scratch` / `draw`-family cue at its draw-on (per-motion `sound` override on the item's strike window); static strikes and open items are silent.

## Channel chrome notes

- **Mono signature thread** — present: the item **numbers** are Space Mono, and the title reads as a Mono kicker option. Satisfies the mono-required thread.
- **Hard offset shadow** — present on `chrome: "card"` via the Pack's `depth-treatment` Role (the stepped shadow under Syntax); on `chrome: "bare"` a single hard-offset (no-blur) drop-shadow rides under each text line for legibility.
- **Torn edge** — **omitted** (intentional): tears are for quoted physical documents, never channel chrome. Card corners take the Pack `edge-treatment` (clean/rounded under Syntax).
- **Registration jitter** — present on the red strike marks (the `strike` Annotation already carries Q6 seeded imperfection).
- **Grit overlay** — **omitted by default** (intentional): this is a flat chrome card, not a paper substrate. A preset may still compose `effects.frame: paper-grain` if desired; the verification preset does not.

**Intentional deviation (record in the Preset `description` so the Critic doesn't re-flag `aesthetic-miss`):**

> The completion strike uses **hand-marker physics on a chrome card**, which the Syntax anti-aesthetic ("hand energy belongs to marks on documents only") would normally reject. It is deliberate here: the strike is the emotional payload of the block — the on-camera "checked it off by hand" moment — and a flat mechanical rule would read as a spreadsheet, not a decisive human check-off. The wobble/overshoot budget stays small (the mark's default tool-physics), so it reads as a confident marker stroke, not scribble. This is the one place hand energy is allowed on this Surface; the card plate, border, shadow, type, and numbers all stay flat channel chrome.

The Surface is **pack-neutral** (ADR-0039): plate/border/shadow/ink resolve through Pack Roles (`fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`), not baked Syntax hex. Other packs re-dress it.

## Engine work required

New Surface pipeline + schema + Identity Spec + GUI parity + verification preset(s) + ADR.

- **`src/lib/pipelines/surfaces/checklist/index.ts`** — the SurfaceRenderer. Reuses `createPaperPipeline` (DOM upload + marks) with `substrate: 'flat'` (chrome card / bare text, not a paper fiber bake — the iMessage precedent).
- **`src/lib/pipelines/surfaces/checklist/CanvasSource.svelte`** — renders the title + numbered items DOM (stable layout, reserved space), the `chrome: "card" | "bare"` markup fork, and the per-item ink dim; item bodies emit `data-annotation-mark` spans so the reused `strike` Annotation draws the red rule. Frame-deterministic off `animState.globalProgress` (preview == export).
- **`src/lib/pipelines/surfaces/checklist/identity.ts`** — Identity Spec, `kind: "graphic"`. Appearance dims (`fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`) declared `viaPack`; motion dims (`motion-form`, `frame-relationship`) intrinsic. Plus Surface-specific dims, each with a probe: **`numbered-item-list`** (ordered 1..N, mono numbers, stable layout), **`completion-strike`** (red hand-marker rule; static locked-at-0 vs animated draw-on; done-item dim), **`chrome-mode`** (card plate vs bare text-with-legibility-shadow, transparency between items in bare mode). Register the strike-on-chrome as the declared allowed hand-energy exception.
- **`src/lib/platform/engine-schema.ts`** — schema additions:
  - `checklist` in `SurfaceTypeSchema`.
  - `content.title` (string) and `content.items[]`, each `{ text: AnnotationBody-string, checked: boolean, strike?: { start, duration, ease }, sound? }`.
  - `chrome: 'card' | 'bare'` on the surface (read as `chrome ?? 'card'` at runtime — the `validateOverlayContents` `.default()` caveat, ADR-0037).
  - `position` (anchor + `normalized-rect`, like overlays) for half-frame placement; the pipeline owns the H→V reflow (right-half → bottom-half, safe-area aware).
- **`readMarks` extension** — enumerate `content.items[].text` in item order for the strike marks, the way ADR-0031 extended `readMarks` to walk `content.messages[].text`. Generate one `strike` mark per `checked` item; static = progress pinned to 1, animated = the item's strike window drives draw-on; default mark color = the danger Role (`#c43d3c` under Syntax).
- **GUI parity (binding — ADR-0032):** a **Checklist** section in the SurfaceInspector (declared via `controls` on the renderer): edit item text (with marks), toggle `checked`, switch static↔animated, add/remove/reorder items, edit title, pick `chrome` mode. Per-item **timeline tracks** (`item:N`) so the animated strike clip drags to re-time the check-off beat; per-item strike **sound cue** surfaces on the Sound rail.
- **Preset linter (`preset-rubric.ts`)** — the checklist's half-frame rect honors read-window, title/action-safe margins, minimum legible item size, and frame-fit at both orientations (orientation-aware, no new taste rules).

## ADR required?

`yes`. New Surface variant (`checklist`), a new content shape (`items[]` with per-item completion state + strike timing), the reuse of `chrome` mode on a second Surface (generalizing ADR-0037's per-Surface asymmetry), and the completion-strike-as-marks concept all warrant a record. Trade-off framing to capture: **new Surface vs. a preset on `paper`** (chosen: a real Surface, because per-item `checked` + per-item strike timing + per-item timeline tracks + a GUI editor can't live in a single `body` bracket-tag string); and **hand-marker strike on chrome** as a declared, bounded exception to the Syntax hand-energy rule. Drafted by the Producer during `/author`.

## Open questions

_None — ready to `/author`._

## What 'done' looks like

- `src/lib/pipelines/surfaces/checklist/index.ts` — the renderer
- `src/lib/pipelines/surfaces/checklist/CanvasSource.svelte` — the DOM source
- `src/lib/pipelines/surfaces/checklist/identity.ts` — the Identity Spec (with probes)
- `src/lib/platform/engine-schema.ts` — `checklist` surface + `items[]` / `chrome` / `position` schema
- SurfaceInspector **Checklist** section + per-item timeline tracks + sound cues (GUI-agent parity)
- `docs/adr/<NNNN>-checklist-surface.md`
- `src/lib/presets/checklist-project-setup.json` (the `PROJECT SETUP` content above; `chrome: "card"` default) — the delete-trigger verification preset
- `/critic checklist-project-setup` returns **ACCEPT** at native 4K, verified at both orientations (horizontal right-half and vertical bottom-half) and both `chrome` modes (a `bare` render checked over footage/checkerboard for the transparency + legibility-shadow claim).
