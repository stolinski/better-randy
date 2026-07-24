# Critic sub-agent + adversarial verification

## Status

**Build-harness.** This is proof-corpus verification scaffolding, not product authoring law.

> **Status — build-harness, not product law (Refocus, 2026-06).** The Critic is scaffolding to produce & verify the proof corpus, not the shipped authoring model (GUI + agent parity, where the human in the GUI is the live critic). Keep the *function* — a quality-check pass either surface can invoke; the isolated-sub-agent ceremony is one optional workflow.

Supers agents were producing low-effort output and self-passing broken renders despite a rigorous R/Q/G rubric with named-observation slots. The observed cause: when prompted to "verify against rubric," the model fills the protocol's surface form plausibly without actually inspecting pixels — but when prompted "what's wrong with this render," the same model reliably finds real defects. Verification therefore moves to a dedicated critic sub-agent spawned with fresh context that sees only the produced artifact and the rubrics, never the conversation that produced it, and is framed as a critic from the first message. The critic captures its own frames via the chrome-devtools MCP at native 4K, runs the named-observation protocol against crops it controls, and classifies each finding as `pipeline-bug` / `default-too-permissive` / `preset-choice` / `aesthetic-miss` / `rubric-gap`. To prevent the critic from rubber-stamping the same way the producer did, every R-line cites a saved screenshot path plus pixel coordinates, and rules with a measurable form (R3, R5, R6, Q4, Q9) require numeric output from probe scripts the critic must invoke rather than prose alone.

## Considered options

Same agent re-prompted as critic (rejected: anchored to first pass), producer+critic mandatory pairing on every task (rejected: bureaucratic for simple work), human-only critique (rejected: doesn't scale), and pure-prose verification with no probe scripts (rejected: same gaming failure mode as the original rubric).

## Consequences

Probe scripts at `scripts/probe-*.ts` become a required investment (~30 lines each). Critic invocation needs a slash command or skill so the framing flip happens at the workflow boundary, not by polite prompt convention. The full spec lives in [`docs/critic.md`](../critic.md).
