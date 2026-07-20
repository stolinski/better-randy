#!/usr/bin/env python3
"""Dumb I/O pipe: execute a Supers placement plan against DaVinci Resolve and
emit what happened as JSON (ADR-0042). Every value in the plan — record
frame, marker colors, customData payloads — was derived upstream by
src/lib/utils/marker-sync.ts; this script only performs the actions and
reports observations (the caller judges frame-exactness).

Actions, in order:
  1. Import the exported .mov into the named media-pool bin (created under
     the root if missing), and set its human "Clip Name" when the plan
     carries one.
  2. Ensure the named video track exists (created ABOVE existing tracks if
     missing) and place the clip VIDEO-ONLY at the plan's absolute record
     frame. (A linked video+audio append is refused entirely when the
     audio's landing range is occupied, and deleting a linked video item
     strands its audio — so the streams are always separate actions.)
  3. When the plan carries an `audio` action, ensure that named AUDIO track
     and place the clip's audio there (mediaType 2).
  4. Rewrite the plan's markers in place: same frame/name/note/duration,
     new color + customData (the Mint "synced" round trip).

Runs on the machine hosting Resolve, over the SSH bridge (the plan travels
as base64 JSON so the script itself can ride stdin):

  ssh scotttolinski@100.105.94.122 \
      '/opt/homebrew/bin/python3.12 - --plan-b64 <BASE64>' \
      < scripts/resolve-place.py

Plan shape:

  {
    "project": "…",              # optional; default current project
    "timeline": "…",             # optional; default current timeline
    "binName": "Supers",
    "trackName": "SUPERS",
    "clipName": "Checklist — …",  # optional; SetClipProperty returns a false
                                  # negative on Studio 21.0.2.4 but applies
    "moviePath": "/path/on/this/machine.mov",
    "recordFrame": 108240,        # ABSOLUTE timeline frame (includes start frame)
    "audio": {                    # optional; omitted = video-only placement
      "trackName": "SUPERS",      # audio track, ensured by name
      "recordFrame": 108240       # defaults to the video recordFrame
    },
    "markers": [                  # frameId relative to timeline start
      { "frameId": 240, "color": "Mint", "customData": "{…}" }
    ]
  }

Output: {"placed": {trackIndex, trackName, recordFrame, itemStart, itemEnd,
itemName}, "markers": [{frameId, ok}]} — or {"error": …} with exit 1.
"""

import argparse
import base64
import json
import os
import sys

RESOLVE_SCRIPT_API = (
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
)
RESOLVE_SCRIPT_LIB = (
    "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
)


def fail(message):
    print(json.dumps({"error": message}))
    sys.exit(1)


def attach():
    api = os.environ.setdefault("RESOLVE_SCRIPT_API", RESOLVE_SCRIPT_API)
    os.environ.setdefault("RESOLVE_SCRIPT_LIB", RESOLVE_SCRIPT_LIB)
    modules = os.path.join(api, "Modules")
    if modules not in sys.path:
        sys.path.append(modules)
    try:
        import DaVinciResolveScript as dvr
    except ImportError as error:
        fail(f"DaVinciResolveScript unavailable: {error}")
    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        fail("Could not attach to DaVinci Resolve — is it running with External scripting = Local?")
    return resolve


def open_project(project_manager, name):
    if not name:
        project = project_manager.GetCurrentProject()
        if project is None:
            fail("No current project open in Resolve; pass plan.project.")
        return project
    project = project_manager.LoadProject(name)
    if project is None:
        fail(f'Project "{name}" not found.')
    return project


def open_timeline(project, name):
    if not name:
        timeline = project.GetCurrentTimeline()
        if timeline is None:
            fail("Project has no current timeline; pass plan.timeline.")
        return timeline
    for index in range(1, int(project.GetTimelineCount()) + 1):
        timeline = project.GetTimelineByIndex(index)
        if timeline is not None and timeline.GetName() == name:
            project.SetCurrentTimeline(timeline)
            return timeline
    fail(f'Timeline "{name}" not found.')


def ensure_bin(media_pool, bin_name):
    root = media_pool.GetRootFolder()
    for folder in root.GetSubFolderList() or []:
        if folder.GetName() == bin_name:
            media_pool.SetCurrentFolder(folder)
            return folder
    folder = media_pool.AddSubFolder(root, bin_name)
    if folder is None:
        fail(f'Could not create media-pool bin "{bin_name}".')
    media_pool.SetCurrentFolder(folder)
    return folder


def import_movie(media_pool, supers_bin, movie_path):
    if not os.path.exists(movie_path):
        fail(f"Movie not found at {movie_path}.")
    imported = media_pool.ImportMedia([movie_path]) or []
    if imported:
        return imported[0]
    # Resolve dedupes re-imports of a path it already holds — find it by file path.
    for clip in supers_bin.GetClipList() or []:
        if clip.GetClipProperty("File Path") == movie_path:
            return clip
    fail(f"Import of {movie_path} produced no media-pool item.")


def ensure_track(timeline, track_name, track_type="video"):
    count = int(timeline.GetTrackCount(track_type))
    for index in range(1, count + 1):
        if timeline.GetTrackName(track_type, index) == track_name:
            return index
    if not timeline.AddTrack(track_type):
        fail(f'Could not add a {track_type} track for "{track_name}".')
    index = int(timeline.GetTrackCount(track_type))
    if not timeline.SetTrackName(track_type, index, track_name):
        fail(f'Could not name {track_type} track {index} "{track_name}".')
    return index


def place_clip(media_pool, timeline, item, track_index, record_frame, media_type=1):
    # mediaType 1 = video only, 2 = audio only. Never append linked: a linked
    # append is refused ENTIRELY when the other stream's landing range is
    # occupied, and deleting a linked video item strands its audio.
    placed = media_pool.AppendToTimeline(
        [
            {
                "mediaPoolItem": item,
                "trackIndex": track_index,
                "recordFrame": record_frame,
                "mediaType": media_type,
            }
        ]
    ) or []
    if not placed or placed[0] is None:
        fail(f"AppendToTimeline placed nothing at record frame {record_frame}.")
    timeline_item = placed[0]
    return {
        "itemName": timeline_item.GetName(),
        "itemStart": int(timeline_item.GetStart()),
        "itemEnd": int(timeline_item.GetEnd()),
    }


def rewrite_markers(timeline, updates):
    existing = timeline.GetMarkers() or {}
    results = []
    for update in updates:
        frame_id = int(update["frameId"])
        fields = existing.get(frame_id)
        if fields is None:
            results.append({"frameId": frame_id, "ok": False, "error": "no marker at frame"})
            continue
        # Recolor = delete + re-add with identical name/note/duration; Resolve
        # has no in-place marker color update. AddMarker refuses an empty name
        # and a duration < 1 (verified on Studio 21.0.2.4), so both are floored
        # — otherwise the delete would succeed and the re-add fail, losing the
        # marker.
        name = fields.get("name") or "Marker"
        note = fields.get("note", "")
        duration = max(1, int(fields.get("duration", 1)))
        timeline.DeleteMarkerAtFrame(frame_id)
        ok = timeline.AddMarker(
            frame_id, update["color"], name, note, duration, update.get("customData", "")
        )
        if not ok:
            # Best-effort restore of the original so a failed rewrite never
            # deletes the editor's marker.
            timeline.AddMarker(
                frame_id, fields.get("color", "Blue"), name, note, duration,
                fields.get("customData", ""),
            )
        results.append({"frameId": frame_id, "ok": bool(ok)})
    return results


def read_plan():
    parser = argparse.ArgumentParser(description="Execute a Supers placement plan in Resolve.")
    parser.add_argument("--plan-b64", help="Base64-encoded JSON plan (SSH-friendly)")
    parser.add_argument("--plan", help="Path to a JSON plan file (local runs)")
    args = parser.parse_args()
    if args.plan_b64:
        return json.loads(base64.b64decode(args.plan_b64))
    if args.plan:
        with open(args.plan, encoding="utf-8") as handle:
            return json.load(handle)
    fail("Pass the plan via --plan-b64 or --plan.")


def main():
    plan = read_plan()
    for key in ("binName", "trackName", "moviePath", "recordFrame", "markers"):
        if key not in plan:
            fail(f"Plan is missing \"{key}\".")

    resolve = attach()
    project = open_project(resolve.GetProjectManager(), plan.get("project"))
    timeline = open_timeline(project, plan.get("timeline"))
    media_pool = project.GetMediaPool()

    supers_bin = ensure_bin(media_pool, plan["binName"])
    item = import_movie(media_pool, supers_bin, plan["moviePath"])
    if plan.get("clipName"):
        # False-negative return on Studio 21.0.2.4 — the rename applies;
        # the placed timeline item's name is the verification.
        item.SetClipProperty("Clip Name", plan["clipName"])
    track_index = ensure_track(timeline, plan["trackName"])
    placement = place_clip(media_pool, timeline, item, track_index, int(plan["recordFrame"]))

    audio_result = None
    audio_plan = plan.get("audio")
    if audio_plan:
        audio_index = ensure_track(timeline, audio_plan["trackName"], "audio")
        audio_record = int(audio_plan.get("recordFrame", plan["recordFrame"]))
        audio_result = {
            "trackIndex": audio_index,
            "trackName": audio_plan["trackName"],
            **place_clip(media_pool, timeline, item, audio_index, audio_record, media_type=2),
        }

    marker_results = rewrite_markers(timeline, plan["markers"])

    print(
        json.dumps(
            {
                "placed": {
                    "trackIndex": track_index,
                    "trackName": plan["trackName"],
                    "recordFrame": int(plan["recordFrame"]),
                    **placement,
                },
                "audio": audio_result,
                "markers": marker_results,
            }
        )
    )


if __name__ == "__main__":
    main()
