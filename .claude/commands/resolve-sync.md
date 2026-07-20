---
description: Sync a composition to the DaVinci Resolve edit's markers and place the export back on the timeline
---

You are running the Resolve marker-sync loop (ADR-0042).

Parse `$ARGUMENTS`: the first token is the composition slug; optional `--project "NAME"` / `--timeline "NAME"` pass through to the marker snapshot (defaults: Resolve's current project/timeline).

1. Read `.claude/skills/resolve-sync/SKILL.md` and bind to its Binding rules — especially: identify markers by label/note/customData, never by input color; re-read markers immediately before placing.
2. If the slug is missing, list candidate compositions (`src/lib/presets/*.json` plus user compositions from `/api/user-compositions`) and stop.
3. Execute the flow end-to-end: snapshot → identify → derive → write Preset → export → ship → re-read → place → verify. Surface every derivation warning verbatim. Stop for user input only if no marker group matches the slug — report which groups WERE found on the timeline.

Report at the end: derived timings (fps, span, item windows), export filename, placement result (track, record frame, item bounds), marker receipt status, and the frame-exactness check (each synced item's start frame vs its beat's record frame).
