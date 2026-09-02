# The filmed canvas — an obliquely filmed web page with a card floating in front

**Kind:** domain
**Slug:** filmed-canvas
**Pack:** syntax
**Verification preset:** `website-filmed`

Decision record: [ADR-0057](../adr/0057-filmed-canvas-camera-pose-and-posed-planes.md). Direction plate: [`docs/inspo/3d-canvas/perspective.png`](../inspo/3d-canvas/perspective.png). Dex epic `sh9b6qxd`, phase 1.

## Pitch

A documentary insert the channel uses constantly and the engine cannot make today: a real web page on a real screen, filmed by a camera that is not square to it. The camera sits low and to the left of the Syntax channel's YouTube video grid, close enough that the page runs off every edge, focus resting on one thumbnail while the rows above and below fall softly out of focus. Over seven seconds the camera dollies in a touch and pans across the grid, the focus riding with it, while a Syntax card floats angled in front of the page, casting its shadow onto the screen. It lands because it reads as footage, not as a graphic: parallax between card and page, continuous focus falloff across one flat surface, one light on everything. Under every Pack the page stays the page (it is a quoted capture) and only the card changes its dress.

## Surface(s) involved

`website-screenshot` in a new `filmed` framing. The shipped `browser` framing (the `website-showcase` construction: a browser window inside the safe area, three control dots, all four capture edges visible) stays the default. `filmed` lays the stored capture at native density (one capture pixel per frame pixel) covering the frame with no browser chrome, anchored so an authored page point sits at frame centre; the frame is a crop into the page exactly as [ADR-0056](../adr/0056-newspaper-photographed-page.md) crops into the newspaper. The Surface keeps its full Pack immunity and its emissive `web-document-screen` shader pass.

The capture is a **bundled capture asset**, not a `/api/user-assets` upload: `src/lib/assets/captures/syntax-youtube-videos.png`, taken from `https://www.youtube.com/@syntaxfm/videos` at a 2560×2000 CSS-pixel viewport and device scale 2 (5120×4000) by the capture script's authoring mode — wider than the horizontal frame so `pageAnchor` chooses the crop and the grid, not the page gutters, fills the plane — and referenced as `content.captureAsset: "syntax-youtube-videos"`. The Surface plane stays frame-sized; the camera is authored to keep its footprint on the page (rubric rule WS7 fails the Preset otherwise). A corpus deliverable must render from a clean worktree; the gitignored user-asset store cannot promise that.

Depth: `state.stage.type: "depth"`, solid backdrop from `backgroundFill: "pack"` (the backdrop is never in shot at the authored poses; it exists so the stage classifies opaque and so a Pack switch fields the piece correctly).

## Content sample

Page: the live capture of `https://www.youtube.com/@syntaxfm/videos` at authoring time, committed verbatim as the bundled asset. `content.sourceUrl` is `https://www.youtube.com/@syntaxfm/videos`. The Surface prints no text of its own.

Overlay `lower-third` (variant `standard`), verbatim:

- kicker: `SYNTAX ON YOUTUBE`
- title: `Three new episodes every week`
- subtitle: `youtube.com/@syntaxfm`

## Motion plan

The Syntax rule for depth pieces applies: substrate and depth pieces may camera; chrome never does. The camera is the piece's motion; the card uses **settled-place**; there is no page entrance because a filmed page has no entrance — the cut is the entrance (ADR-0056 §3).

Transport: 8 s, 30 fps, horizontal authored, vertical reflowed. (The card carries nine words; the deterministic reading-window check asks 200 words per minute doubled — 5.4 s of hold — which a 7 s cut could not give it alongside the entrance.)

| Beat        | Time (fraction) | What happens                                                                                                                                                                                                                                                                                                                              |
| ----------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rest pose   | 0.00            | Camera at `pose` A: yaw −20°, pitch +6°, roll 0, distance 0.5, aim `(0.58, 0.42)` — just right of the first row's middle thumbnail (`pageAnchor` `(0.54, 0.44)` centres the grid's first two rows in the plane). Focus follows the aim; aperture 0.5, band 0.05. The page already fills the frame.                                        |
| Travel      | 0.00 → 0.85     | One `travel` to pose B: yaw −13°, pitch +4°, distance 0.46, aim drifting down and left to `(0.44, 0.55)`, the second row's middle thumbnail, ease `smooth`. The dolly is small (a felt push, never a zoom); the pan is the read. Because focus follows the aim, the rack focus from the first-row thumbnail to the second-row thumbnail is the travel itself. |
| Card enters | 0.12 → 0.22     | The lower-third **settled-place** enters bottom-left inside the safe area, posed `z` −0.18 (nearer the camera than the page), yaw +10°, pitch −3°, so it floats off-axis to the page. A posed plane is placed in the camera's frame, so the card stays put while the page moves behind it — that relative motion is the parallax. Its cast shadow lands on the page; the page's rake lights its plate. Sound: the intrinsic `impact` cue. |
| Hold        | 0.22 → 0.93     | Nothing else moves but the camera.                                                                                                                                                                                                                                                                                                        |
| Card exits  | 0.93 → 1.00     | Smooth exit of the card only — it carries the exit into the cut.                                                                                                                                                                                                                                                                          |
| Cut         | 1.00            | The camera holds at pose B; the piece ends on a cut.                                                                                                                                                                                                                                                                                      |

Focal slot: the aimed thumbnail (first row, middle column at rest; second row, middle column at the end). The card is the only other sharp element; it sits within the focus band by construction (near the aim depth) so its type is crisp.

**Vertical reflow.** The capture stays at native density, so the 2160 px frame is a narrower crop into the page — the grid's middle column with its neighbours cut symmetrically — and the same `pageAnchor` and `aim` keep the aimed thumbnail centred. The lower-third takes a vertical orientation override to `bottom-center`, lifted to 0.18 of the frame so it clears the 16% platform-safe band, with the same pose. No other orientation-specific data.

## Channel chrome notes

- **The card is the Syntax card system** (aesthetic.md § The Card System): `#141413` plate, `4px #454441` border, `16px` radius, the stepped hard-offset shadow, Grotesk 700 title, `#c9c6bc` byline, Space Mono kicker in `#ffd54a`. The stage's cast shadow is the _scene_ shadow on the page, a different thing from the card's own stepped stack, which stays baked in the capture; both are matte. No gaussian shadow, no glow, no gloss.
- **The page is substrate, not chrome.** It keeps YouTube's own physics and is Pack-immune (stored-image fidelity). The emissive screen pass stays restrained; no scrim gradient is painted over it. Legibility on the page is the camera's job (focus, not a darken).
- **Stage finish is engine, not Pack:** the shipped warm grade and lens vignette of the stage compose pass apply to the whole frame, so card and page read as one photograph.
- **Intentional omissions:** no `source-url` plate (the card's subtitle carries the URL; two plates would be redundant chrome); no highlight or other marks (a captured page has no DOM text to mark); no page enter/exit; no `paper-grain`; no camera `move: push | drift` on top of the travel (one decisive move).
- Under `crt-terminal`, `clean-light`, `editorial-mono`, and `sentry`, the card takes each Pack's plate, ink, accent, edge, depth, light, and font Roles; the light Role changes the rake and shadow on the page; the page pixels never change. That is the Pack proof this piece carries.

## Engine work required

All phase-1 leaves of Dex epic `sh9b6qxd`, in order:

1. **Stage camera pose, aim, travel** — `StageCameraSchema` gains optional `pose { yaw, pitch, roll, distance, aim { x, y } }` and `travel { to, start, duration, ease }`; the math lives once in `src/lib/platform/pipelines/depth-stage-camera.ts` and is consumed by `DepthStage`, `resolveStageFrame`, and `createStageProjector`. Defaults are the shipped frontal camera bit-for-bit. Focus follows the aim when a pose is authored. Backdrop cover is computed from the frustum footprint.
2. **Depth-tested plane-basis stage** — `src/lib/platform/pipelines/depth-stage.ts`: `depth24plus` attachment with alpha-tested depth writes and premultiplied blending; one plane basis (origin, U, V, normal) for transform, rake, cast-shadow march, partial-presence and backdrop reconstruction; per-plane mip chains and an anisotropic sampler (`maxAnisotropy` 16); explicit ceilings on plane count, plane-texture bytes, and mip passes per frame.
3. **Posed Overlay planes** — `OverlaySchema.z` widens to `[-1, 1]`; optional `pose { yaw, pitch, roll }`; posed or explicit-`z` Overlays hoist into their own direct canvas child in `Composition.svelte` and get their own texture in `composition-planes.ts`; each posed plane is placed in the camera's frame (the Overlay's placement keeps meaning where it sits in the delivered frame); at most four posed planes; `createStageProjector` becomes per-plane.
4. **`website-screenshot` filmed framing and the capture registry** — `framing: 'browser' | 'filmed'`, `pageAnchor`, `content.captureAsset` (exclusive with `imageUrl`), `src/lib/assets/captures/` + `capture-assets.ts`, the capture script's `--scale 2 --out` authoring mode, the `filmed-page-crop` Identity dimension, inspector controls, and the WebMCP content operation.
5. **GUI and agent parity** — `DepthStageSection.svelte`, `OverlayInspector.svelte`, `SurfaceInspector.svelte`, the editor-only aim handle in `CanvasEditingOverlay.svelte`, undo/redo, round-trip, and the `appearance.set-stage` / overlay placement / content rows of `webmcp-operation-inventory.ts` (ADR-0054).

Numeric ceilings (enforced semantically, corrective errors): camera `yaw` ±60°, `pitch` ±45°, `roll` ±30°, `distance` 0.25–2; Overlay `pose` the same bounds; `z` −1..1; at most 4 posed Overlay planes; plane textures at most 6 frame-sized rgba8 + rgba16float pairs resident (the Surface, the backdrop substrate, the shared Overlay plane, and up to four posed planes count against it — the ceiling exists so the count and the byte budget are both named); 4K preview at the reference pose ≥ 40 fps on the reference machine.

Regression fixtures that must stay pixel-identical at the default pose: `depth-stage-demo`, `pullquote-on-photo`, `docu-map-journey`, `ntsc-signal-demo` (every Preset that declares `state.stage`), measured by `scripts/probe-frame-diff.ts` at three frames in both orientations.

## ADR required?

`already-filed: 0057-filmed-canvas-camera-pose-and-posed-planes` (ADR-0051 remains the phase-2 design).

## Open questions

None.

## What 'done' looks like

- `src/lib/platform/pipelines/depth-stage-camera.ts` — pose, aim, travel math shared by renderer, resolver, and projector
- `src/lib/platform/pipelines/depth-stage.ts` — depth-tested plane-basis compositor with mip/anisotropic sampling and ceilings
- `src/lib/platform/pipelines/composition-planes.ts` + `src/lib/platform/Composition.svelte` — per-Overlay posed planes
- `src/lib/platform/engine-schema.ts` — camera `pose`/`travel`, Overlay signed `z` + `pose`, `website-screenshot` `framing` / `pageAnchor` / `captureAsset`
- `src/lib/pipelines/surfaces/website-screenshot/` — filmed framing, `filmed-page-crop` Identity dimension
- `src/lib/assets/captures/syntax-youtube-videos.png` + `src/lib/platform/capture-assets.ts`
- `src/lib/platform/DepthStageSection.svelte`, `OverlayInspector.svelte`, `SurfaceInspector.svelte`, `CanvasEditingOverlay.svelte`, `webmcp-operation-inventory.ts` — parity
- `docs/preset-format.md`, `docs/preset-format.schema.json`, `docs/engine-architecture.md` — current-state contracts
- `src/lib/presets/website-filmed.json` — the deliverable
- deterministic Delivery passes native horizontal (3840×2160) and vertical (2160×3840) renders of the same Preset under every registered Pack through `scripts/run-gfx-render-matrix.mjs` on the CDP harness, plus `pnpm check`, `pnpm test`, `pnpm verify-presets`, the frame-diff no-op proof on every existing stage Preset, `probe-text-edge` / `probe-edge-aa` / `probe-banding` on the named critical frames (rest pose frame 0, mid-travel 0.45, card-hold 0.6, end 1.0), `probe-render-replay` on random seeks, `probe-export-decode` on WebM and ProRes
- the trusted human aesthetic decision on `gfx-review` binds the exact integrated revision/tree and matrix run, manifest, bundle, and evidence digests
- no orientation-specific or Pack-specific sibling Preset exists
