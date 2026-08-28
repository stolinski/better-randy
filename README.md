# GFX

**gfx.computer** — a motion-graphics engine on a web stack.

GFX renders broadcast-quality motion pieces at native 4K: **transparent
overlays** you composite over footage in an editor, and **full-frame** segments
and bumpers. A piece is a JSON **Preset** that composes five Layers (Surface,
Block, Annotation, Overlay, Effect) from a Pipeline registry. A swappable
**Pack** supplies the appearance — the engine is general, the look is not. Every
piece reflows between horizontal (YouTube) and vertical (TikTok, Reels) targets
with platform safe-areas.

A person authors in the browser GUI. An agent authors through WebMCP. Both act
on the same visible composition.

Rendering is TypeGPU/WebGPU plus WICG HTML-in-Canvas, animated with GSAP and
encoded through Mediabunny and ffmpeg. Every frame is driven from an explicit
timestamp, so preview and export produce the same pixels at the same time.

## Running it locally

Node 24 or newer, and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:7263
```

Chrome needs `--enable-blink-features=CanvasDrawElement` to render the canvas.
An unflagged browser captures a blank frame. `scripts/launch-cdp-chrome.sh`
starts a browser that carries the flag.

## Checks

```sh
pnpm check           # svelte-check, eslint, discoverability
pnpm test            # vitest
pnpm verify-presets  # render and measure the Preset corpus
```

## Where to read next

- [`AGENTS.md`](AGENTS.md) — the binding rules, and which doc to read for which task.
- [`docs/CONTEXT.md`](docs/CONTEXT.md) — the glossary. One spelling per concept.
- [`docs/engine-architecture.md`](docs/engine-architecture.md) — how the engine works today.
- [`docs/preset-format.md`](docs/preset-format.md) — the Preset JSON format.
- [`docs/adr/`](docs/adr/) — why each decision was made.
