# Fixer sub-agent for Critic findings

**Status:** open design question. Surfaced 2026-05-14 after the first real `/critic` run.

## The question

Should the Critic loop end with a human routing findings, or should a **Fixer sub-agent** apply the data-side fixes automatically and re-run the Critic until ACCEPT?

## Sketch of the Fixer

If we build it, the Fixer would:

- Receive: a Critic report (JSON or structured markdown) + the Preset under review + the same rubric docs.
- Be scoped narrowly: only act on findings classified as `preset-choice` or `aesthetic-miss`. The other three classifications are deliberately left untouched:
  - `pipeline-bug` → human / code session (R8 binds).
  - `default-too-permissive` → batched human engine-default sprint (ADR-0001).
  - `rubric-gap` → doc work for the user.
- Apply each in-scope finding's suggested fix to the Preset JSON, one by one.
- Optionally re-spawn the Critic for a second pass and stop on ACCEPT or after N iterations.

## Why this is *not* "build it now"

1. **The Critic isn't trusted yet.** Only one probe shipped on day one; without numeric backing for R1-R5, a Fixer acting on Critic findings could chase ghosts. Probes need to come first.
2. **The taxonomy is the whole point.** Auto-applying `preset-choice` and `aesthetic-miss` fixes preserves the human-routing of code-side findings, which is good — but if the *classification* itself is noisy, the Fixer will misroute. We need a few more `/critic` runs to see whether the labels stay sharp across diverse Presets.
3. **Aesthetic-miss is judgment work.** "Add channel chrome" can mean a dozen different visual moves; a Fixer that picks one wrong reads as confidently bad.
4. **Premature automation kills introspection.** When a human reads the Critic report and decides what to do, the system gets a free quality signal. Auto-fixing skips that.

## What would unblock building it

- The remaining probe scripts in place (`probe-banding`, `probe-text-edge`, `probe-edge-aa`, `probe-hue-count`, `probe-ink-coverage` all done).
- 4+ `/critic` runs across 4+ different Presets, with the classification labels holding up.
- An explicit ACCEPT threshold: e.g. "Fixer stops when ≥ 80% of `preset-choice` findings have been applied and a second Critic pass shows ≤ 2 remaining."
- A bounded iteration count (no infinite loops).

## Open sub-questions

- Same agent or fresh sub-agent? Probably fresh per ADR-0001's logic on framing — but Fixer is "fix the JSON," not "be a critic," so anchoring is less of a hazard.
- Does the Fixer write to the Preset directly, or produce a diff for the user to review? Probably diff first; direct writes after we trust it.
- Where does the Fixer live? `.claude/skills/fixer/SKILL.md` plus a `/fix` slash command, mirroring the Critic's shape.

## When this lands

Not before the probe set is complete and we have data across 4+ Presets. Estimate: a session or two after probes ship, once we've actually seen what the Critic finds on real work.
