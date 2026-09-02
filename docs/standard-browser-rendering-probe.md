# Standard-browser rendering and WebMCP probe

> **Status (Dex qju2qity): the render lane this probe selected is mothballed.** The DOM-rasterization fallback existed for the since-descoped public demo; locally the app now hard-gates on CanvasDrawElement and a standard browser only ever sees the capability-gate notice. The Chrome 152 WebMCP result below is historical capability evidence, not evidence for the current lifecycle contract. Since the 2026-09-02 ADR-0054 amendment, GFX registers WebMCP tools only on Chrome 153 or newer and verifies them through `pnpm eval:webmcp`. The default local agent browser remains the combined-flag `agent` mode (`CDP_BROWSER_MODE=agent scripts/launch-cdp-chrome.sh`, CDP 9229).

This probe answers the first runtime question for the public WebMCP demo: what works in a WebMCP-enabled Chrome when GFX cannot use the experimental `CanvasDrawElement` API?

The exact machine-readable result is [`browser-probes/standard-browser-rendering.json`](browser-probes/standard-browser-rendering.json). Reproduce it with:

```bash
# The dev server is already running at http://localhost:7263.
GFX_PUBLIC_DEMO_LANE=1 pnpm run probe:standard-browser
```

The probe uses `scripts/launch-cdp-chrome.sh` in two isolated browser profiles:

- port 9223: canonical `CanvasDrawElement` rendering;
- port 9225: WebMCP enabled, with `CanvasDrawElement` deliberately absent.

The launcher assigns a distinct default port to each browser mode. It leaves an existing process alone, so the probe validates the expected WebMCP and CanvasDrawElement capability matrix before recording evidence and fails on a stale or swapped session.

## Browser and API result

Tested on Google Chrome **152.0.7977.64** on macOS.

| Capability                                    | Canonical canvas mode | Standard WebMCP mode |
| --------------------------------------------- | --------------------: | -------------------: |
| `document.modelContext`                       |                absent |              present |
| Register and list a WebMCP tool               |           unavailable |               passed |
| `navigator.gpu` and an adapter                |                passed |               passed |
| `GPUQueue.copyElementImageToTexture`          |               present |               absent |
| `HTMLCanvasElement.requestPaint`              |               present |               absent |
| bundled Inter and Space Grotesk fonts         |                loaded |               loaded |
| deterministic `OfflineAudioContext` render    |                passed |               passed |
| anchor download, Blob URL, File System Access |               present |              present |
| secure context                                |                   yes |                  yes |
| cross-origin isolated                         |                    no |                   no |

The current local response sends no `Permissions-Policy`, COOP, or COEP header. Chrome's effective policy includes `tools` only in the WebMCP-enabled session. SharedArrayBuffer is therefore unavailable, but the tested fallback does not require it.

Chrome 152 exposed the original WebMCP shape behind the `WebMCP` Blink feature. That measurement proved initial registration only. It did not prove detachable registration, reversible family disclosure, or independent execution cancellation; those require the Chrome 153 browser eval.

## Rendering result

The unmodified GFX composition canvas is a uniform blank native frame in standard WebMCP mode for both test cases. This reproduces the known failure without inferring it from console errors.

The probe then clones the direct layout-subtree DOM child and rasterizes it with `html2canvas` 1.4.1 into a native 3840×2160 2D canvas. It tests:

- `lower-third`, a transparent overlay;
- `outro-watch-next`, an opaque full-frame composition.

| Case               | Standard canvas | Fallback frame        | Native raster time | Pixels within 8 RGB levels of DOM reference |
| ------------------ | --------------- | --------------------- | -----------------: | ------------------------------------------: |
| `lower-third`      | blank           | nonblank, transparent |           191.0 ms |                                      98.18% |
| `outro-watch-next` | blank           | nonblank, opaque      |           208.2 ms |                                      91.40% |

The transparent sample contains 8,373 nonzero-alpha pixels out of a 480×270 sample; the full-frame sample contains all 129,600. Raster times and exact frame hashes are recorded in the JSON evidence. Fidelity compares html2canvas with native browser rendering of the same static DOM clone. It does not compare unsynchronized animation states: the standard session exposes the layout subtree but does not initialize the canonical timeline, while the canonical nonblank control is explicitly captured at 50% progress.

## Selected smallest fallback

Select **native-resolution DOM clone rasterization with `html2canvas`** for the first standard-browser lane.

This is a measured starting point, not canonical-engine parity:

- Preview can show the cloned DOM vocabulary without painting a background the composition did not request.
- Production export must initialize and seek a deterministic fallback timeline independently, then rasterize at 3840×2160 or 2160×3840 and pass that frame to the existing encoder.
- The measured 191–208 ms native raster cost is about five frames per second before encoding, so it is suitable for correctness-first export and low-rate preview, not 30/60 fps interactive playback.
- WebGPU effects, separately captured depth planes, video underlays, and exact canonical pixel parity remain unsupported in this smallest lane.
- The current standard session does not finish canonical GPU or timeline initialization, so the production fallback must own timeline setup independently of the canonical `CanvasDrawElement` host. The probe measures static DOM raster fidelity and records the unsynchronized canonical control separately rather than presenting them as the same frame.

The downstream runtime-architecture task can now ratify a bounded flat-composition lane and keep advanced branches on the managed canonical renderer until separate probes close those gaps.

## Downstream

The bounded lane this probe selected shipped as `standard-browser-dom-capture.ts` and `composition-dom-rasterizer.ts`, and was then extended past the flat-composition boundary above. The per-branch routing — multiple Layers and the plane split, depth/effects, image and Video substrate, text animations, transitions, both orientations, every Pack, and the poster and export paths — is documented in [`html-in-canvas-typegpu.md`](html-in-canvas-typegpu.md#how-each-composition-branch-reaches-the-lane) and enforced by `scripts/test-dom-capture-lane-seam.ts`. The measurements above are the record of what this probe observed and are not restated by that work.

## Two-lane render verification

The probe above measured a fallback against a static DOM clone. The shipped lane is verified differently: `pnpm verify:browser-render` renders the same composition in **both** browsers and compares them.

```bash
# The dev server must serve the checkout under test.
GFX_BASE_URL=http://localhost:7263 pnpm verify:browser-render
```

It launches CDP port 9223 (flagged `CanvasDrawElement`) and port 9225 (standard WebMCP, neither capture API), asserts each session really is the lane it claims before any of its pixels count as evidence, and then renders one bounded coordinate per composition branch in both. Each coordinate is one Preset × Pack × orientation, measured at that composition's own **mid** checkpoint — never `checkpoint:opening`, which is frame 0, where a correctly authored composition has not entered yet and every pixel check would measure an empty frame. Nine coordinates cover HTML text, the web-document Surface, Overlays, Annotation marks, diagram and chart Blocks, the image substrate, the depth stage, the effect chain, text animations, transparent and opaque output, both orientations, and all four registered Packs; the Video underlay is uploaded from a decoded `VideoFrame` and never touches the DOM, so it is covered by `scripts/test-dom-capture-lane-seam.ts` instead of a live coordinate. A branch with no coordinate, or a coordinate whose evidence is missing, fails the gate — it is never skipped.

Before the first pixel and again after the last, the driver asserts `/api/verification/source-identity` against the local checkout's fingerprint over `src`, `scripts`, and `package.json`. A machine running this gate has more than one GFX origin available — the long-lived `:7263` dev server and whatever a worktree is serving — and two flagged browsers pointed at the wrong one produce a full, plausible, meaningless matrix. The scope deliberately excludes `docs/`, so the evidence a run writes never changes the identity the next run asserts. Both ends are checked because a restart or a checkout swap mid-sweep would otherwise split one verdict silently across two builds.

The branch list, coordinates, checks, tolerances, and budget are `scripts/browser-render-verification.ts`; the driver is `scripts/verify-browser-render-matrix.mjs`; the recorded run is [`browser-probes/browser-render-verification.json`](browser-probes/browser-render-verification.json), which records the revision and scoped fingerprint it measured.

What the gate decides is **lane parity**: the established lane is its reference, not its subject. Where the established lane's own frame already breaks what the composition declared, the verdict records it by name under `establishedLaneDefects` and leaves the comparison passing, because `output-class-mismatch` in the deliverable render matrix owns that defect and blaming the public path for it would hide the real one. The recorded run carries one such entry: `docu-map-journey × crt-terminal` renders a feathered transparent frame edge — measured as a ramp from alpha 0 at the edge to 255 about twelve pixels in — on a composition that declares an opaque background, in both orientations and in both lanes.

### The performance budget

The selected public path is the `dom-rasterization` lane, and it is the only lane the budget gates: **4,000 ms to settle one native frame** — seek, rasterize every direct canvas child at 3840×2160 or 2160×3840, upload, render, and present. That is a correctness-first export and low-rate preview budget, not an interactive playback one. The recorded run settles the nine coordinates in 382–949 ms (worst: the vertical chart), so the budget holds roughly a 4× margin over the heaviest branch measured. The flagged lane's cost is recorded beside it — 49–83 ms in the same run, since it hands the DOM to the compositor instead of rasterizing it — and is not gated.

### What the gate found

Four defects were only visible because both lanes were compared at the same address. The first three all produced the same symptom — the standard lane exporting the frame _before_ the one asked for — from three different causes:

- **The settling paint was requested before the seek.** `seekDeterministicTimelineFrame` asked for the settling paint, then seeked. In the WICG lane that is safe: `requestPaint()` runs on the browser's own paint tick, which happens after the synchronous seek. The rasterization lane starts reading the DOM the moment the request lands, so whenever no pass happened to be in flight it rasterized the _pre-seek_ DOM and the settle returned with the previous frame resident. It now seeks, flushes the DOM, and only then settles — correct in both lanes. This was the intermittent one: which coordinate failed depended on whether a raster was already running.
- **The settle raced the pass it asked for.** `waitForNextPaint` raced the requested rasterization against whichever paint landed first, so a pass still finishing the previous frame satisfied the wait in ~60 ms — far less than a 4K raster costs. The lane now awaits the pass it requested, which is guaranteed to read the DOM at or after the request.
- **A settled paint was not a composited frame.** The paint handler records the paint and then _queues_ the composite (`renderAt` → `queuePreview`); the decode, upload, and GPU submit happen inside the controller's async drain. Waiting on the paint record alone therefore read the previous composite. `settleCompositionPaint` now awaits `settleQueuedPreview()`, and the verification seam then awaits submitted GPU work and two frame boundaries — two because the first `requestAnimationFrame` runs _before_ the paint that presents the frame and `toBlob` reads the presented image.
- **Modern CSS colour functions blanked whole compositions.** `oklch()`, `color()`, and the `color(srgb …)` that `color-mix()` computes to all throw inside html2canvas 1.4.1's CSS parser, failing the entire raster — one `color-mix()` box-shadow on a diagram node was enough. `normalizeCompositionCloneColors` rewrites the mounted clone's resolved colours into legacy `rgb()` / `rgba()`. The conversion paints each colour into a 1×1 context and reads the pixel back, because the `fillStyle` **getter** serializes a CSS Color 4 value straight back as `oklch(...)` or `color(srgb …)` — reading it converts nothing.

Those three causes shared one property that made them expensive to find: a settle that composited nothing returns exactly like a settle that succeeded, and the canvas keeps the previous frame. The seam no longer assumes. `VideoUnderlayRuntimeController.readRenderedPreviewGeneration()` counts only the composites that actually reached the canvas — `renderPreparedPreview` now reports whether it composited, so a declined host, a superseded request, and an `unavailable` frame render are all excluded — and `__settleGfxDeterministicCompositionFrame` requires that count to advance across the settle, re-driving the frame up to four times and then failing rather than returning pixels that belong to another address. A dropped composite is now a named error, not a quietly wrong frame.

A fifth gap was structural: nothing could measure composition geometry on the public path at all, because a standard browser never lays out canvas fallback content. See [`html-in-canvas-typegpu.md`](html-in-canvas-typegpu.md#measuring-a-composition-a-standard-browser-never-lays-out).
