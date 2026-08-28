# Managed Chromium Render Worker

> Captured 2026-08-14 from Scott's idea. Speculation tier — not designed, not scheduled.

## Pitch

Let agents edit standalone `gfx@1` Presets and export them through one command without opening, navigating, or controlling a visible browser. GFX still renders through its canonical WICG HTML-in-Canvas + WebGPU path; a local or private remote Render Worker owns the compatible Chromium process and launches it with `--enable-blink-features=CanvasDrawElement`.

The intended agent experience is ordinary domain-level automation:

```sh
supers preset validate ./composition.json
supers render ./composition.json --out ./composition.mov
```

Chromium remains the rendering runtime, but its page, feature flags, profile, CDP connection, and lifecycle become private exporter infrastructure.

## Why

GFX already has the hard contracts:

- agents and the GUI author the same standalone Preset;
- the User composition API provides a validated GET/edit/PUT loop;
- `supers render` and `supers batch` drive the same deterministic Workspace export seam as the GUI;
- the browser streams indexed frames and final audio through the bounded local ffmpeg session.

The remaining friction is operational. The shipped CLI requires both the local server and sanctioned flag-enabled Chrome to be running before it starts. An agent should not need Chrome DevTools MCP, browser navigation, a visible window, or manual CDP setup merely to export a Preset.

## Proposed boundary

The Render Worker would own:

1. a local production GFX server rather than a separately managed development server;
2. a dedicated compatible Chromium process launched with the required HTML-in-Canvas and WebGPU flags;
3. an isolated browser profile and private CDP connection or debugging pipe;
4. feature, GPU, font, ffmpeg, and nonblank HTML-in-Canvas health probes;
5. a bounded serial render queue, cancellation, timeouts, cleanup, and output artifacts;
6. reuse of a warm browser between jobs where that improves latency without leaking composition state.

The existing Workspace and `CompositionExportController` remain the only render path. The worker must not introduce a second renderer, replace HTML-in-Canvas, reimplement composition logic in Node, or make preview and export diverge.

## Agent-facing surface

The first interface should be a self-managing CLI over Preset concepts rather than browser concepts. Candidate operations for research:

- get, put, and validate a standalone Preset;
- render one full animation;
- render one exact frame or a bounded contact sheet through the same frame seam;
- run a serial batch and return every failure;
- inspect worker health and stop a worker owned by the caller.

A standard MCP server may later expose the same domain operations for remote agents. It should be a thin transport over the worker, never a collection of click, navigate, or DOM-manipulation tools. The in-session WebMCP idea remains separate: it serves a copilot collaborating with an open Workspace, while this worker serves unattended local, remote, batch, and Critic exports.

## Local and remote shapes

The smallest useful version is local and private: the CLI starts or connects to a loopback worker, submits the Preset, waits for the output path, and never exposes Chromium to the agent.

A later private remote worker could run the same stack on a GPU-equipped machine. Agents would submit standalone Presets and separately upload content-addressed Media asset bytes, then retrieve artifacts. This does not require publishing the GFX editor or turning rendering into a public service.

Electron is optional packaging, not an architectural requirement. It could bundle and configure Chromium for a one-click creator installation, but it would call the same worker and render seam.

## Research questions

- Does current Chromium produce correct native-4K HTML-in-Canvas and WebGPU output under `--headless=new`, or must the worker run a headed but hidden/minimized process?
- Should GFX pin or bundle Chromium, or verify a compatible system Chrome at startup?
- Can the worker use a private debugging pipe instead of a listening CDP port?
- What is the reliable ownership model when another sanctioned Chrome or GFX process is already running?
- How long should a warm worker live, and which GPU/browser failures require a clean process restart?
- Can exact-frame and contact-sheet capture reuse `renderCompositionFrameTo` without weakening the current export ordering and paint acknowledgments?
- What authentication and artifact-retention boundary is sufficient for a private remote worker?
- Which machine-verifiable comparison proves worker output matches the shipped GUI/CLI path for alpha, fonts, Packs, orientation, audio, video clips, and frame cadence?

## Non-goals

- Removing, replacing, or reducing GFX's use of HTML-in-Canvas.
- Letting a webpage enable browser feature flags; the worker owns process launch.
- Creating a second Preset format, Project artifact, or renderer.
- Exposing generic browser automation as the agent API.
- Requiring a hosted or publicly deployed GFX application.
- Choosing Electron before the worker boundary is proven independently.

## Graduation evidence

Prototype one self-contained local command that accepts a standalone Preset and produces its declared WebM or ProRes output with no pre-opened page, manual dev server, DevTools MCP session, or separately launched Chrome. The prototype must use the existing Workspace export seam, preserve native resolution and transparency, pass the existing export-decode checks, match exact-frame reference captures, clean up failed and canceled jobs, and document the compatible Chromium lifecycle. With that evidence and an approved worker/API design, the idea may graduate to the roadmap and Dex.
