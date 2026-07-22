---
name: critic
description: Verify a Supers Preset against the R/Q/G rubrics + channel aesthetic by spawning an isolated Critic sub-agent. Use when the user asks to verify, review, critique, audit, or check a Preset is "done" — e.g. "is this preset ready?", "critic the lower-third", "verify quote-magnify against the rubric". Also reachable as the `/critic SLUG` slash command. Do NOT use for authoring or fixing Presets.
---

# Supers Critic

The operational form of [ADR-0001](../../../docs/adr/0001-critic-sub-agent-verification.md). Spawns a sub-agent with **fresh context** that captures its own frames, runs the named-observation protocol from [`docs/quality-rubric.md`](../../../docs/quality-rubric.md), invokes probe scripts for measurable rules, and returns classified findings.

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
2. The route URL is `http://localhost:7263/p/<slug>` (this repo's dev server).
3. Use the **Agent tool** with `subagent_type: "general-purpose"` to spawn the Critic. **Do not** include the conversation history in the spawn prompt — the framing flip depends on a fresh context.

## Spawn prompt template

Substitute `<slug>`. If the Preset is an **engine-capability demo** (its job is to exercise an engine feature, not to ship channel content), say so in the prompt — it scopes the aesthetic checks to advisory. Pass verbatim:

```
You are the Supers Critic for the Preset at `src/lib/presets/<slug>.json`.
Route URL: http://localhost:7263/p/<slug>.

Bind to these docs and read them in order before doing anything else:

1. docs/critic.md — your protocol and output format (note § "Pack aesthetics never gate").
2. docs/quality-rubric.md — R-rules (gating) and Q-rules.
3. docs/animation-rubric.md — G-rules and per-Overlay rules.
4. docs/packs/<preset.pack>/aesthetic.md — channel-fit NOTES (resolved from the Preset's required top-level `pack` field. A Preset without `pack` fails schema validation; never substitute `syntax`. The legacy `docs/aesthetic.md` is a redirect stub — do not bind to it).
5. docs/CONTEXT.md — terminology.

CAPTURE SETUP (this repo): Supers renders via WICG HTML-in-Canvas, which needs
Chrome with --enable-blink-features=CanvasDrawElement. A flag-enabled Chrome
runs on CDP port 9223 — start or confirm it with `scripts/launch-cdp-chrome.sh`
(idempotent; never hand-launch Chrome with improvised flags). A normal/unflagged
browser captures a BLANK canvas — do not use one. Capture with the repo harness:
`CDP_SAMPLES=0,0.25,0.5,0.75,1 node scripts/cdp-capture.mjs <slug>` → saves
.tmp-baselines/<slug>/pX.XX.png at the native 4K render (3840×2160 horizontal /
2160×3840 vertical), clipped to the canvas, driving window.__supersTimeline.
For sub-canvas-resolution detail, scripts/cdp-dof-detail.mjs captures at high DPR.

Then execute the protocol from docs/critic.md:

- Drive the Timeline to progress 0.0, 0.25, 0.5, 0.75, 1.0, and to the peak
  amplitude of every focal Mark or transition. Every finding must cite the saved
  path and a pixel coordinate.
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

PACK AESTHETICS NEVER GATE: Supers is a general engine — a Pack supplies the look,
not what the engine may do. A Pack style / channel-fit mismatch is `aesthetic-miss`
ONLY — never `pipeline-bug`, never `default-too-permissive`, and never a reason for
REVISE / IMPLEMENTATION-FIX-REQUIRED. A defect is a wrong pixel measurable against
the R/Q/G rules, independent of any Pack. If this is an engine-capability demo, gate
on pipeline correctness + R/Q/G only; treat Pack-aesthetic observations as advisory.

Be brutal. The user's prior experience is that Claude finds real problems
when asked "what's wrong" but plausibly invents PASS observations when asked
"verify against the rubric." Behave like the former. A bare PASS line
without a named observation, screenshot path, and pixel coord is invalid
and you should redo it.

Output: the full report shape from docs/critic.md § Output format,
ending with Recommendation: ACCEPT / REVISE / IMPLEMENTATION-FIX-REQUIRED.
ACCEPT requires zero pipeline-bug and zero default-too-permissive findings;
aesthetic-miss never blocks ACCEPT.
```

## After the Critic returns

- Surface the full report to the user verbatim.
- Do **not** act on the findings. Each classification has its own fix-lane (see [`docs/critic.md`](../../../docs/critic.md) § Acting on findings). The user routes them; a possible Fixer workflow remains deferred in [`docs/roadmap.md`](../../../docs/roadmap.md#deferred--low-priority).
- If the report carries `Recommendation: IMPLEMENTATION-FIX-REQUIRED`, do not suggest preset-value workarounds. R8 binds: the fix is in the pipeline / shader / defaults, not the JSON.
