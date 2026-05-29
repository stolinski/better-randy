---
description: Spawn a fresh Producer sub-agent to author the Preset (and any engine work) declared by docs/briefs/<slug>.md
---

You are coordinating a Hiviz Producer run. The Producer reads `docs/briefs/<slug>.md` with fresh context and authors the artifacts the Brief declares. You do **not** author in this session — only the spawned sub-agent does.

## Step 1 — resolve the target Brief

Parse `$ARGUMENTS` as the Brief's slug.

- Verify `docs/briefs/<slug>.md` exists. If not, check whether `src/lib/presets/<slug>.json` exists:
  - If the preset JSON exists but the Brief doesn't, the slug refers to a *pre-Brief preset* (grandfathered, see `docs/briefs/README.md` § Pre-Brief presets). Stop and tell the user: "`<slug>` is a pre-Brief preset — `/author` requires a Brief. If you want to rewrite it, run `/brainstorm <slug>` first to create one. For a `/critic` REVISE fix, edit the JSON directly without `/author`."
  - If neither exists, list available Briefs from `docs/briefs/*.md` (excluding `README.md`) and stop.
- Read the Brief. If `## Open questions` contains any items, stop and tell the user: "Brief has N open question(s) — resume `/brainstorm <slug>` before authoring." Do not proceed.
- Note the Brief's `Kind:` and (for `pipeline` / `domain`) `Verification preset:` — these go into the spawn prompt.

If `$ARGUMENTS` is empty: list available Briefs and stop.

## Step 2 — spawn the Producer

Use the **Agent tool** with `subagent_type: "general-purpose"` and the prompt below verbatim, substituting `<slug>`. **Do not** include any of the current conversation as context — the Producer must run with a fresh framing (parallel to the Critic's framing-flip per [ADR-0001](../../docs/adr/0001-critic-sub-agent-verification.md) and [ADR-0007](../../docs/adr/0007-brainstorm-brief-system.md)).

```
You are the Hiviz Producer for the Brief at `docs/briefs/<slug>.md`.

Read these docs in order before writing anything:

1. docs/briefs/<slug>.md — your authoritative direction. Treat every
   section as binding. Intentional deviations are already captured in
   "Channel chrome notes" and must land in the Preset's `description`
   field so the Critic doesn't re-flag them.
2. docs/briefs/README.md — the lifecycle and invariant you sit inside.
3. docs/CONTEXT.md — terminology.
4. docs/preset-format.md — the `hiviz@1` schema you must satisfy.
5. docs/engine-architecture.md — only if Brief's `Kind:` is `pipeline`
   or `domain`.
6. docs/aesthetic.md — channel chrome, palette, type, motion vocabulary.

Then author the artifacts the Brief's "What 'done' looks like" section
declares. For each:

- Preset JSON: write to `src/lib/presets/<slug>.json` (or the verification-
  preset slug for pipeline/domain Briefs). Validate by running
  `node --experimental-strip-types scripts/verify-presets.ts` — if it
  errors, fix the JSON, do not loosen the schema.
- Pipeline code: write under `src/lib/platform/pipelines/<layer>/<variant>/`
  following the existing renderer pattern. Strict TypeScript, no `any`,
  explicit return types on exports.
- ADR: if the Brief's `ADR required?` is `yes`, draft
  `docs/adr/<next-number>-<slug>.md` mirroring existing ADRs (decision
  paragraph, considered-options list with rejected reasons, consequences
  paragraph).
- Schema additions: if needed, update `src/lib/platform/engine-schema.ts`
  and regenerate the JSON schema with
  `node --experimental-strip-types scripts/export-preset-schema.ts`.

Constraints, all binding:

- Transparent output: never paint an opaque canvas background.
  `loadOp: 'clear'` with `clearValue: [0, 0, 0, 0]`; canvas context
  `alphaMode: 'premultiplied'`.
- Frame-determinism: drive animation from explicit `timestamp` / `frame`.
- Native resolution: 3840×2160 or 2160×3840. No upscaling.
- No TODOs, placeholder content, no-op stubs.
- No new utility folders. Shared helpers in `src/lib/utils/`.
- Don't start a dev server — one runs at http://localhost:5173.

Do NOT:
- Verify the result against the rubrics. That's the Critic's job.
- Delete `docs/briefs/<slug>.md`. The delete trigger is Critic ACCEPT.
- Edit `docs/briefs/<slug>.md`. The Brief is frozen at hand-off.

Output: a short report listing every file you wrote or modified, and the
recommended next step (typically `/critic <slug>` or, for pipeline/domain
Briefs, `/critic <verification-slug>`).
```

## Step 3 — surface the report

Present the sub-agent's returned report to the user verbatim. Then add:

```
Authored: <paths from sub-agent report>
Next: /critic <verification-slug>
Brief stays at docs/briefs/<slug>.md until Critic returns ACCEPT.
```

Do **not** spawn the Critic yourself.

## Re-authoring after Critic REVISE

If the Brief is still in `docs/briefs/` and the user has a Critic report with `preset-choice` or `aesthetic-miss` findings, `/author` can be invoked again. Include the Critic report inline in the spawn prompt under a `## Critic findings to address` section. The Producer applies the findings (preset-choice + aesthetic-miss only) and stops; `pipeline-bug` and `default-too-permissive` findings halt the Producer (R8 binds — fix the code, not the Preset).

If the Critic returned `IMPLEMENTATION-FIX-REQUIRED`, do **not** spawn the Producer. Tell the user the engine work is upstream of authoring.
