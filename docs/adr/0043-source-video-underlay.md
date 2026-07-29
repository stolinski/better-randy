# ADR-0043 — Source video beneath the Layer stack

## Status

**Canon foundation; singular state and authoring model superseded by [ADR-0045](0045-composition-media-library-and-video-track.md).**

Date: 2026-07-24
Builds on: [ADR-0002](0002-per-tool-routes-to-preset-engine.md) (one Preset engine), [ADR-0012](0012-effect-pack-context-progress-timestamp.md) (frame determinism), [ADR-0032](0032-gui-agent-parity-authoring.md) (one GUI/agent artifact), [ADR-0042](0042-resolve-marker-sync.md) (exact rational transport time)
Superseded in part by: [ADR-0045](0045-composition-media-library-and-video-track.md) (composition Media library + one primary Video track)

### 2026-07-28 amendment

This ADR records the shipped singular Source-video foundation and its machine verification. ADR-0045 replaces `state.sourceVideo`, the one-continuous-range authoring model, unconditional media-presence opacity, and the Source-video root inspector with canonical `state.media`, composition-scoped Media library entries, coverage-aware Video clips, Timeline-only temporal gestures, and right-rail Media mode. The historical key remains accepted only at migration ingress.

The following decisions remain current: footage sits beneath all five Layers rather than becoming a sixth Layer; explicit transport timestamps select presentation samples deterministically; one resident texture feeds the shared preview/export final-present compositor; Effects and Pack chrome do not silently grade footage; clip audio uses the deterministic export mix; native resolution, bounded export sessions, cancellation/cleanup, and creator-media privacy constraints remain unchanged.

## Context

Before this decision, Supers exported transparent overlays and self-contained opaque pieces, while creator footage existed only as a preview reference still deliberately excluded from export. The next product direction was automatic video creation: retain creator footage, remove silence, make basic cuts, and place Supers graphics over the resulting edit. The first required capability was simpler: one video had to play beneath the composition and export at the composition's full native resolution and exact frame rate.

Treating video as a Surface would invert the model. A Surface is already the bottom Layer and carries the authored material claim that Blocks and Annotations inhabit. Creator footage must sit beneath that complete five-Layer stack. Capturing an HTML video element through HTML-in-Canvas would also create a second, wall-clock media timeline and inherit compositor-layer capture failures. Server-only ffmpeg compositing would make preview and export use different pixel paths.

The eventual cutter adds another constraint. Silence removal does not change what the media asset is; it changes the mapping from composition Timeline intervals to source-media intervals. The v1 asset contract therefore must remain useful when an edit-segment mapping is added later.

## Historical decision (singular data/authoring details superseded by ADR-0045)

**Source video is optional composition input beneath all five Layers.** It is declared as `state.sourceVideo`, references one immutable content-addressed local asset, and in v1 maps one continuous source range onto the complete composition:

```text
media-relative timestamp = sourceOffsetSeconds + composition timestamp
requested presentation timestamp = track first PTS + media-relative timestamp
```

`transport` remains authoritative for composition duration, orientation, output format, and exact rational frame rate. `sourceOffsetSeconds` is relative to the media start, not an absolute container timestamp; the decoder adds the track's first presentation timestamp internally. For every explicit composition timestamp, it selects the source sample whose presentation timestamp is the last one less than or equal to the mapped source timestamp. This rule covers CFR, VFR, B-frame ordering, source rates above or below the output rate, random preview seeks, and serial export without wall-clock playback. The selected source range must cover the complete composition; v1 does not loop, hold, or silently reuse the last frame.

The decoded sample is uploaded to a resident GPU texture and centered-cover sampled directly into the native 3840x2160 or 2160x3840 render. The ordinary Supers branch renders to transparent premultiplied content and runs its authored Effects first. The final present pass composites that result over Source video. Consequently creator footage is not silently graded by composition Effects or Pack chrome, while every existing Layer and alpha edge behaves exactly as it does over external NLE footage.

Source video makes the output opaque and supplies its audio by default. `includeAudio` can mute it and `volume` controls its contribution to the deterministic 48 kHz stereo mix alongside existing Supers cues. Source audio is footage audio, not an authored bed.

### Implementation status (2026-07-27)

The v1 implementation is complete. GUI authors can transactionally attach, replace, trim, mute/gain-adjust, remove, autosave, and reopen Source video; agents use the same content-addressed asset API and standalone Preset through GET/PUT plus `supers render`/`batch`. Random preview seeks and serial export share the explicit timestamp decoder, resident GPU upload, and final-present compositor. Timeline playback uses the same deterministic Source-plus-cue audio mix as WebM, ProRes, and optional separate WAV; scrub remains intentionally silent.

Output classification treats Source video as opaque, yielding the `supers-bumper` basename and opaque VP9 path while ProRes remains 4444. Export runs through the bounded local session below; cancellation/expiry/download-completion paths kill live ffmpeg where applicable and remove session resources. Decoded samples close after each GPU upload, while source replacement and Workspace teardown dispose the decoder and resident texture. Source-specific Sentry context records only presence, audio inclusion, media-relative offset, and authored gain; it excludes asset URLs, filenames, source byte size, codec metadata, and creator content.

The `wb9ko99c` decoded-output gate passed on 2026-07-27 across the full native orientation/rate/codec/audio matrix. It verified CFR, VFR, B-frame, NTSC, rotated portrait, Source audio, cue-only, Source-plus-cue mix, transparent-overlay, and opaque-bumper controls from decoded deliverables rather than preview pixels alone. At the close of that historical epic, work stopped at the human boundary before ADR-0045 approved the Media/Video-track arc.

### Bounded local export transport amendment (2026-07-27)

The local HTTP/1.1 stack uses a server export session rather than one browser request body. A control request fixes format, exact rational rate, frame count, output classification, optional WAV length, and optional ProRes timecode. The browser uploads the WAV once, then renders and uploads exactly one indexed `image/png` frame at a time. The server accepts only the next monotonic index, verifies the PNG signature and byte limit, and does not acknowledge that frame until the ffmpeg stdin write callback has cleared. This response is the backpressure boundary: browser rendering cannot outrun encoder consumption by more than the current PNG/request buffers.

ffmpeg starts on frame zero and writes only to a session-private temporary output. Completion requires the declared frame count and a successful encoder exit before the output URL becomes available, so partial media is never addressable. The output route streams the finished disk file with `@sveltejs/kit/node` `createReadableStream`; GUI and Playwright use the URL as a native browser download and never call `response.blob()`. Stream completion or cancellation removes the session directory. The shared export `AbortSignal`, explicit DELETE, encoder/request failure, a 15-minute inactivity expiry, and startup orphan cleanup all kill a live encoder, cancel readers, and remove session files.

The session preserves the previous codec contract: transparent WebM requests `yuva420p` with VP9 alpha, opaque WebM requests `yuv444p`, and ProRes remains `prores_ks` profile `4444` with `yuva444p10le`. ffmpeg receives `formatFrameRateRational(rate)` and the unchanged non-drop `-timecode` value.

Measured evidence on 2026-07-27, using the committed native 3840x2160 `stage-export-frame.png` (1,284,526 bytes per PNG):

- A synthetic reproduction of the retired browser shape retained 120 distinct PNG Blobs plus the aggregate Blob: 154,143,120 aggregate bytes, 44.8 MiB starting RSS, 192.1 MiB RSS after frame accumulation, and 201,441,280-byte process maximum RSS. That memory grows with frame count before encoding can begin.
- The replacement sent 120 frames sequentially as a 4K/59.94 opaque WebM session. Encoding began at frame zero, completed in 29.081 seconds, produced 936,452 bytes, and measured 101.6 MiB client peak RSS (109,150,208-byte process maximum RSS). The Vite server returned from 13 MiB to 19 MiB RSS after the run; no `ffmpeg.*supers-export` process and no `supers-export-*` directory remained.
- Real ffmpeg 8.0.1 route probes produced disk-streamed 3840x2160 outputs for transparent VP9 (`alpha_mode=1`, `30000/1001`), opaque VP9 (`yuv444p`), and ProRes (`prores`, alpha-bearing 4444 decode, `30000/1001`, timecode `01:00:08:00`).

The stress sample is deliberately two seconds, not a footage-length creator render, to avoid monopolizing the shared development machine. Boundedness follows from the protocol's one-frame acknowledgement window and disk-backed output rather than from this sample's duration. The following native full-rate matrix passed with 6- and 12-frame deterministic fixtures; three additional cancellation cycles each removed their live encoder and private session directory, with warmed server RSS stable within 16 KiB across the final two cycles.

V1 rejects combinations with `backgroundFill`, a dimensional `stage`, or transition Presets. A fill would hide the Source video before Effects, a stage currently paints its own opaque backdrop, and snapshot transitions would freeze endpoint video. Failing these combinations is more honest than branch-order behavior that appears supported but discards or freezes creator media.

This proposed extension seam was superseded by ADR-0045. Cutting now produces ordered, non-overlapping `state.media.videoTrack.clips[]`; asset membership and per-clip audio/edit decisions are separate canonical records.

## Considered options

- **Make video a Surface** — rejected. Source video sits beneath the Surface Layer and must coexist with any transparent Surface, Blocks, Annotations, Overlays, and Effects.
- **Use the preview backdrop as the export source** — rejected. The reference backdrop is ephemeral judging UI, not Preset data, and has no deterministic decode contract.
- **Seek an HTMLVideoElement for each frame** — rejected. `currentTime` and media events are asynchronous browser playback mechanisms, not exact presentation-sample selection; HTML-in-Canvas capture of promoted media layers is also unreliable.
- **Composite Source video with ffmpeg after transparent export** — rejected. Crop, color conversion, timing, and alpha composition would differ between preview and export, breaking the shared frame seam.
- **Ship a clip/edit-list schema immediately** — rejected. V1 has one continuous range and must not carry inert placeholder fields. The domain boundary is chosen so edit segments can be added when cutting behavior is implemented and verified.
- **Run Effects over the combined footage and animation** — rejected as the default. Existing transparent compositions assume the footage is not theirs to treat. A future explicit footage-grade operation may opt into combined processing without changing Source video ownership.

## Consequences

- At decision time, `state.sourceVideo` was additive and absent from every existing Preset. ADR-0045 now accepts that key only for migration and serializes `state.media`.
- Source video assets are separate immutable local bytes. Standalone Preset JSON remains composition data and references an asset that must already exist in the local asset store; it does not embed multi-gigabyte media.
- Preview and export share one deterministic decoder and frame-preparation lifecycle. The Timeline remains the only clock.
- Large source files require byte-range serving and bounded-memory export transport; whole-file Blob decode and all-frame PNG accumulation are not acceptable creator-scale endpoints.
- Export sessions make HTTP request count proportional to frame count in exchange for a constant-size browser handoff on the local-only Node stack. The protocol is not a cloud upload API and carries no compatibility requirement for Workers or serverless request limits.
- Future silence removal remains an edit-decision producer, now over canonical Video clips rather than Source-video intervals; it is not a new renderer.
