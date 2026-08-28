---
description: Grill toward a GFX Brief at docs/briefs/<slug>.md — propose options from the Pack aesthetic doc (docs/packs/<pack>/aesthetic.md) and the Registry at every step
---

You are running a GFX Brainstorm session. The output is a `Brief` markdown file at `docs/briefs/<slug>.md`. This is **not** authoring — no JSON, no code; the Producer (`/author <slug>`) writes the artifacts afterward.

## Step 1 — resolve the slug

Parse `$ARGUMENTS` as a kebab-case slug.

- If `docs/briefs/<slug>.md` already exists: read it, summarize what's already captured, and **resume** from the first empty section. Do not restart the grill.
- If `src/lib/presets/<slug>.json` already exists: ask whether the user wants a new slug (a variant), a rewrite (confirm overwrite intent), or whether the slug is wrong. Do not proceed silently.
- If `$ARGUMENTS` is empty: ask the user for the slug. Do not invent one.

## Step 2 — bind to the docs

Read in this order before proposing anything:

1. `docs/briefs/README.md` — the template you're filling and the lifecycle.
2. `docs/CONTEXT.md` — terminology (Brief, Brainstorm, Producer, Critic).
3. `src/lib/platform/packs/registry.ts` — registered Pack slugs; there is no implicit default.
4. `docs/preset-format.md` — the schema the resulting Preset must satisfy.
5. `ls src/lib/presets/` — existing slugs and naming families.

After the Pack is selected, read `docs/packs/<pack>/aesthetic.md` before proposing Surfaces, motion, or chrome.

Do **not** load `docs/quality-rubric.md` or `docs/animation-rubric.md` — those are Critic-side concerns.

## Step 3 — drive the grill

Follow the protocol in `.claude/skills/brainstorm/SKILL.md` § Protocol. The agent stance is **active proposer**: at every decision point, surface 2–3 concrete options drawn from the selected `docs/packs/<pack>/aesthetic.md` and the existing Registry as `AskUserQuestion` previews, not open-ended prompts.

Section order is fixed:

1. Kind (`preset` | `pipeline` | `domain`) + `verification preset` if pipeline/domain
2. Pack (required slug from `PACK_REGISTRY`; never assume `syntax`)
3. Pitch
4. Surface(s) involved
5. Content sample (verbatim copy)
6. Motion plan (propose 2–3 combinations from `docs/packs/<pack>/aesthetic.md § Motion Vocabulary`)
7. Channel chrome notes (walk every signature element from the selected Pack)
8. Engine work required
9. ADR required?
10. Open questions sweep — resolve or capture
11. What 'done' looks like

Push back on:
- Anti-Aesthetic moves (cite the selected `docs/packs/<pack>/aesthetic.md § Anti-Aesthetic` line).
- Placeholder copy.
- Hand-waved motion ("smooth," "nice," "subtle") — name moves from the vocabulary.

Never ask whether the preset should be vertical or horizontal, or offer per-orientation / per-Pack variants — every Preset works in both orientations under every Pack (ADR-0039). Grill *how* it reflows, never *whether*.

## Step 4 — write the Brief

Write `docs/briefs/<slug>.md` matching the template in `docs/briefs/README.md`. Omit sections that are n/a for this Brief's `Kind` — don't keep them as "n/a" placeholders.

## Step 5 — hand off

End with this exact form:

```
Brief at docs/briefs/<slug>.md.
Open questions: <count>.
Next: /author <slug>   ← when open questions are 0.
```

Do **not** spawn the Producer yourself. The Brief is a written hand-off; `/author` (a fresh sub-agent) is the next step.
