# The filmed canvas — an obliquely filmed web page

**Kind:** domain
**Slug:** filmed-canvas
**Pack:** syntax
**Verification preset:** `website-filmed`

Decision record: [ADR-0057](../adr/0057-filmed-canvas-camera-pose-and-posed-planes.md). Direction plate: [`docs/inspo/3d-canvas/perspective.png`](../inspo/3d-canvas/perspective.png). Dex epic `sh9b6qxd`, phase 1.

## Pitch

A documentary insert the channel uses constantly and the engine could not make: a real web page on a real screen, filmed by a camera that is not square to it. The camera sits low and to the left of the Syntax channel's YouTube video grid, close enough that the page runs off every edge, with the lens open enough that the aimed thumbnail and its title read while the rows above and below and the far columns fall away into blur. Over seven seconds the camera pushes in slowly, and nothing else moves. It lands because it reads as footage, not as a graphic: one flat surface with a continuous focus falloff across it, one light on everything, no chrome. The page is the piece. Under every Pack the page stays the page (it is a quoted capture) and only the light changes.

## Surface(s) involved

`website-screenshot` in a new `filmed` framing. The shipped `browser` framing (the `website-showcase` construction: a browser window inside the safe area, three control dots, all four capture edges visible) stays the default. `filmed` lays the stored capture at native density (one capture pixel per frame pixel) covering the frame with no browser chrome, anchored so an authored page point sits at frame centre; the frame is a crop into the page exactly as [ADR-0056](../adr/0056-newspaper-photographed-page.md) crops into the newspaper. The Surface keeps its full Pack immunity and its emissive `web-document-screen` shader pass.

The capture is a **bundled capture asset**, not a `/api/user-assets` upload: `src/lib/assets/captures/syntax-youtube-videos.png`, taken from `https://www.youtube.com/@syntaxfm/videos` at a 2560×2000 CSS-pixel viewport and device scale 2 (5120×4000) by the capture script's authoring mode — wider than the horizontal frame so `pageAnchor` chooses the crop and the grid, not the page gutters, fills the plane — and referenced as `content.captureAsset: "syntax-youtube-videos"`. A corpus deliverable must render from a clean worktree; the gitignored user-asset store cannot promise that. The Surface plane stays frame-sized; the camera is authored to keep its footprint on the page (rubric rule WS7 fails the Preset otherwise).

Depth: `state.stage.type: "depth"`, solid backdrop from `backgroundFill: "pack"` (the backdrop is never in shot at the authored poses; it exists so the stage classifies opaque and so a Pack switch fields the piece correctly).

## Content sample

Page: the live capture of `https://www.youtube.com/@syntaxfm/videos` at authoring time, committed verbatim as the bundled asset. `content.sourceUrl` is `https://www.youtube.com/@syntaxfm/videos`. The Surface prints no text of its own. There are no Overlays.

## Motion plan

The Syntax rule for depth pieces applies: substrate and depth pieces may camera; chrome never does. The camera is the piece's only motion; there is no page entrance because a filmed page has no entrance — the cut is the entrance (ADR-0056 §3).

Transport: 7 s, 30 fps, horizontal authored, vertical reflowed.

| Beat      | Time (fraction) | What happens                                                                                                                                                                                                                                                      |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rest pose | 0.00            | Camera at `pose`: yaw −24°, pitch −12° (below the page and to its left, looking up), roll 0, distance 0.46, aim `(0.5, 0.52)` — the middle row's middle thumbnail (`pageAnchor` `(0.54, 0.5)` centres the grid in the plane). Focus follows the aim; aperture 0.45 with a 0.04 focus band, so the aimed row's titles stay readable in the delivered video. The page already fills the frame. |
| Push      | 0.00 → 1.00     | One `travel` that changes only `distance`, 0.46 → 0.38, ease `smooth`: a slow push for the whole cut, angle and aim fixed. The plane is oblique, so it has depth across it: the near edge grows faster than the far edge as the camera approaches and the lens shallows with it (the far-row blur roughly doubles), which is what a dolly does and a zoom cannot. The angle is as steep as a frame-sized page plane allows before a frame corner leaves the page (WS7); a steeper filmed angle needs a capture-sized plane. |
| Cut       | 1.00            | The piece ends on a cut.                                                                                                                                                                                                                                          |

Focal slot: the aimed thumbnail. Everything nearer (the bottom of the frame, the left column) and farther (the top row, the right column) defocuses in proportion to its distance from it.

**The lens.** Under an authored pose the stage scales its circle of confusion with the camera's nearness (one over the focus distance squared), the way a thin lens does, so a camera half as far from its aim point defocuses the same page four times as hard. The frontal camera keeps the shipped lens exactly.

**Vertical reflow.** The capture stays at native density, so the 2160 px frame is a narrower crop into the page — the grid's middle column with its neighbours cut symmetrically — and the same `pageAnchor`, `aim`, and lens keep the same thumbnail sharp. No orientation-specific data.

## Channel chrome notes

- **The page is substrate, not chrome.** It keeps YouTube's own physics and is Pack-immune (stored-image fidelity). The emissive screen pass stays restrained; no scrim gradient is painted over it. Legibility on the page is the camera's job (focus, not a darken).
- **Stage finish is engine, not Pack:** the shipped warm grade and lens vignette of the stage compose pass apply to the whole frame, so the page reads as one photograph.
- **Intentional omissions:** no Overlays (an earlier draft floated a lower-third in front of the page; it made the piece read as a graphic and was removed); no `source-url` plate; no highlight or other marks (a captured page has no DOM text to mark); no page enter/exit; no `paper-grain`; no camera `move: push | drift` on top of the travel (one decisive move).
- Under `crt-terminal`, `clean-light`, `editorial-mono`, and `sentry`, the light Role changes the rake on the page; the page pixels never change. That is the Pack proof this piece carries.

## Engine work required

All phase-1 leaves of Dex epic `sh9b6qxd`, in order:

1. **Stage camera pose, aim, travel** — `StageCameraSchema` gains optional `pose { yaw, pitch, roll, distance, aim { x, y } }` and `travel { to, start, duration, ease }`; the math lives once in `src/lib/platform/pipelines/depth-stage-camera.ts` and is consumed by `DepthStage`, `resolveStageFrame`, and `createStageProjector`. Defaults are the shipped frontal camera bit-for-bit. Focus follows the aim when a pose is authored; the lens scales with the camera's nearness. Backdrop cover is computed from the frustum footprint.
2. **Depth-tested plane-basis stage** — `src/lib/platform/pipelines/depth-stage.ts`: `depth24plus` attachment with alpha-tested depth writes and premultiplied blending; one plane basis (origin, U, V, normal) for transform, rake, cast-shadow march, partial-presence and backdrop reconstruction; per-plane mip chains and an anisotropic sampler (`maxAnisotropy` 16); explicit ceilings on plane count, plane-texture bytes, and mip passes per frame.
3. **Posed Overlay planes** — `OverlaySchema.z` widens to `[-1, 1]`; optional `pose { yaw, pitch, roll }`; posed or explicit-`z` Overlays hoist into their own direct canvas child in `Composition.svelte` and get their own texture in `composition-planes.ts`; each posed plane is placed in the posed camera's frame (the Overlay's placement keeps meaning where it sits in the delivered frame); at most four posed planes; `createStageProjector` becomes per-plane. The proving Preset does not use one; the oblique fixture does.
4. **`website-screenshot` filmed framing and the capture registry** — `framing: 'browser' | 'filmed'`, `pageAnchor`, `content.captureAsset` (exclusive with `imageUrl`), `src/lib/assets/captures/` + `capture-assets.ts`, the capture script's `--scale 2 --out` authoring mode, the `filmed-page-crop` Identity dimension, inspector controls, and the WebMCP content operation.
5. **GUI and agent parity** — `DepthStageSection.svelte` (pose, travel, and aim as fields; an on-canvas aim handle was tried and removed because dragging the aim re-projects the page under the pointer), `OverlayInspector.svelte`, `SurfaceInspector.svelte`, undo/redo, round-trip, and the `appearance.set-stage` / overlay placement / content rows of `webmcp-operation-inventory.ts` (ADR-0054). A Surface with no entrance or exit still owns its timeline row, so the page can be selected and inspected.

Numeric ceilings (enforced semantically, corrective errors): camera `yaw` ±60°, `pitch` ±45°, `roll` ±30°, `distance` 0.25–2; Overlay `pose` the same bounds; `z` −1..1; at most 4 posed Overlay planes; plane textures at most 6 frame-sized rgba8 + rgba16float pairs resident (the Surface, the backdrop substrate, the shared Overlay plane, and up to four posed planes count against it — the ceiling exists so the count and the byte budget are both named).

Regression fixtures that must stay pixel-identical at the default pose: `depth-stage-demo`, `pullquote-on-photo`, `docu-map-journey`, `ntsc-signal-demo` (every Preset that declares `state.stage`), measured by `scripts/probe-frame-diff.ts` at three frames in both orientations.

## ADR required?

`already-filed: 0057-filmed-canvas-camera-pose-and-posed-planes` (ADR-0051 remains the phase-2 design).

## Open questions

None.

## What 'done' looks like

- `src/lib/platform/pipelines/depth-stage-camera.ts` — pose, aim, travel math shared by renderer, resolver, and projector
- `src/lib/platform/pipelines/depth-stage.ts` — depth-tested plane-basis compositor with mip/anisotropic sampling, the nearness-scaled lens, and ceilings
- `src/lib/platform/pipelines/composition-planes.ts` + `src/lib/platform/Composition.svelte` — per-Overlay posed planes
- `src/lib/platform/engine-schema.ts` — camera `pose`/`travel`, Overlay signed `z` + `pose`, `website-screenshot` `framing` / `pageAnchor` / `captureAsset`
- `src/lib/pipelines/surfaces/website-screenshot/` — filmed framing, `filmed-page-crop` Identity dimension
- `src/lib/assets/captures/syntax-youtube-videos.png` + `src/lib/platform/capture-assets.ts`
- `src/lib/platform/DepthStageSection.svelte`, `OverlayInspector.svelte`, `SurfaceInspector.svelte`, `CanvasEditingOverlay.svelte`, `webmcp-operation-inventory.ts` — parity
- `docs/preset-format.md`, `docs/preset-format.schema.json`, `docs/engine-architecture.md` — current-state contracts
- `src/lib/presets/website-filmed.json` — the deliverable
- deterministic Delivery passes native horizontal (3840×2160) and vertical (2160×3840) renders of the same Preset under every registered Pack through `scripts/run-gfx-render-matrix.mjs` on the CDP harness, plus `pnpm check`, `pnpm test`, `pnpm verify-presets`, the frame-diff no-op proof on every existing stage Preset, `probe-text-edge` / `probe-edge-aa` / `probe-banding` on the named critical frames (rest pose frame 0, mid-push 0.5, end 1.0), `probe-render-replay` on random seeks, `probe-export-decode` on WebM and ProRes
- the trusted human aesthetic decision on `gfx-review` binds the exact integrated revision/tree and matrix run, manifest, bundle, and evidence digests
- no orientation-specific or Pack-specific sibling Preset exists
