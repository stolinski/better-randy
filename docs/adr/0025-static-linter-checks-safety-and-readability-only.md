# Static preset linter checks video-safety + readability only; taste is Critic-judged

## Status

**Canon.**

The static preset linter (`src/lib/platform/preset-rubric.ts`, run by `scripts/verify-presets.ts`) is scoped to **objective, JSON-computable video-safety and readability** — orientation-aware (vertical 2160×3840 and horizontal 3840×2160) — and hard-errors only on those. All **motion/aesthetic taste** (enter/exit feel, timing personality, stagger character) moves out of the linter into the G/Q rubric docs, judged by eye by the **Critic**.

## Context

The linter had grown to 1042 lines encoding ~40 opinionated motion-timing bands (enter 250–400ms, focal 450–800ms, …) as build-breaking errors, failing 16 of 22 built-in presets — so the gate was being ignored. Those bands are taste ("is this enter too slow?"), which the project's own philosophy (ADR-0003, ADR-0004) assigns to the Critic, judged against rendered pixels. The linter was doing the Critic's job badly with invented constants. The intended charter was always "is the output safe and readable on video, in both orientations" — which *is* computable from the preset JSON plus frame size, without rendering.

## What stays in the linter (hard errors, orientation-aware)

Read-window (text/marks on screen long enough to read: words ÷ WPM), title/action-safe margins, minimum legible size, frame-fit / no bleed, line measure, contrast. A *readability floor* on mark/overlay on-screen time stays (a mark must show long enough to register); the *ceiling* on those durations is taste and leaves.

## What leaves (→ Critic / G-rule docs)

Enter/exit duration bands, mark duration bands (above the readability floor), stagger minimums, lower-third hold maximum, and any "does this feel right" judgment.

## Consequences

- Refines ADR-0003: that ADR split the R/Q tiers but did not draw the static-linter-vs-Critic line. This does.
- `preset-rubric.ts` shrinks substantially; the gate becomes pass-able for well-made presets and meaningful again.
- The G-rule doc (`animation-rubric.md`) must mark which rules are linter-enforced (safety/readability) vs Critic-judged (taste).
- Pipeline smoke-test presets (`*-demo`, `text-3d-cylinder`, …) are not deliverables and should not sit in the catalog the gate runs over (see preset-catalog hygiene todo).
