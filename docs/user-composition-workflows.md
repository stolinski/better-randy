# User composition workflows

GUI authors and agents read and write the same standalone `supers@1` Preset through the local user store. The store API is the supported interchange boundary; files under `user-compositions/` are internal metadata wrappers and are not standalone Presets.

The local server is always `http://localhost:7263`. All examples below operate on the same User compositions listed on the Supers home screen.

## Agent store access

List User composition metadata:

```sh
curl -fsS http://localhost:7263/api/user-compositions
```

Export one standalone Preset:

```sh
curl -fsS http://localhost:7263/api/user-compositions/my-composition > my-composition.json
```

Create or replace a User composition with a standalone Preset:

```sh
curl -fsS \
  -X PUT \
  -H 'Content-Type: application/json' \
  --data-binary @my-composition.json \
  http://localhost:7263/api/user-compositions/my-composition
```

Delete one User composition:

```sh
curl -fsS -X DELETE http://localhost:7263/api/user-compositions/my-composition
```

`GET /api/user-compositions/<slug>` returns the exact standalone wire format accepted by `PUT`: annotation bodies and chat messages are strings, not the engine's transformed runtime structures. This symmetry is the agent edit loop: GET, edit JSON, PUT, reopen in the GUI. Invalid JSON, schema fields, Packs, Pipeline variants, Effect parameters, assets, or cross-references are rejected before persistence with a path-qualified response message.

### Media assets and composition membership

Media asset bytes live separately from Preset JSON in the installation-wide local content-addressed asset store. Ingest an MP4, MOV, or WebM before adding a composition-scoped Media library entry that references the returned `url`:

```sh
curl -fsS \
  -X POST \
  -H 'Content-Type: video/mp4' \
  --data-binary @episode.mp4 \
  http://localhost:7263/api/user-assets \
  > episode-asset.json
```

The response includes the immutable URL plus a volatile probe of duration, display dimensions, rotation, average frame rate, video/audio codecs, and audio layout:

```json
{
	"url": "/api/user-assets/<sha256>.mp4",
	"mime": "video/mp4",
	"sizeBytes": 123456,
	"durationSeconds": 18.4,
	"displayWidth": 1920,
	"displayHeight": 1080,
	"rotation": 0,
	"averageFrameRate": 59.94,
	"videoCodec": "h264",
	"hasAudio": true,
	"audioCodec": "aac",
	"audioChannels": 2,
	"audioSampleRate": 48000
}
```

Re-uploading identical bytes returns the same URL. Large uploads stream to disk while hashing and probing; stored media supports HTTP byte ranges so the browser decoder can seek without loading the whole asset into memory. The API is the asset-ingest automation command: it accepts bytes directly and returns the complete descriptor, so the CLI does not add a second ingest path. Probe fields are observations, not composition truth: do not copy duration, dimensions, rotation, rate, codec, audio layout, byte size, readiness, or errors into the Preset.

Write that returned `url` into a Media library entry and reference it from a Video clip. The Preset remains the complete render contract; do not pass media, rate, duration, or format as render overrides:

```jsonc
{
	"schema": "supers@1",
	"name": "Episode title",
	"pack": "syntax",
	"kind": "deliverable",
	"state": {
		"transport": {
			"orientation": "horizontal",
			"durationSeconds": 8,
			"fps": 59.94,
			"format": "prores"
		},
		"media": {
			"assets": [
				{
					"id": "episode-camera",
					"kind": "video",
					"name": "Episode camera",
					"assetUrl": "/api/user-assets/<sha256>.mp4"
				}
			],
			"videoTrack": {
				"clips": [
					{
						"id": "opening",
						"assetId": "episode-camera",
						"timelineStartFrame": 0,
						"durationFrames": 480,
						"sourceStartSeconds": 4.25,
						"audio": { "enabled": true, "gain": 1 }
					}
				]
			}
		}
		// typography, marks, Surface, Blocks, Annotations, Overlays, and Effects
	}
}
```

Import it into the same User composition store the GUI opens, then render that slug through the Workspace seam:

```sh
curl -fsS \
  -X PUT \
  -H 'Content-Type: application/json' \
  --data-binary @episode-title.json \
  http://localhost:7263/api/user-compositions/episode-title

npm run supers -- render --preset episode-title --out ./out/episode-title.mov
```

`GET`, `PUT`, GUI JSON import/export, fork-on-edit, and CLI file-Preset import all preserve `state.media`. IDs, names, URLs, clip placement, Source time, and clip audio are stable Preset data. Readiness and probe details are computed from bytes when listing/opening and are not written into `state.media`. GET remains available when previously stored referenced bytes go missing so the composition can be repaired; writes and export reject a referenced missing or undecodable Media asset. An unused Media library entry may remain in the composition, including while unavailable, because it does not participate in rendering.

Standalone Preset JSON does not embed or copy video bytes. It is standalone composition data, not a media bundle or Project artifact. Moving a composition to another local Supers workspace therefore requires ingesting each Media asset there and updating the corresponding library entry's `assetUrl` to the content address returned by that workspace. Multiple compositions or entries may reference one deduplicated URL; removing membership never deletes those shared bytes.

## GUI interchange

The home screen's **Import JSON** action derives the User composition slug from the filename. Importing `episode-title.json` creates or replaces `episode-title`. Schema and semantic errors block persistence; static-linter warnings and errors do not, because a valid agent-authored Preset must be able to enter the GUI for repair. Its linter findings appear live in the composition inspector after import.

The composition inspector's **Export JSON** action downloads the current standalone wire Preset as `<slug>.json`. **Verify** runs the structural schema, registry-derived semantic validation, deliverable static linter, and current rendered visual audit in one action. Static issues remain live in the inspector while editing; the rendered audit is refreshed only by Verify.

The existing right rail has two modes: **Inspector** and **Media**. Media mode lists composition-scoped Media library entries, uploads local MP4/MOV/WebM bytes transactionally, shows volatile probe/readiness details, and supplies drag payloads for clip creation. Upload and probe complete before membership changes; failures preserve the last confirmed composition. Removing an entry is allowed only when no Video clip references it, and never deletes shared bytes. This is a mode of the existing rail, not a left panel or permanent fourth workspace zone.

The one primary **Video track** lives beneath all five Layers in the Timeline. Drag a Media library entry there to create a Video clip. Clip body drag moves it; left trim changes Timeline start, duration, and Source start by the same frame delta; right trim changes duration; Alt/Option-drag inside slips Source time without moving the clip. Every commit lands on an integer output frame and clamps to composition bounds, neighboring half-open clips, and source coverage. The Timeline is the only surface for temporal creation, move, trim, slip, snapping, and Source-range feedback. Selecting a clip exposes only audio enabled/gain and removal in the Inspector; no duplicate numeric timing fields live in the rail. Video is not a sixth Layer and never appears in Add layer.

## Automated rendering

`supers render` and `supers batch` drive the Workspace's existing `CompositionExportController`, so command-line rendering uses the same frame request seam, exact rational frame stepping, native target size, audio mix, and encoder as GUI export.

The command never starts a server or browser. Before running it, the existing dev server must answer at port `7263`, and the sanctioned CanvasDrawElement browser must answer at CDP port `9223` (`scripts/launch-cdp-chrome.sh` starts or confirms that browser).

Render a corpus or User composition slug:

```sh
npm run supers -- render --preset lower-third --out ./out/lower-third.webm
```

Render a standalone Preset file. The command imports it under a temporary User composition slug, renders it, then removes the temporary store entry:

```sh
npm run supers -- render --preset ./inputs/title.json --out ./out/title.mov
```

The Preset owns format, duration, rate, and orientation. `--out` only selects the destination path.

The output extension must agree with `state.transport.format`: `webm` requires `.webm`; `prores` requires `.mov`. The CLI validates this before invoking Workspace export. A standalone file Preset is removed from the User composition store after success, format rejection, browser decode failure, or render failure.

Batch jobs run serially through one reused browser page. Relative paths resolve from the manifest's directory:

```json
[
	{ "preset": "./inputs/title.json", "out": "./out/title.mov" },
	{ "preset": "lower-third", "out": "./out/lower-third.webm" }
]
```

```sh
npm run supers -- batch ./render-manifest.json
```

The batch continues after a failed job and exits non-zero with every failed input listed. WebM output can vary at the encoder byte level; deterministic verification belongs at rendered frame timestamps or in the ProRes lane.

Jobs may reference different Media assets, multiple Video clips, repeated assets, and gaps. Batch still runs serially through one reused Workspace page; every referenced clip asset in each Preset's `state.media` is confirmed before export.

GUI and CLI exports use the same local export-session protocol. The browser uploads the optional final WAV once, then one indexed PNG at a time; each request waits for ffmpeg stdin backpressure before the next frame is rendered. Only a successfully closed disk output becomes downloadable. Abort, encoder/request failure, explicit cancellation, inactivity expiry, download cancellation/completion, and dev-server startup orphan cleanup kill live ffmpeg where applicable and remove the private session directory. The browser never retains an all-frame array or downloads the complete output through `response.blob()`.
