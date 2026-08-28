# Standard-browser rendering and WebMCP probe

This probe answers the first runtime question for the public WebMCP demo: what works in a WebMCP-enabled Chrome when Supers cannot use the experimental `CanvasDrawElement` API?

The exact machine-readable result is [`browser-probes/standard-browser-rendering.json`](browser-probes/standard-browser-rendering.json). Reproduce it with:

```bash
# The dev server is already running at http://localhost:7263.
pnpm run probe:standard-browser
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

Chrome 152 still exposes WebMCP behind the `WebMCP` Blink feature. The probe proves the browser API shape and tool registration; it does not claim that every public stable browser enables WebMCP by default.

## Rendering result

The unmodified Supers composition canvas is a uniform blank native frame in standard WebMCP mode for both test cases. This reproduces the known failure without inferring it from console errors.

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
