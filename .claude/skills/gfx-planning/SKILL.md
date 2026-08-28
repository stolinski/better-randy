---
name: gfx-planning
description: >
  The GFX planning surface: interrogate an idea or plan until it is sharp,
  then land it as synchronized roadmap/ADR/Brief updates plus a detailed Dex
  epic and task list ready for the gfx-factory. Use when the user brings a
  new idea, feature, or plan; says "let's plan"; or asks to groom the roadmap
  or reconcile planning drift.
---

# GFX Planning

Planning is a conversation, not machinery. The durable state lives where it
already lives — `docs/roadmap.md`, `docs/adr/`, `docs/briefs/`, and Dex — and
this skill's job is to make one coherent change across all of them at once so
they never drift.

## Phase 1 — Grill

Interrogate the idea before writing anything. Be adversarial, not agreeable;
one focused question at a time, and stop when answers stop changing the plan:

- What outcome does this serve, and how will we know it worked?
- What existing engine/Preset/Pack behavior does it touch? (Read the code
  before asking the human what the code does.)
- What is deliberately out of scope? What is the smallest shippable slice?
- Does it conflict with an ADR, the roadmap, or an open Dex task? Name them.
- Is any part visual? (That routes it through the factory's human gate.)
- What would make us reject this idea entirely?

## Phase 2 — Land it, everywhere at once

Draft the full set of changes, show the human the complete picture, then on
their go-ahead apply all of it in one pass:

1. **Roadmap** — add/move the item in `docs/roadmap.md` (or remove superseded
   entries). No orphan ideas: everything on the roadmap points at its Brief,
   ADR, or Dex id.
2. **ADR** — only when a real decision was made (`docs/adr/`, next index, link
   it from the ADR index).
3. **Brief** — for new Preset/Pipeline/domain work, per `docs/briefs/README.md`.
4. **Dex** — one epic with ordered, individually-shippable subtasks. Each task
   description must be executable by the factory's implementation agent
   without this conversation: context, files, constraints, and its
   verification expectation. Priorities via `[p<n>]` conventions already in use.

## Phase 3 — Prove sync

Run `pnpm audit:planning` (planning-state drift audit) and fix what it flags
before calling planning done. Then read back the epic with
`dex show <epicId> --expand` and confirm the task list matches what was
agreed. Hand the ready leaves to the `gfx-factory` skill to execute.
