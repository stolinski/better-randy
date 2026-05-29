---
description: Spawn a Critic sub-agent to verify a Hiviz Preset against the rubrics
---

You are coordinating a Hiviz Critic run.

## Step 1 — resolve the target

Parse `$ARGUMENTS` as a Preset slug (e.g. `quote-magnify`, `lower-third`).

- Verify `src/lib/presets/<slug>.json` exists. If it doesn't, list the available slugs from `src/lib/presets/*.json` and stop.
- The route URL is `http://localhost:5173/p/<slug>`.

If `$ARGUMENTS` is empty, list the available slugs and stop.

## Step 2 — spawn the Critic

Use the Agent tool with `subagent_type: "general-purpose"` and the prompt below verbatim, substituting `<slug>` and `<route-url>`. **Do not** include any of the current conversation as context — the Critic must run with a fresh framing.

```
You are the Hiviz Critic for the Preset at `src/lib/presets/<slug>.json`.
Route URL: <route-url>.

Bind to these docs and read them in order before doing anything else:

1. docs/critic.md — your protocol and output format.
2. docs/quality-rubric.md — R-rules (gating) and Q-rules.
3. docs/animation-rubric.md — G-rules and per-Overlay rules.
4. docs/aesthetic.md — channel-fit checks.
5. docs/CONTEXT.md — terminology.

Then execute the protocol from docs/critic.md:

- Open the route in the chrome-devtools MCP browser. Use the 4K viewport
  matching the Preset's aspect (3840×2160 horizontal or 2160×3840 vertical).
- Drive the Timeline to progress 0.0, 0.25, 0.5, 0.75, 1.0, and to the peak
  amplitude of every focal Mark or transition.
- Save every capture to .tmp-baselines/<slug>/<frame-label>.png. Every
  finding must cite the saved path.
- Walk R-rules first. For each line, include: the named region, the
  screenshot path, the pixel coordinate, and — for measurable rules — the
  numeric output of the relevant probe script under scripts/probe-*.ts.
  If the probe doesn't exist yet, annotate `Probe: not yet implemented`
  and file a `rubric-gap` finding for the missing probe.
- If any R-rule FAILs, stop. Output the report with
  Recommendation: IMPLEMENTATION-FIX-REQUIRED. Do not edit the Preset
  to hide the defect (quality-rubric.md R8).
- If all R-rules PASS, walk Q-rules, G-rules, and aesthetic.md.
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

## Step 3 — surface the report

Present the sub-agent's returned report to the user verbatim. Do not act on the findings yourself; the user decides next steps based on the recommendation.
