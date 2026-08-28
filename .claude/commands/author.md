---
description: Spawn a fresh Producer sub-agent to author the Preset (and any engine work) declared by docs/briefs/<slug>.md
---

You are coordinating a GFX Producer run. The Producer reads `docs/briefs/<slug>.md` with fresh context and authors the artifacts the Brief declares. You do **not** author in this session — only the spawned sub-agent does. Critic output cannot retire the Brief; retirement is a classified Delivery change.

## Step 1 — resolve the target Brief

Parse `$ARGUMENTS` as the Brief's slug.

- Verify `docs/briefs/<slug>.md` exists. If not, check whether `src/lib/presets/<slug>.json` exists:
  - If the preset JSON exists but the Brief doesn't, the slug refers to a _pre-Brief preset_ (grandfathered, see `docs/briefs/README.md` § Pre-Brief presets). Stop and tell the user: "`<slug>` is a pre-Brief preset — `/author` requires a Brief. If you want to rewrite it, run `/brainstorm <slug>` first. Human-selected advisory observations can be handled as a separately classified change without `/author`."
  - If neither exists, list available Briefs from `docs/briefs/*.md` (excluding `README.md`) and stop.
- Read the Brief. If `## Open questions` contains any items, stop and tell the user: "Brief has N open question(s) — resume `/brainstorm <slug>` before authoring." Do not proceed.
- Note the Brief's required `Pack:`, its `Kind:`, and (for `pipeline` / `domain`) `Verification preset:`. Stop if the Pack is absent or not registered in `PACK_REGISTRY`; these values go into the spawn prompt.

If `$ARGUMENTS` is empty: list available Briefs and stop.

## Step 2 — spawn the Producer

Use the **Agent tool** with `subagent_type: "general-purpose"` and the prompt below verbatim, substituting `<slug>` and `<pack>` from the Brief metadata. **Do not** include any of the current conversation as context — the Producer must run with a fresh framing (parallel to the Critic's framing-flip per [ADR-0001](../../docs/adr/0001-critic-sub-agent-verification.md) and [ADR-0007](../../docs/adr/0007-brainstorm-brief-system.md)).

```
You are the GFX Producer for the Brief at `docs/briefs/<slug>.md`.

Read these docs in order before writing anything:

1. docs/briefs/<slug>.md — your authoritative direction. Treat every
   section as binding. Intentional deviations are already captured in
   "Channel chrome notes" and must land in the Preset's `description`
   field so the Critic doesn't re-flag them.
2. docs/briefs/README.md — the lifecycle and invariant you sit inside.
3. docs/CONTEXT.md — terminology.
4. docs/preset-format.md — the `gfx@1` schema you must satisfy.
5. docs/engine-architecture.md — only if Brief's `Kind:` is `pipeline`
   or `domain`.
6. docs/packs/<pack>/aesthetic.md — channel chrome, palette, type, motion vocabulary (the Brief's declared pack; the legacy `docs/aesthetic.md` is a redirect stub).

Then author the artifacts the Brief's "What 'done' looks like" section
declares. For each:

- Preset JSON: write to `src/lib/presets/<slug>.json` (or the verification-
  preset slug for pipeline/domain Briefs). Validate by running
  `npm run verify-presets` — if it
  errors, fix the JSON, do not loosen the schema.
- Pipeline code: write under `src/lib/pipelines/<layer>/<variant>/`
  following the existing renderer pattern. Strict TypeScript, no `any`,
  explicit return types on exports.
- ADR: if the Brief's `ADR required?` is `yes`, draft
  `docs/adr/<next-number>-<slug>.md` mirroring existing ADRs (decision
  paragraph, considered-options list with rejected reasons, consequences
  paragraph).
- Schema additions: if needed, update `src/lib/platform/engine-schema.ts`
  and regenerate the JSON schema with `npm run gen:schema`.

Constraints, all binding:

- Transparency is the default. Keep `loadOp: 'clear'`, `clearValue:
  [0, 0, 0, 0]`, and canvas `alphaMode: 'premultiplied'`; paint to the frame
  edges only when the composition declares a full-frame fill or stage.
- Frame-determinism: drive animation from explicit `timestamp` / `frame`.
- Native resolution: 3840×2160 or 2160×3840. No upscaling.
- No TODOs, placeholder content, no-op stubs.
- No new utility folders. Shared helpers in `src/lib/utils/`.
- Don't start a dev server — one runs at http://localhost:7263.

Do NOT:
- Claim verification. The deterministic Delivery matrix owns objective verification, and exact-evidence human approval owns subjective acceptance.
- Delete `docs/briefs/<slug>.md`. Retirement is a separate classified Delivery change.
- Edit `docs/briefs/<slug>.md`. The Brief is frozen at hand-off.

Output: a short report listing every file you wrote or modified, and the
deterministic Delivery verification target (the Preset slug or, for
pipeline/domain Briefs, the declared verification slug).
```

## Step 3 — surface the report

Present the sub-agent's returned report to the user verbatim. Then add:

```
Authored: <paths from sub-agent report>
Next: run deterministic Delivery verification for <verification-slug>; invoke /critic only if a human wants advisory observations.
Brief stays at docs/briefs/<slug>.md until its declared boundary is retired through Delivery.
```

Do **not** spawn the Critic yourself.

## Re-authoring with advisory Critic observations

If the Brief is still in `docs/briefs/` and the human explicitly chooses named `preset-choice` or `aesthetic-miss` observations to address, `/author` can be invoked again. Include only those selected observations inline in the spawn prompt under a `## Human-selected Critic observations to address` section. The Producer applies the selected Preset observations and stops; suspected `pipeline-bug` and `default-too-permissive` observations are not authoring instructions (R8 binds — do not hide a pipeline defect in the Preset).

Critic prose never decides whether to spawn the Producer. Verified deterministic failures and exact-evidence human decisions own Delivery routing.
