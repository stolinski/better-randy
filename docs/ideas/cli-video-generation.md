# CLI Video Generation

## Pitch

Generate Hiviz overlay videos from the command line. No browser, no clicking through controls. Point the CLI at a Preset and get back a transparent video file.

```sh
pnpm hiviz render --preset ./inputs/study.json --out ./out/study-overlay.webm
pnpm hiviz render --preset research-paper-critique --out ./out/critique.webm
```

A **Preset** is the only coordinate. It already declares the surface, blocks, annotations, overlays, effects, and transport (duration / fps / format / orientation) — see [`preset-format.md`](../preset-format.md). The CLI does not invent a parallel "tool" concept (retired by [ADR-0002](../adr/0002-per-tool-routes-to-preset-engine.md)) and does not accept content overlays or transport flag overrides. If you want different content, you produce a different Preset.

## Why

- Unblocks the [[transcript-driven-auto-animation]] idea — that flow needs to render N overlays without a human driving the UI. Each span produces a complete Preset; the CLI renders it.
- Lets the app be scripted: batch renders, CI-generated previews, regression snapshots, scheduled jobs.
- Decouples "design a Preset" (browser, interactive) from "produce the final clip" (headless, reproducible).
- Makes overlays diffable. A Preset checked into a repo deterministically produces the same video. Reproducibility = Preset JSON + git SHA.

## Surface (v1)

```
hiviz render --preset <slug-or-path> --out <file>
hiviz batch <manifest.json>
```

That's it. Two subcommands. No `list`, no `validate`, no `preview`:

- Listing built-in slugs is `ls src/lib/presets/`.
- Validation happens implicitly at render time — a malformed Preset fails `hiviz render` with the same Zod error `parsePreset` would throw anywhere.
- Previewing a built-in is `open http://localhost:5173/p/<slug>` in the editor; previewing an arbitrary file isn't supported until the editor route grows a load-from-payload entry.

`--preset` accepts either a built-in slug (resolved against `src/lib/presets/*.json`) or a path to a complete Preset JSON document. The AI step in [[transcript-driven-auto-animation]] emits complete Presets, so it feeds straight in.

### Batch manifest

```jsonc
[
  { "preset": "./spans/00-12-04.json", "out": "./out/00-12-04.webm" },
  { "preset": "./spans/00-12-19.json", "out": "./out/00-12-19.webm" }
]
```

`hiviz batch` runs jobs serially against a single reused Chromium page. A failed job logs the error and the batch continues. Exit code is `0` if all jobs succeeded, non-zero if any failed; the final stderr line names the failed jobs.

## Architecture

The render path is the existing engine running headlessly. There is no second rendering path.

- **Host:** the CLI is `scripts/hiviz.ts`, run via `pnpm hiviz ...`. It lives next to the existing `scripts/probe-*.ts` and `scripts/verify-presets.ts`, imports from `src/lib/` via `resolve()` + dynamic import, and is never picked up by Vite.
- **Renderer:** Playwright launches headless Chromium with the `canvas-draw-element` flag enabled (the exact launch arg should be probed from a working Chrome's `chrome://version/` before being hard-coded). The CLI assumes the dev server is already running at `:5173` (per `CLAUDE.md`, never starts one) and fails with a clear error if it isn't reachable.
- **Render route:** a new SvelteKit route `/render` that mounts only `Composition` + the GPU pipeline + `export-video.ts` — no `Controls`, no `TrackInspector`, no `TimelineScrubber`. It accepts a Preset (injection mechanism is implementation detail; `addInitScript` setting `window.__hivizPreset` is the obvious starting point), waits for `document.fonts.ready`, calls the existing `exportTransparentWebM` or `exportTransparentProRes` based on `transport.format`, and exposes the resulting `Blob`'s `ArrayBuffer` to the CLI.
- **Encoding:** stays in Chromium, identical to the in-app exporter. The CLI extracts the `ArrayBuffer` via `page.evaluate` and writes it. Bit-identical to in-app preview; zero new encoder code. ProRes still POSTs PNG frames to `/api/export/prores` exactly as today.
- **Batch:** the Chromium page is reused across jobs to amortize cold-boot. Each job either re-navigates `/render` with a fresh injected Preset, or calls a Playwright-bound `window.__hivizRender(preset)` function — pick one when implementing.

## Output

- Format and dimensions come from the Preset's `transport` block (`webm` | `prores`, orientation → 3840×2160 or 2160×3840). The CLI does not override.
- `--out` is the only delivery flag.
- Exit code: `0` on success, non-zero on encoder failure, schema validation failure, or timeout. Stderr carries human-readable errors; stdout carries the output path.
- `--json` (TBD) emits NDJSON progress lines on stdout instead, for upstream tools that consume the CLI programmatically.

## Non-goals (v1)

- **No quality gating.** `hiviz render` produces a file iff the encoder didn't error. The Critic stays a separate, intentional step (see [`critic.md`](../critic.md)). Reasoning: Critic runs are slow and cost money; gating every batch render N× is not worth the per-render cost. A future `--verify` flag is reasonable but out of scope.
- **No transport overrides.** `--duration`, `--fps`, `--aspect`, `--format` are not flags. Want different transport? Edit the Preset.
- **No content overlays.** `--content` is not a flag. Content lives in the Preset.
- **No `--tool`.** Retired by ADR-0002.
- **No CLI-managed dev server.** The dev server is the user's responsibility.

## Remaining opens

- **The exact Chromium launch arg for `canvas-draw-element`.** Probe a working Chrome's `chrome://version/` to capture the actual feature flag string before hard-coding.
- **Font load gate.** The render route must `await document.fonts.ready` before kicking off frame 0; otherwise frame-deterministic output silently regresses when a typeface isn't ready in time. Worth a runtime assert.
- **Long-render memory ceiling.** In-Chromium encoding holds the full encoded buffer in browser memory. Span-length clips (2–12s) are fine; >60s 4K@60 may not be. If the transcript-driven flow ever wants long single clips, we'd need to revisit (frame-streaming to a Node-side encoder is the escape hatch).
- **CI without a dev server.** v1 assumes the dev server is already up. CI machines don't have one. The fix is `vite preview` against a built artifact, owned by whatever script invokes the CLI in CI; not the CLI's job.
- **Batch page-reuse mechanism.** Re-navigate per job vs. expose a `window.__hivizRender` and call it per job. Pick when implementing; both are workable.
- **NDJSON vs TTY progress.** Default to TTY-friendly progress; `--json` switches to NDJSON for programmatic consumers.
