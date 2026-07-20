#!/usr/bin/env python3
"""Dumb I/O pipe: emit a DaVinci Resolve timeline's rate, start frame, and
markers as JSON on stdout (ADR-0042). No sync logic lives here — grouping,
grammar, lints, and every derived number belong to
src/lib/utils/marker-sync.ts.

Runs on the machine hosting Resolve, over the SSH bridge from this repo's
machine (see project memory `resolve-mcp-bridge-mbp`):

  ssh scotttolinski@100.105.94.122 '/opt/homebrew/bin/python3.12 -' \
      < scripts/resolve-markers.py
  ssh … '/opt/homebrew/bin/python3.12 - --project "NAME" --timeline "NAME"' \
      < scripts/resolve-markers.py

Output shape (stdout, one JSON object; errors emit {"error": …} and exit 1):

  {
    "product": "DaVinci Resolve Studio",
    "project": "…", "timeline": "…",
    "fps": "29.97",            # raw GetSetting('timelineFrameRate') string
    "startFrame": 108000,       # GetStartFrame() — marker frameIds are relative
    "markers": [
      { "frameId": 240, "color": "Blue", "name": "…", "note": "…",
        "durationFrames": 300, "customData": "…" }
    ]
  }
"""

import argparse
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
            fail("No current project open in Resolve; pass --project.")
        return project
    project = project_manager.LoadProject(name)
    if project is None:
        fail(f'Project "{name}" not found.')
    return project


def open_timeline(project, name):
    if not name:
        timeline = project.GetCurrentTimeline()
        if timeline is None:
            fail("Project has no current timeline; pass --timeline.")
        return timeline
    for index in range(1, int(project.GetTimelineCount()) + 1):
        timeline = project.GetTimelineByIndex(index)
        if timeline is not None and timeline.GetName() == name:
            project.SetCurrentTimeline(timeline)
            return timeline
    fail(f'Timeline "{name}" not found.')


def main():
    parser = argparse.ArgumentParser(description="Emit Resolve timeline markers as JSON.")
    parser.add_argument("--project", help="Project name to load (default: current project)")
    parser.add_argument("--timeline", help="Timeline name to read (default: current timeline)")
    args = parser.parse_args()

    resolve = attach()
    project = open_project(resolve.GetProjectManager(), args.project)
    timeline = open_timeline(project, args.timeline)

    markers = []
    for frame_id, fields in (timeline.GetMarkers() or {}).items():
        markers.append(
            {
                "frameId": int(frame_id),
                "color": fields.get("color", ""),
                "name": fields.get("name", ""),
                "note": fields.get("note", ""),
                "durationFrames": int(fields.get("duration", 1)),
                "customData": fields.get("customData", ""),
            }
        )
    markers.sort(key=lambda entry: entry["frameId"])

    print(
        json.dumps(
            {
                "product": resolve.GetProductName(),
                "project": project.GetName(),
                "timeline": timeline.GetName(),
                "fps": timeline.GetSetting("timelineFrameRate"),
                "startFrame": int(timeline.GetStartFrame()),
                "markers": markers,
            }
        )
    )


if __name__ == "__main__":
    main()
