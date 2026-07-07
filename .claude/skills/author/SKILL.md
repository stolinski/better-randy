---
name: author
description: Spawn a fresh Producer sub-agent that reads a Supers Brief and writes the Preset (plus any Pipeline / ADR the Brief declares). Use when the user has a `docs/briefs/<slug>.md` with no open questions and says "author it," "write the preset," or types `/author <slug>`. Do NOT use to brainstorm a Brief (use `/brainstorm`) or to verify the result (use `/critic`).
---

# Supers Author

The operational form of [ADR-0007](../../docs/adr/0007-brainstorm-brief-system.md)'s Producer hand-off. Spawns a sub-agent with **fresh context** that reads `docs/briefs/<slug>.md` and authors the artifacts the Brief declares. The Brief stays in `docs/briefs/` after authoring — only `/critic` returning `ACCEPT` triggers its deletion.

## When this skill fires

- The user types `/author <slug>` (the slash command at `.claude/commands/author.md` calls this same workflow).
- The user has just finished a `/brainstorm` and says "go author it," "write it," "make it."
- The user points at an existing `docs/briefs/<slug>.md` and asks for the implementation.

Do **not** invoke this skill if:
- `docs/briefs/<slug>.md` doesn't exist (run `/brainstorm <slug>` first).
- The Brief has remaining items in `## Open questions` (resume `/brainstorm <slug>` first).
- The user wants to *verify* a Preset (use `/critic <slug>`).
- The user wants to *fix* a Critic finding on an existing Preset (the Brief is still live; this skill handles fix-loops too, but only when there's a live Brief).

## How to invoke

### Step 1 — resolve the target Brief

Parse `$ARGUMENTS` as the Brief's slug.

- Verify `docs/briefs/<slug>.md` exists. If it doesn't:
  - If `src/lib/presets/<slug>.json` exists, the slug is a *pre-Brief preset* (see [`docs/briefs/README.md`](../../docs/briefs/README.md) § Pre-Brief presets). Stop and tell the user that `/author` requires a Brief; suggest `/brainstorm <slug>` for a rewrite, or direct JSON edits for a `/critic` REVISE fix.
  - Otherwise, list available Briefs from `docs/briefs/*.md` (excluding `README.md`) and stop.
- Read the Brief. If `## Open questions` has any items, stop and tell the user: "Brief has N open questions — resume `/brainstorm <slug>` before authoring."
- Note the Brief's `Kind:` and (for `pipeline` / `domain`) `Verification preset:`.

### Step 2 — spawn the Producer

Use the **Agent tool** with `subagent_type: "general-purpose"`. **Do not** pass the current conversation as context. The Producer reads only the Brief plus the binding docs.

### Spawn prompt template

Substitute `<slug>`, `<kind>`, and (when applicable) `<verification-slug>`:

```
You are the Supers Producer for the Brief at `docs/briefs/<slug>.md`.

Read these docs in order before writing anything:

1. docs/briefs/<slug>.md — your authoritative direction. Treat every
   section as binding; intentional deviations are already captured in
   "Channel chrome notes" and must land in the Preset's `description`
   field so the Critic doesn't re-flag them.
2. docs/briefs/README.md — the lifecycle and invariant you sit inside.
3. docs/CONTEXT.md — terminology. Use these terms precisely.
4. docs/preset-format.md — the `supers@1` schema you must satisfy.
5. docs/engine-architecture.md — pipeline registry shape, only if Brief's
   `Kind:` is `pipeline` or `domain`.
6. docs/packs/<pack>/aesthetic.md — channel chrome, palette, type, motion
   vocabulary, resolved from the Brief's declared pack (the legacy
   `docs/aesthetic.md` is a redirect stub — do not bind to it).
   You should not need to deviate; if you do, capture the reason in the
   Preset's `description`.

Then author the artifacts the Brief's "What 'done' looks like" section
declares. For each:

- Preset JSON: write to `src/lib/presets/<slug>.json`. Validate by running
  `node --experimental-strip-types scripts/verify-presets.ts` — if it
  errors, fix the JSON, do not loosen the schema.
- Pipeline code: write under `src/lib/platform/pipelines/<layer>/<variant>/`
  following the existing renderer pattern (see, e.g., the lower-third
  overlay pipeline for the OverlayRenderer + shaderPass shape from
  ADR-0005). Strict TypeScript, no `any`, explicit return types on exports.
- ADR: if the Brief's `ADR required?` field is `yes`, draft
  `docs/adr/<next-number>-<slug>.md` mirroring the format of existing ADRs
  (one paragraph statement of the decision, considered-options list with
  rejected reasons, consequences paragraph).
- Schema additions: if the Brief calls for new schema, update
  `src/lib/platform/engine-schema.ts` and regenerate the JSON schema with
  `node --experimental-strip-types scripts/export-preset-schema.ts`.

Constraints, all binding:

- Transparent output: never paint an opaque canvas background. `loadOp:
  'clear'` with `clearValue: [0, 0, 0, 0]`; canvas context
  `alphaMode: 'premultiplied'`.
- Frame-determinism: drive animation from explicit `timestamp` / `frame`.
  No wall-clock.
- Native resolution: 3840×2160 or 2160×3840. No upscaling.
- No TODOs, placeholder content, or no-op stubs. Wire it now or the work
  isn't done.
- No new utility folders. Shared helpers go in `src/lib/utils/`.
- Don't start a dev server — one runs at http://localhost:5173.

Do NOT:
- Verify the result against the rubrics. That's the Critic's job.
- Delete the Brief. The delete trigger is Critic ACCEPT, not authoring
  completion.
- Edit `docs/briefs/<slug>.md`. The Brief is frozen at hand-off; if the
  Brief is wrong, stop and tell the orchestrator.

Output: a short report listing every file you wrote or modified, and
the recommended next step (typically `/critic <slug>` or, for
pipeline/domain Briefs, `/critic <verification-slug>`).
```

### Step 3 — surface the Producer's report

Present the sub-agent's returned report to the user verbatim. Then tell the user the next step:

```
Authored: <list of paths>
Next: /critic <verification-slug>
Brief stays at docs/briefs/<slug>.md until Critic returns ACCEPT.
```

Do **not** spawn the Critic yourself. The user (or a future Fixer skill, see [`docs/todos/fixer-sub-agent.md`](../../docs/todos/fixer-sub-agent.md)) drives that step.

## Re-authoring after a Critic REVISE

If the Brief is still in `docs/briefs/` (which it is, until ACCEPT), `/author` can be re-invoked to apply Critic findings:

- The Producer sub-agent re-reads the Brief plus the latest Critic report (pass the report inline in the spawn prompt under a "Critic findings to address" section).
- Producer applies only `preset-choice` and `aesthetic-miss` fixes by adjusting the Preset JSON. `pipeline-bug` and `default-too-permissive` findings halt — they require code work, not authoring (quality-rubric.md R8 binds).
- Producer does not edit the Brief itself.

If the Critic returned `IMPLEMENTATION-FIX-REQUIRED`, do **not** spawn the Producer. Tell the user the engine work is upstream of authoring; the Brief stays put while the fix lands, then `/author` resumes.

## Anti-pattern: same-session producer

Never author from the Brief in the *current* conversation (i.e. without spawning a sub-agent). The fresh-context Producer is load-bearing per [ADR-0007](../../docs/adr/0007-brainstorm-brief-system.md) — same logic as the Critic's framing flip. If you're tempted to "just write the JSON quickly," stop and spawn the sub-agent.
