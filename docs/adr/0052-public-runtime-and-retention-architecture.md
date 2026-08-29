# ADR-0052 — Host the public demo on a Node/ffmpeg origin with zero content retention

## Status

**Canon (ratified from live probes; runtime target built, public deployment pending).**

Date: 2026-08-28

Builds on: [ADR-0032](0032-gui-agent-parity-authoring.md) (local User compositions), [ADR-0043](0043-source-video-underlay.md) (the deterministic export foundation), and the standard-browser/WebMCP capability probe recorded in [`../standard-browser-rendering-probe.md`](../standard-browser-rendering-probe.md)

## Context

gfx.computer is going live as a public, no-account authoring demo. Everything about that demo except the runtime has been decided: the browser lane is measured, the WebMCP transport is specified, and the composition model is unchanged. What was still assumed rather than proven was the host.

The repository carried a Workers-shaped build (`@sveltejs/adapter-cloudflare`, `wrangler.jsonc`, generated worker types) that no server route could actually run on. Export is not an edge workload: a session spawns ffmpeg, streams native-resolution PNG frames into its stdin, writes the encoded file to private temp disk, and streams that file back once. Three live probes settled it:

- `wrangler deploy --dry-run` on the Workers build failed with 57 unresolved Node built-in imports, including `node:child_process`, `node:fs`, and `node:os`. The reproducible half of that measurement — the built-ins the server modules import — is recorded as `serverNodeBuiltins` in the probe evidence.
- The same tree built with `@sveltejs/adapter-node` produced a Node server that serves the whole demo, including both export lanes, from one process.
- The Node adapter's 512 KB `BODY_SIZE_LIMIT` default rejects every native-target frame upload with `413`. The public host must raise it; nothing in the code can compensate for it.

Measured cost, from `pnpm probe:public-runtime` against the built Node artifact with distinct high-entropy 3840×2160 frames (the worst case; real compositions compress far better):

| Lane                               | Output per native frame | Encode wall clock (8 frames) | Decoded                         |
| ---------------------------------- | ----------------------: | ---------------------------: | ------------------------------- |
| ProRes 4444 + PCM audio + timecode |             1,669,843 B |                       883 ms | `prores` 3840×2160, `pcm_s16le` |
| VP9 lossless, transparent          |               444,437 B |                     2,712 ms | `vp9` 3840×2160                 |

Cancellation released the encoder and its work directory in 6 ms; two concurrent sessions completed in 3.1 s wall clock; every terminal path left zero work directories and zero encoder processes.

## Decision

**One long-lived Node process, ffmpeg on the same host, private per-session temp disk, and no durable content of any kind.**

**Runtime.** SvelteKit builds through `@sveltejs/adapter-node`. The public artifact is a single Node server plus an ffmpeg binary exposing `libvpx-vp9`, `libopus`, `prores_ks`, and `pcm_s16le`. There is no second tier, no queue, and no render worker; the browser renders frames and the origin encodes them. The reproducible container that pins these versions is the next change, built against this contract.

**Cloudflare is DNS and proxy only.** No Workers, KV, D1, R2, Durable Objects, or Cloudflare-hosted state. `App.Platform` is gone: request handlers use Node APIs directly. This does not change how the engine is developed — local development stays local-only, and no library or architecture choice is ever made "for Cloudflare compatibility."

**Deployment inputs are one inventory.** `PUBLIC_RUNTIME_DEPLOYMENT_INPUTS` in `src/lib/platform/public-runtime-contract.ts` names every environment input the host reads, who owns it (this app or the adapter), and what it is for. `parsePublicRuntimeConfig` validates the app-owned ones and throws a corrective error on a malformed value, so a misconfigured host fails at startup rather than mid-export. `ORIGIN` and `BODY_SIZE_LIMIT` are required of a public host; `BODY_SIZE_LIMIT` must be at least `maxFrameBytes`.

**Limits are ratified here and enforced before any expensive work.** `PUBLIC_EXPORT_RUNTIME_LIMITS` fixes the public envelope: 15 seconds, 60 fps, 900 frames, 64 MiB per frame, 8 MiB of audio, a 2 GiB output ceiling, 2 concurrent sessions, a 15-minute idle expiry inside a 30-minute hard lifetime, and 8 GiB of free temp disk before the host admits traffic. The output ceiling is derived from the measured per-frame cost above with headroom (`RATIFIED_NATIVE_OUTPUT_BYTES_PER_FRAME`), and `public-runtime-contract.test.ts` keeps the numbers mutually consistent.

`public-export-limits.ts` decides whether one request, upload, or open session fits, and names the bound it missed with the value that would have fit. `ExportSessionStore.create` applies the transport ceiling, the envelope, and the concurrency slot in that order — before it spawns ffmpeg, and before it creates a work directory — claiming the slot in the same tick it checks so two callers cannot both win the last one. Duration is measured from the exact frame-rate rational, so 900 frames at 59.94 is refused as 15.015 seconds. Rate, frame count, and duration answer `400`; byte ceilings (per-frame, session total, audio, projected and actual output) answer `413`; a saturated host answers `429` with its running count; a session past either clock is removed and answers `410`. Frame pixel dimensions are deliberately not checked: the envelope is sized so only native-target work fits, but the transport still accepts whatever the client rendered, so the reduced-size verification sweeps keep using the same lane.

**Temp disk is private and per session.** Each session gets its own directory under the configured temp parent. Only the encoded output and, when present, the audio bed are ever written; frames stream into ffmpeg's stdin and are never stored. The directory is removed on completion, on failure, on cancellation, on idle expiry, and after the download drains — and a startup sweep removes anything a terminated process left behind.

**Downloads are single-shot and uncached.** The output response sends `Cache-Control: no-store` with an exact `Content-Length`, advertises no `Accept-Ranges`, and ignores a `Range` header; the session and its file are destroyed as the body finishes. A second request for the same output is a 404. Resumable downloads would require retaining rendered content, so they stay out of scope; the client re-exports instead.

**Observability is redacted by construction.** The export lane may emit only the keys in `PUBLIC_EXPORT_TELEMETRY_ATTRIBUTE_KEYS` — format, rate, frame count, audio bytes, opacity, whether a timecode was supplied, encode milliseconds, output bytes. No composition content, filenames, paths, or session identities. `/api/health` reports liveness and release identity only: no paths, versions, or capacity.

**No durable content.** The public runtime persists nothing on behalf of a visitor: no accounts, no server-side composition store, no uploaded media, no output archive. The local disk-backed User composition, asset, and poster surfaces are development-only and are excluded from the public artifact; browser-scoped persistence and that exclusion are separate changes under this epic.

**Rollback is verified against the origin.** `/api/health` reports the release the process is serving, from `GFX_RELEASE` or the checkout commit. A deploy or rollback is confirmed by reading that value back from the public origin rather than by trusting the deploy tool. Because sessions are in-memory and content is never durable, rolling back loses only in-flight exports.

## Consequences

- `wrangler.jsonc`, `worker-configuration.d.ts`, the `wrangler` and `@sveltejs/adapter-cloudflare` dependencies, and the `gen` script are gone. `pnpm build` now emits `build/index.js`.
- The host is stateful in memory: sessions live in one process, so it cannot be scaled horizontally without a session-affinity decision that this ADR does not make.
- Concurrency is deliberately small. Two native-resolution encodes already saturate a modest host, and the temp-disk reservation is sized for exactly that.
- ProRes remains available publicly despite costing about 1.7 MB per native frame; a full-length export is roughly 1.5 GB, which the output ceiling and the temp reservation both account for.
- `pnpm probe:public-runtime` is the regression gate for this ADR. It fails when a lane exceeds its ratified per-frame cost, when a download becomes cacheable or partial, when output survives its download, or when any terminal path retains a directory or an encoder process.
