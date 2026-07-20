---
name: brainstorm
description: Grill the user toward a Supers Brief at `docs/briefs/<slug>.md`. Propose options from the active Pack's aesthetic doc (`docs/packs/<pack>/aesthetic.md`) and the existing Registry at each decision point; never just passively capture. Use when the user wants to design a new Preset, Pipeline, or content domain — e.g. "let's brainstorm a tweet overlay," "we need a new pullquote variant," "/brainstorm <slug>". Do NOT use to author the Preset itself — hand off to `/author <slug>` once the Brief's "Open questions" is empty.
---

# Supers Brainstorm

The operational form of [ADR-0007](../../docs/adr/0007-brainstorm-brief-system.md). Drives the conversation that produces a [`Brief`](../../docs/briefs/README.md). The agent's stance is **active proposer** — surfaces 2–3 concrete options from `docs/packs/syntax/aesthetic.md` § Motion Vocabulary, the existing Registry, and `docs/inspo/` at every decision point, rather than passively recording user input.

## When this skill fires

- The user says "let's brainstorm X," "I want to design a new Preset / Pipeline / domain," "we should plan a new overlay," or similar pre-implementation framings.
- The user types `/brainstorm <slug>` (the slash command at `.claude/commands/brainstorm.md` calls this same workflow).
- The user is exploring options for a not-yet-shipped composition and has not yet committed to a JSON Preset.

Do **not** invoke this skill for:
- Authoring an already-briefed Preset (use `/author <slug>` instead — that spawns a fresh Producer sub-agent that reads the Brief).
- Verifying a shipped Preset (use `/critic <slug>`).
- Capturing a speculative idea that won't be built soon — that belongs in `docs/ideas/`, not `docs/briefs/`.

## Bind to these docs before grilling

Read in order, even if you "already know" them — the proposals you make at each stage cite specific sections:

1. `docs/briefs/README.md` — the template you're filling and the lifecycle invariant.
2. `docs/CONTEXT.md` — Brief, Producer, Critic, Brainstorm definitions.
3. `docs/packs/syntax/aesthetic.md` — Motion Vocabulary, Channel chrome, Surface Vocabulary, Anti-Aesthetic.
4. `docs/preset-format.md` — the `supers@1` schema you'll eventually have to satisfy.
5. `ls src/lib/presets/` — existing slugs (collision check) and family naming.
6. `docs/adr/` — quick scan for relevant decisions (e.g. ADR-0006 if it's a lower-third-shaped idea).

Do not load `docs/quality-rubric.md` or `docs/animation-rubric.md` during brainstorm — those are Critic-side. The brainstorm should propose moves that *will* pass them, not relitigate them.

## Non-negotiables — never put these to the user

- **One Preset, both orientations, every Pack.** Every Preset reflows across horizontal (3840×2160) and vertical (2160×3840) and renders under every Pack ([ADR-0039](../../docs/adr/0039-pack-neutral-compositions-and-listing-hygiene.md) deleted the per-orientation dupes for exactly this reason). Never ask "separate vertical and horizontal presets?" and never scope a Brief to one orientation or one Pack. What *is* worth grilling: **how** the composition reflows — stacking, safe-areas, focal-slot placement — where the vertical frame changes the geometry.
- **No hosting constraints.** Supers is local-only; never let deployment concerns (Cloudflare or otherwise) shape a Brief.

## Protocol

### Step 0 — slug and existence check

Parse `$ARGUMENTS` (or the user's prompt) as a kebab-case slug.

- If `docs/briefs/<slug>.md` exists: read it, summarize what's already captured, and resume from the first empty section. Do not restart.
- If `src/lib/presets/<slug>.json` exists: ask whether this is a variant (new slug needed), a rewrite (the existing preset is being reauthored — confirm before overwriting), or a misnamed slug.
- If no slug was given: ask, then proceed.

### Step 1 — kind

Resolve `Kind: preset | pipeline | domain` via AskUserQuestion. Frame the options concretely:

- `preset` — composes from the existing Registry. No engine code changes.
- `pipeline` — adds one new renderer to the Registry (a new Surface / Block / Annotation / Overlay / Effect). Requires a `verification preset` and likely an ADR.
- `domain` — a whole new content area that needs multiple Pipelines and Presets (e.g. "tweet overlays," "code-diff overlays"). Decomposes into child Briefs at the end of this session.

If `pipeline` or `domain`: also resolve `verification preset` (the slug that will gate the delete trigger). It can be a new slug that doesn't exist yet — you'll author it from the same Brief.

### Step 2 — pitch

Ask: "In one paragraph, what is this and why does it land for the channel?" Don't accept "it's a cool overlay" — push until the answer names *what* it shows and *why a Syntax.fm viewer would care*.

### Step 3 — Surface choice

For `kind: preset`:
- Read `docs/packs/syntax/aesthetic.md` § Surface Vocabulary. Propose 2–3 plausible Surfaces with their substrate + body type + channel chrome implications listed. Use AskUserQuestion with previews showing the trade-offs.
- If the user picks a Surface that doesn't currently have a Pipeline (rare), flip the brief to `kind: pipeline` and treat this preset as its verification preset.

For `kind: pipeline` / `kind: domain`:
- Ask which Surface(s) need to be added or extended, and why an existing one can't carry the idea.

### Step 4 — content sample

Ask for verbatim copy. For preset briefs, this becomes the Preset's `surface.content` and any overlay content. For pipeline / domain briefs, it's the content the verification preset will ship.

Push back on placeholder copy ("Lorem ipsum," "Some headline here"). The Producer will use this verbatim; vague copy produces vague Presets.

### Step 5 — motion plan (the heaviest grill section)

This is where the "agent proposes options" stance matters most. Don't ask "what motion?" — read `docs/packs/syntax/aesthetic.md` § Motion Vocabulary and propose 2–3 named combinations from the **lean-in** list, each as an AskUserQuestion option with a preview showing the timeline shape.

Example proposal shape:

```
(a) brightness-reveal + halo-bloom-up + focal-dim-others
    — past tail at full ink, active word brightens with warm halo,
    future tail at 35-40% ink. Reads as: spoken-content overlay.

(b) tear-on entry + stroke-draw highlighter + settled-place exit
    — paper enters with torn-edge wipe, marker draws across the
    focal phrase, card settles back. Reads as: editorial annotation.

(c) substrate-darken + halo-bloom-up + slow exit
    — substrate vignettes under the text, halo rises, text holds.
    Reads as: quiet emphasis on photographic frame.
```

If the user wants a **lean-out** move (typewriter pop-in, gaussian fade-in stamp, slide-from-edge card), say so explicitly and require a sentence of reasoning. Capture that reasoning in the Brief's "Channel chrome notes" section as an intentional deviation.

Name the **focal slot**(s) and the timeline shape (entry → reveal → exit beats).

### Step 6 — channel chrome notes

Walk `docs/packs/syntax/aesthetic.md` § Collage System and check each element off explicitly:

- Mono signature thread — present? where (kicker / source URL / date / watermark)?
- Hard offset shadow — present? offset px? color?
- Torn edge with white fiber — present?
- Registration jitter — present? on which marks?
- Grit overlay — present? (composition-wide via `effects.frame: paper-grain`)

For each omission, ask why. Either it's intentional (capture the reason — the Producer will land it in the Preset's `description` so the Critic doesn't re-flag it) or it's an oversight (add it).

### Step 7 — engine work required

For `kind: preset`: usually "none — composes from the existing Registry." Confirm by listing the Pipelines the brief will use (Surface, Block, Annotation styles, Overlay types, Effect types) and verifying each exists.

For `kind: pipeline` / `kind: domain`: enumerate the additions:
- New Pipeline file(s) under `src/lib/platform/pipelines/<layer>/<variant>/`
- Schema additions to `src/lib/platform/engine-schema.ts`
- Shader passes (reference [ADR-0005](../../docs/adr/0005-overlay-renderer-shader-pass.md) if it's overlay-shaped)
- New `Effect` types
- Etc.

### Step 8 — ADR required?

`yes | no | already-filed: <NNNN-slug>`. Default to `yes` if any of:
- This adds a new Layer variant.
- This changes a load-bearing convention (delete trigger, schema shape, registry layout).
- A future reader will wonder "why was it built this way?"

If `yes`, the Producer drafts the ADR during `/author`. Capture the *trade-off framing* in the Brief so the Producer doesn't have to re-derive it.

### Step 9 — open questions sweep

Re-read the Brief sections as written. List anything still ambiguous. For each:

- Resolve it now (ask one more AskUserQuestion).
- Or move it to "Open questions" in the Brief if the user genuinely wants to defer.

The Brief is **not** `ready to /author` while open questions remain. Tell the user explicitly: "Brief written with N open questions — resume `/brainstorm <slug>` when ready to close them."

### Step 10 — "what 'done' looks like"

Write the concrete deliverables block at the end of the Brief. For `kind: preset`:

```
src/lib/presets/<slug>.json Critic-ACCEPTs at native 4K.
```

For `kind: pipeline` / `kind: domain`:

```
- src/lib/platform/pipelines/<layer>/<variant>/index.ts (the renderer)
- src/lib/platform/pipelines/<layer>/<variant>/CanvasSource.svelte (if applicable)
- docs/adr/<NNNN>-<slug>.md
- src/lib/presets/<verification-slug>.json
- /critic <verification-slug> returns ACCEPT
```

### Step 11 — write the Brief

Write `docs/briefs/<slug>.md` using the template from `docs/briefs/README.md`. Order of sections is fixed; sections that are n/a for this Brief's kind get omitted (don't keep them as "n/a" — silence them).

### Step 12 — hand off

Tell the user:

```
Brief at docs/briefs/<slug>.md.
Open questions: <0 or N>.
Next: /author <slug>   ← when open questions are 0.
```

Do **not** start authoring in the same session — `/author` is a fresh Producer sub-agent for a reason ([ADR-0007](../../docs/adr/0007-brainstorm-brief-system.md), parallel to ADR-0001's framing-flip).

## House style for the grill

- **AskUserQuestion previews are the proposal mechanism.** Use them whenever there are 2–4 named options with concrete trade-offs. Show the timeline shape, the chrome composition, or the schema delta as ASCII in the preview.
- **One question at a time** — wait for the answer before moving to the next decision.
- **Cite the source doc** when proposing — `docs/packs/syntax/aesthetic.md § Motion Vocabulary`, `engine-architecture.md`, `ADR-0005`. The user should be able to verify your proposal against the binding doc.
- **Push back on Anti-Aesthetic moves** — if the user wants a pastel gradient, a gaussian shadow on the collage layer, or an axis-perfect rectangular card, name the `docs/packs/syntax/aesthetic.md § Anti-Aesthetic` line and ask if they're sure. Record the deviation reasoning in the Brief if they confirm.
- **Don't author code or JSON in this skill.** Briefs are markdown only. If you find yourself writing schema fragments, stop — that's the Producer's job.

## Anti-pattern: brainstorm becomes authoring

If the user says "just write it" mid-grill, don't. Finish the Brief first. The Producer sub-agent needs the Brief to be complete; partial briefs produce partial Presets. Acceptable response:

> "Holding off on authoring — Brief still has open questions in §5 (motion plan) and §7 (engine work). Once those land I'll write the Brief and you can `/author <slug>` for the actual JSON."
