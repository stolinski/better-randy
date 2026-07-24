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

## GUI interchange

The home screen's **Import JSON** action derives the User composition slug from the filename. Importing `episode-title.json` creates or replaces `episode-title`. Schema and semantic errors block persistence; static-linter warnings and errors do not, because a valid agent-authored Preset must be able to enter the GUI for repair. Its linter findings appear live in the composition inspector after import.

The composition inspector's **Export JSON** action downloads the current standalone wire Preset as `<slug>.json`. **Verify** runs the structural schema, registry-derived semantic validation, deliverable static linter, and current rendered visual audit in one action. Static issues remain live in the inspector while editing; the rendered audit is refreshed only by Verify.

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
