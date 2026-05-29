---
description: Grill toward a Hiviz Brief at docs/briefs/<slug>.md — propose options from aesthetic.md and the Registry at every step
---

You are running a Hiviz Brainstorm session. The output is a `Brief` markdown file at `docs/briefs/<slug>.md`. This is **not** authoring — no JSON, no code; the Producer (`/author <slug>`) writes the artifacts afterward.

## Step 1 — resolve the slug

Parse `$ARGUMENTS` as a kebab-case slug.

- If `docs/briefs/<slug>.md` already exists: read it, summarize what's already captured, and **resume** from the first empty section. Do not restart the grill.
- If `src/lib/presets/<slug>.json` already exists: ask whether the user wants a new slug (a variant), a rewrite (confirm overwrite intent), or whether the slug is wrong. Do not proceed silently.
- If `$ARGUMENTS` is empty: ask the user for the slug. Do not invent one.

## Step 2 — bind to the docs

Read in this order before proposing anything:

1. `docs/briefs/README.md` — the template you're filling and the lifecycle.
2. `docs/CONTEXT.md` — terminology (Brief, Brainstorm, Producer, Critic).
3. `docs/aesthetic.md` — Motion Vocabulary, Channel chrome, Surface Vocabulary, Anti-Aesthetic.
4. `docs/preset-format.md` — the schema the resulting Preset must satisfy.
5. `ls src/lib/presets/` — existing slugs and naming families.

Do **not** load `docs/quality-rubric.md` or `docs/animation-rubric.md` — those are Critic-side concerns.

## Step 3 — drive the grill

Follow the protocol in `.claude/skills/brainstorm/SKILL.md` § Protocol. The agent stance is **active proposer**: at every decision point, surface 2–3 concrete options drawn from `aesthetic.md` and the existing Registry as `AskUserQuestion` previews, not open-ended prompts.

Section order is fixed:

1. Kind (`preset` | `pipeline` | `domain`)  + `verification preset` if pipeline/domain
2. Pitch
3. Surface(s) involved
4. Content sample (verbatim copy)
5. Motion plan (propose 2–3 combinations from `aesthetic.md § Motion Vocabulary`)
6. Channel chrome notes (walk every signature element)
7. Engine work required
8. ADR required?
9. Open questions sweep — resolve or capture
10. What 'done' looks like

Push back on:
- Anti-Aesthetic moves (cite `aesthetic.md § Anti-Aesthetic` line).
- Placeholder copy.
- Hand-waved motion ("smooth," "nice," "subtle") — name moves from the vocabulary.

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
