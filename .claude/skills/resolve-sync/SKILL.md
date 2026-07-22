---
name: resolve-sync
description: Sync a composition to a DaVinci Resolve edit — read the editor's timeline markers over the bridge, derive frame-exact Preset timings at the timeline's true rational rate, export a timecode-stamped .mov, and place it back on the timeline with the Mint + customData sync receipt (ADR-0042). Use when asked to "sync to the edit/markers", "read the Resolve markers and retime", "place this piece in Resolve/the timeline", "re-sync after the markers moved", or via `/resolve-sync SLUG`. Do NOT use for authoring Preset content (/author), verifying render quality (/critic), or Resolve inspection with no sync intent (use the davinci-resolve MCP tools directly).
---

# Resolve marker sync — the edit authors the beats

Operational form of [ADR-0042](../../../docs/adr/0042-resolve-marker-sync.md). The editor drops labeled markers in DaVinci Resolve where a piece and its internal beats belong; this flow reads them once, derives frame-exact timings at the timeline's true rational rate, writes them into the Preset, exports a timecode-stamped .mov through the real export path, and places it back on the timeline at the marker — then recolors the group Mint with a customData receipt. Generic by design: any composition with timed items, any editor, any legal timeline rate, any Pack.

## Binding rules

- **Markers are identified by NAME/NOTE text and customData — never by input color.** Hand-recoloring markers is a burden no editor will carry; a marker's color means nothing on read. The only color operation in the whole flow is the *outbound* Mint recolor receipt (grammar v2, ADR-0042).
- **Never assume who the editor is.** Say "the editor". No channel-, episode-, or person-specific behavior anywhere in the flow.
- **Frame-exact at the true rational rate.** Normalize the reported rate with `normalizeTimelineFps` and do all frame math through `resolveFrameRate` (`src/lib/utils/composition-timing.ts`). The `29.97` literal is display; `30000/1001` is math. Never loop floats.
- **Beats re-place motion, never re-speed it.** Item *starts* pin to beat frames; item window *lengths* keep their authored absolute durations. Every derived time snaps to a frame boundary.
- **Authoring-time projection, never a live link.** Markers are read once and written into the Preset as explicit timings. The Preset carries no edit anchor: WHAT lives in the preset, WHERE lives in the edit (Resolve-side customData).
- **Re-read markers immediately before placing.** They go stale while the editor works (a ripple edit once moved a group −24 frames between read and place). Derive from one snapshot, place from a fresh one.
- **Video and audio always place as separate streams.** A linked append is refused *entirely* when the other stream's landing range is occupied, and deleting a linked video item strands its audio.

## Preconditions

1. **Resolve is running** on its host machine with External scripting = Local. If not: `open -a "/Applications/DaVinci Resolve/DaVinci Resolve.app"` on that machine (~20 s until attachable).
2. **Bridge resolved.** The two pipes under `scripts/` run wherever Resolve runs:
   - Resolve local → run them directly with a python that can import `DaVinciResolveScript`.
   - Resolve remote → pipe over SSH: `ssh <user>@<host> '<python3> -' < scripts/resolve-markers.py`. This environment's host and python path live in project memory (`resolve-mcp-bridge-mbp`) and the scripts' docstrings.
3. **Dev server** at `http://localhost:7263` (never start another).
4. **Flag-enabled Chrome** for the export drive — the chrome-devtools MCP browser, or the CDP 9223 harness via `scripts/launch-cdp-chrome.sh`. Never improvise a Chrome launch.

## The flow

Snapshot → identify → derive → write Preset → export → ship → re-read → place → verify. Steps 3–5 work from one snapshot; step 8 must work from a fresh one.

### 1. Snapshot

Run `scripts/resolve-markers.py` (dumb pipe, no logic) → `{product, project, timeline, fps, startFrame, markers[]}`. `--project` / `--timeline` are optional (defaults: current). Marker `frameId`s are RELATIVE to `startFrame` — normalize once; record frames are absolute.

### 2. Identify the group and beat semantics

Group markers by text, in timeline order — color never participates (`groupSupersMarkers` is color-blind):

- **Head:** the marker whose note is `supers <slug>`. Previously synced groups are found by their `supers-sync@1` customData instead — never re-parsed.
- **Span:** closed by the first **END** marker after the head (a name whose last word is `END`; a synced END carries customData beat −1), else by the head's dragged duration (an END marker beats a disagreeing drag, with a warning), else — degenerate, linted — the last beat + 2.5 s handle.
- **Beats:** every marker inside the span, whatever its color or name — the delimited span is the claim. Beat labels carry the item text: `parseBeatLabel` maps `<item> - Checked` → on the list from arrival, strike at the beat; `<item> - Add to list` → enter at the beat; bare label → build-in enter.

**Free-label groups** (no `supers` note anywhere — e.g. `<Title> Checklist Start` heads, or `Achievement — Task complete - <title>` single markers): assemble the `MarkerGroup` yourself from the labels and pass it as `options.group` to the derivation; the sync's customData receipt then makes the group formally findable on re-sync. Never ask the editor to recolor or rename anything.

### 3. Derive (pure, tested)

Call `deriveMarkerSync(snapshot, { slug, items, cardEnterDurationSeconds, group? })` from `src/lib/utils/marker-sync.ts` in a scratch node script (`node --experimental-strip-types`). Returns `{ fps, durationSeconds, spanFrames, spanSource, headRecordFrame, startTimecode, version, itemWindows[], syncedBeats[], warnings[] }` — `syncedBeats` carries each beat's label (the item text) and absolute record frame. Surface every warning to the user — sync lint is advisory, never silently swallowed. An undragged head falls back to last beat + 2.5 s with a warning. Keep every derived number in `marker-sync.ts` (unit-tested in `marker-sync.test.ts`) — never in improvised python.

### 4. Write the Preset

Write the derived `fps` literal, duration, and item windows (fractions, frame-snapped; `enter` for build-in pieces, `strike` for completion pieces) into the Preset — bind to `docs/preset-format.md` for field shapes. Manual duration edits afterward stay governed by `rescaleCompositionTimings`.

### 5. Export

Drive the flagged Chrome to `/p/<slug>`. While `Workspace.svelte` is mounted, it exposes `window.__supersExport(request?: { startTimecode?, filename? })`; that callback delegates the full media operation to `CompositionExportController`, the export orchestration seam. `export-video.ts` supplies the encoding, endpoint-upload, and download primitives used by the controller. Pass the derivation's `startTimecode` and `buildSyncExportFilename(slug, startTimecode, spanFrames, version)` → `<slug>__<TC-with-dashes>__<frames>f__v<version>.mov`. Chrome silently blocks a second automatic download (a reload resets any grant): wrap `window.fetch` to tee the `/api/export/` response blob to a local HTTP receiver (the port-7299 pattern) instead of relying on the download. The current ProRes route emits 4444 for both transparent and opaque compositions; ProRes 422 and H.264 export lanes are unbuilt.

### 6. Ship

`plan.moviePath` is a path ON THE RESOLVE MACHINE. Remote bridge → `scp` the export over first.

### 7. Re-read and re-anchor

Re-run the snapshot. Recompute the head record frame and beat frames from the FRESH read. If beats moved *relative to the head* since step 3, the piece's internal timing changed, not just its address — go back to step 3.

### 8. Place + receipt

Build the placement plan — shape documented in `scripts/resolve-place.py`'s docstring (source of truth):

```json
{
  "binName": "Supers",
  "trackName": "SUPERS",
  "clipName": "<human-readable name>",
  "moviePath": "/path/on/resolve/machine.mov",
  "recordFrame": 108240,
  "audio": { "trackName": "SUPERS", "recordFrame": 108240 },
  "markers": [{ "frameId": 240, "color": "Mint", "customData": "{…supers-sync@1…}" }]
}
```

`clipName` and `audio` are optional (include `audio` only when the piece ships sound). Marker updates come from `buildSyncedMarkerUpdates(freshSnapshot, slug, version, itemCount, group?)` (pass the group for free-label selections) — head = beat 0, beats 1-based, END = beat −1; extra beats beyond the item count keep their input color, visibly unsynced. Bin and track are created if missing (track ABOVE existing tracks); defaults `Supers` / `SUPERS` unless the user names others. Pipe it: `ssh <user>@<host> '<python3> - --plan-b64 <BASE64>' < scripts/resolve-place.py`.

**Re-sync replace:** before placing version N+1, sweep version N — the video item AND any stranded audio item, matched by clip filename across tracks (davinci-resolve MCP timeline tools or a scratch pipe). `resolve-place.py` only appends; it never clears the range.

### 9. Verify

- `placed.itemStart == recordFrame` and every `markers[].ok == true` in the pipe's output.
- The placed item's *name* confirms any `clipName` (`SetClipProperty` returns a false negative on Studio 21.0.2.4 but applies).
- The done-bar (ADR-0042): each synced item's window start frame equals its beat's record frame exactly.

## Failure handling

| Symptom | Cause / action |
|---|---|
| `{"error": "Could not attach…"}` | Resolve not running, or scripting pref off. Launch it on its host, wait ~20 s, retry. |
| `AppendToTimeline placed nothing` | Landing range occupied — usually a prior version not swept (video or stranded audio). Sweep both streams, retry. |
| Marker rewrite: `no marker at frame` | Markers moved since your read — the staleness guard firing. Re-read (step 7); if beats moved relative to the head, re-derive (step 3). |
| `AddMarker` refuses | Empty name, duration < 1, or a frame inside another marker's span. The place pipe floors name/duration and restores the original on failure — never bypass that path. |
| `SetClipProperty` returns false | False negative on Studio 21.0.2.4 — verify via the placed item's name; don't retry the set. |
| Resolve crashes mid-mutation | The post-crash dialog blocks ALL scripting. PID-targeted restart of Resolve on its host, reopen the project, re-read before resuming. |
| MCP server misbehaving | Pipe python directly — the two scripts ARE that fallback. MCP tools stay the interactive/inspection lane. |
| Rate reads as `24.0` / `29.97002997…` | Normal — `GetSetting('timelineFrameRate')` returns float-ish strings; `normalizeTimelineFps` handles both. Fixture-building note: `SetSetting('timelineFrameRate')` wants a *string*. |

## Safety boundaries

- Sanctioned timeline mutations only: append to the named Supers track, rewrite THIS group's markers (Mint + customData), sweep prior versions of THIS piece by filename. Never touch the editor's clips, other markers, or project settings on a real timeline.
- Marker rewrites keep the restore-on-failure path (built into the pipe) — a failed rewrite must never eat the editor's marker.
- Test fixtures: build scratch projects programmatically and delete them after; never test against a real timeline.
- Don't place onto a real timeline the user didn't name in this session.
