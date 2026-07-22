# Resolve marker sync — the edit authors the beats

**Kind:** pipeline
**Slug:** resolve-marker-sync
**Pack:** syntax
**Verification preset:** checklist-show-rundown (rewrite — re-timed from markers)

## Pitch

Supers compositions align to the real Syntax edit by frame, not by eye. The editor drops markers in DaVinci Resolve where a piece and its internal beats belong; Supers reads them, derives frame-exact timings at the timeline's true rate (29.97 NDF), exports a timecode-stamped ProRes 4444, and places it back on the timeline at the marker — automatically. The flagship proof is the checklist: five rundown items whose enters land exactly on five markers the editor placed against the actual conversation. This closes the gap between "author a piece, then nudge it in the NLE by eye" and "the edit itself pins the beats." The shipped transport already stores the conventional `29.97` literal while all frame math resolves it to the exact `30000/1001` rational; marker sync must consume that exact timebase end to end.

## Surface(s) involved

None added or extended. The verification piece rides the existing `checklist` Surface (ADR-0040). This Brief's engine work is transport/export/tooling, not rendering.

## Content sample

The verification preset keeps `checklist-show-rundown`'s existing verbatim content:

- **Title:** `SHOW RUNDOWN`
- **Items (build-in, unchecked):**
  1. `Cold open`
  2. `Main topic`
  3. `Hot tip`
  4. `Sick picks`
  5. `Shameless plugs`

What changes is *where its timing comes from*: the five `enter` starts and the transport duration are derived from markers instead of hand-authored fractions.

## Motion plan

The piece's motion vocabulary is unchanged (settled-place card enter, staggered item enters, smooth exit — already authored in the preset). This Brief pins **how beats become timings**:

- **Marker grammar (the editor's language, in Resolve — grammar v2, color-blind):** markers may be **any color**; identification is by text. A group's **head** is the marker whose note names the piece (`supers checklist-show-rundown`); an explicit **END**-named marker — else the head's dragged duration — closes the span; every marker inside the span is a **beat**, mapping to the composition's timed items **in order** (beat 1 → item 1 …). Chapter markers stay untouched — they sit outside any claimed span (confirmed live: 13 Blue chapter markers on "1023 - Remote Dev").
- **What a beat drives:** the item's primary window — `enter` for build-in pieces (show-rundown), `strike` for completion pieces (project-setup). Same grammar, piece kind decides.
- **Derivation (authoring-time projection, never a live link):** markers are read once and written into the Preset as explicit timings — the composition stays self-contained and frame-deterministic. Composition head = head marker frame; span = head marker duration (fallback if undragged: last beat + ~2.5 s hold/exit handle, with a sync-lint warning). Item *starts* pin to beat frames; item window *lengths* keep their authored absolute durations (the motion-graphics contract — beats re-place motion, never re-speed it). All derived times snap to frame boundaries at the timeline rate. Re-sync = re-run the projection after markers move; `rescaleCompositionTimings` continues to govern manual duration edits afterward.
- **Sync lint:** warn when beat 1 lands before the card enter completes, when beats are out of item order, or when beat count ≠ item count (extra beats ignored with a warning; missing beats leave remaining items on their authored spacing after the last synced beat).
- **State round-trip:** after sync/placement, Supers writes `customData` on each marker (`{ schema: "supers-sync@1", slug, beat, version }`) and recolors the group **Mint** — the editor sees "synced" at a glance; Supers finds its own groups on re-sync without re-parsing notes. The binding lives **Resolve-side only** — the Preset carries no edit anchor (WHAT in the preset, WHERE in the edit; presets stay episode-reusable).

## Channel chrome notes

Inherited unchanged from the `checklist` Brief / ADR-0040 (mono numbers, card chrome, declared strike-on-chrome exception). This Brief adds no appearance surface.

## Engine work required

**Timebase foundation (shipped; Syntax edits are 29.97 NDF 1080p, confirmed on TEMPLATE SESSION 2026 and episode 1023):**

- `engine-schema.ts` already accepts NTSC fractional literals `23.976 | 29.97 | 59.94` alongside integers. `resolveFrameRate` maps them to exact broadcast rationals (`24000/1001`, `30000/1001`, `60000/1001`); the stored decimal is display/authoring data, never the arithmetic rate.
- Preview/export frame counts and timestamps already use rational helpers, and both exporters pass rational `-framerate` strings to ffmpeg. ProRes also writes the colon-separated NDF start timecode.
- Export duration is quantized to a whole frame count at the resolved rational rate. Marker-sync derivation must use the same helpers so every beat and duration lands on an identical frame boundary without decimal-fps drift.
- `RootInspector.svelte` already exposes the standard-rate picker (23.976 / 24 / 25 / 29.97 / 30 / 50 / 59.94 / 60). Resolve sync adds no second fps model or float-based frame loop.

**Resolve bridge (I/O pipes are Python, logic is TS):**

- `scripts/resolve-markers.py` — dumb pipe: attach → read timeline fps / start frame / markers → emit JSON. Normalizes `GetStartFrame()` once (episodes start at 00:00:00:00, but never assume 0).
- `scripts/resolve-place.py` — dumb pipe: import the exported .mov into a **"Supers"** media-pool bin, place on a named **SUPERS** video track (created above existing tracks if missing) at the head-marker record frame, write `customData`, recolor the group Mint.
- Both run over the existing SSH bridge to the mbp (see project memory `resolve-mcp-bridge-mbp`: Resolve Studio 21.0.2.4, launcher paths, gotchas). The `davinci-resolve` MCP server stays the interactive/inspection path; the loop itself uses the deterministic scripts.
- `src/lib/utils/marker-sync.ts` (+ `marker-sync.test.ts`) — pure, tested derivation: markers JSON → `{ fps, durationSeconds, per-item windows }` per the Motion plan semantics, including the lint warnings. No I/O.

**Export naming:** `<slug>__<startTC with '-' separators>__<frames>f__v<version>.mov`.

**Explicitly not in scope:** no `editAnchor` schema field, no live Resolve link at render time, no GUI marker browser (agent-driven v1), no runtime pack/appearance work.

## ADR required?

`already-filed: 0042-resolve-marker-sync`. The accepted trade-offs are: fractional-rate literals over a rational `{num,den}` wire format (backward compat + GUI simplicity, exactness via internal lookup); authoring-time projection over live link (composition stays self-contained/deterministic); binding in Resolve `customData` over a preset anchor field (WHAT/WHERE split, episode-reusable presets); text-defined, color-blind input grammar over a color taxonomy (zero editor memorization). Mint is output status applied after sync, never an input claim.

## Open questions

_None — ready to `/author`._

## What 'done' looks like

- The shipped fractional-rate schema, exact-rational frame helpers, exporter `-framerate`/ProRes `-timecode`, and standard-rate Inspector picker remain the single timebase path; Resolve sync introduces no decimal-fps arithmetic.
- `scripts/resolve-markers.py` + `scripts/resolve-place.py` working over the mbp SSH bridge.
- `src/lib/utils/marker-sync.ts` + tests green.
- **Live round trip, fully autonomous:** a scratch Resolve project built via the API at 29.97 (copy of the TEMPLATE SESSION 2026 settings), head + 5 beat markers (any color) dropped programmatically → sync rewrites `checklist-show-rundown` (fps 29.97, derived duration, five enters pinned) → ProRes 4444 export with embedded TC → placed on the SUPERS track at the head frame → probe confirms each item's enter start frame equals its beat's record frame exactly → markers Mint with `customData`. Scratch project deleted after.
- `/critic checklist-show-rundown` returns **ACCEPT** for native horizontal (3840×2160) and vertical (2160×3840) renders of the same Preset, with no orientation-specific sibling — the delete trigger for this Brief.
