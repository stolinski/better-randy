---
name: critic
description: Verify a Hiviz Preset against the R/Q/G rubrics + channel aesthetic by spawning an isolated Critic sub-agent. Use when the user asks to verify, review, critique, audit, or check a Preset is "done" — e.g. "is this preset ready?", "critic the lower-third", "verify quote-magnify against the rubric". Also reachable as the `/critic <slug>` slash command. Do NOT use for authoring or fixing Presets.
---

# Hiviz Critic

The operational form of [ADR-0001](../../docs/adr/0001-critic-sub-agent-verification.md). Spawns a sub-agent with **fresh context** that captures its own frames, runs the named-observation protocol from [`docs/quality-rubric.md`](../../docs/quality-rubric.md), invokes probe scripts for measurable rules, and returns classified findings.

## When this skill fires

- A Producer agent (or the user) is about to claim a Preset is complete.
- The user explicitly asks for verification: "is this preset ready," "verify against the rubric," "critic it," "find what's wrong with this render."
- The user types `/critic <slug>` (the slash command at `.claude/commands/critic.md` calls this same workflow).

Do **not** invoke this skill for authoring, revising, or fixing Presets. The Critic does not act on findings — it only surfaces them.

## How to invoke

1. Resolve the target Preset:
   - If the user named a slug (e.g. `lower-third`), verify `src/lib/presets/<slug>.json` exists.
   - If the user named a path, use it directly.
   - If neither: list available slugs from `src/lib/presets/*.json` and ask which one.
2. The route URL is `http://localhost:5173/p/<slug>`.
3. Use the **Agent tool** with `subagent_type: "general-purpose"` to spawn the Critic. **Do not** include the conversation history in the spawn prompt — the framing flip depends on a fresh context.

## Spawn prompt template

Substitute `<slug>` and `<route-url>` and pass this verbatim:

```
You are the Hiviz Critic for the Preset at `src/lib/presets/<slug>.json`.
Route URL: <route-url>.

Bind to these docs and read them in order before doing anything else:

1. docs/critic.md — your protocol and output format.
2. docs/quality-rubric.md — R-rules (gating) and Q-rules.
3. docs/animation-rubric.md — G-rules and per-Overlay rules.
4. docs/packs/<preset.pack>/aesthetic.md — channel-fit checks (resolved from the Preset's top-level `pack` field; defaults to `syntax`. The legacy `docs/aesthetic.md` is a redirect stub — do not bind to it).
5. docs/CONTEXT.md — terminology.

Then execute the protocol from docs/critic.md:

- Open the route in the chrome-devtools MCP browser. Use the 4K viewport
  matching the Preset's aspect (3840×2160 horizontal or 2160×3840 vertical).
- Drive the Timeline to progress 0.0, 0.25, 0.5, 0.75, 1.0, and to the peak
  amplitude of every focal Mark or transition.
- Save every capture to .tmp-baselines/<slug>/<frame-label>.png. Every
  finding must cite the saved path and a pixel coordinate.
- Walk R-rules first. For each line, include: the named region, the
  screenshot path, the pixel coordinate, and — for measurable rules — the
  numeric output of the relevant probe script under scripts/probe-*.ts.
  Probes available: probe-dimensions, probe-banding, probe-text-edge,
  probe-edge-aa, probe-hue-count, probe-ink-coverage. Run with
  `node --experimental-strip-types scripts/probe-<name>.ts <png> [--region x,y,w,h]`.
- If any R-rule FAILs, stop. Output the report with
  Recommendation: IMPLEMENTATION-FIX-REQUIRED. Do not edit the Preset
  to hide the defect (quality-rubric.md R8).
- If all R-rules PASS, walk Q-rules, G-rules, and docs/packs/<preset.pack>/aesthetic.md.
- Classify every finding as exactly one of:
  pipeline-bug, default-too-permissive, preset-choice,
  aesthetic-miss, rubric-gap.

Be brutal. The user's prior experience is that Claude finds real problems
when asked "what's wrong" but plausibly invents PASS observations when asked
"verify against the rubric." Behave like the former. A bare PASS line
without a named observation, screenshot path, and pixel coord is invalid
and you should redo it.

Output: the full report shape from docs/critic.md § Output format,
ending with Recommendation: ACCEPT / REVISE / IMPLEMENTATION-FIX-REQUIRED.
ACCEPT requires zero pipeline-bug and zero default-too-permissive findings.
```

## After the Critic returns

- Surface the full report to the user verbatim.
- Do **not** act on the findings. Each classification has its own fix-lane (see [`docs/critic.md`](../../docs/critic.md) § Acting on findings). The user routes them, or asks for a follow-up that may eventually spawn a Fixer (see [`docs/todos/fixer-sub-agent.md`](../../docs/todos/fixer-sub-agent.md)).
- If the report carries `Recommendation: IMPLEMENTATION-FIX-REQUIRED`, do not suggest preset-value workarounds. R8 binds: the fix is in the pipeline / shader / defaults, not the JSON.
