# ADR-0043 — Source video beneath the Layer stack

## Status

**Canon (contract accepted; implementation in progress).**

Date: 2026-07-24
Builds on: [ADR-0002](0002-per-tool-routes-to-preset-engine.md) (one Preset engine), [ADR-0012](0012-effect-pack-context-progress-timestamp.md) (frame determinism), [ADR-0032](0032-gui-agent-parity-authoring.md) (one GUI/agent artifact), [ADR-0042](0042-resolve-marker-sync.md) (exact rational transport time)

## Context

Supers exports transparent overlays and self-contained opaque pieces, but creator footage currently exists only as a preview reference still that is deliberately excluded from export. The next product direction is automatic video creation: retain creator footage, remove silence, make basic cuts, and place Supers graphics over the resulting edit. The first required capability is simpler: one video must play beneath the composition and export at the composition's full native resolution and exact frame rate.

Treating video as a Surface would invert the model. A Surface is already the bottom Layer and carries the authored material claim that Blocks and Annotations inhabit. Creator footage must sit beneath that complete five-Layer stack. Capturing an HTML video element through HTML-in-Canvas would also create a second, wall-clock media timeline and inherit compositor-layer capture failures. Server-only ffmpeg compositing would make preview and export use different pixel paths.

The eventual cutter adds another constraint. Silence removal does not change what the media asset is; it changes the mapping from composition Timeline intervals to source-media intervals. The v1 asset contract therefore must remain useful when an edit-segment mapping is added later.

## Decision

**Source video is optional composition input beneath all five Layers.** It is declared as `state.sourceVideo`, references one immutable content-addressed local asset, and in v1 maps one continuous source range onto the complete composition:

```text
source timestamp = sourceOffsetSeconds + composition timestamp
```

`transport` remains authoritative for composition duration, orientation, output format, and exact rational frame rate. For every explicit composition timestamp, the decoder selects the source sample whose presentation timestamp is the last one less than or equal to the mapped source timestamp. This rule covers CFR, VFR, B-frame ordering, source rates above or below the output rate, random preview seeks, and serial export without wall-clock playback. The selected source range must cover the complete composition; v1 does not loop, hold, or silently reuse the last frame.

The decoded sample is uploaded to a resident GPU texture and centered-cover sampled directly into the native 3840x2160 or 2160x3840 render. The ordinary Supers branch renders to transparent premultiplied content and runs its authored Effects first. The final present pass composites that result over Source video. Consequently creator footage is not silently graded by composition Effects or Pack chrome, while every existing Layer and alpha edge behaves exactly as it does over external NLE footage.

Source video makes the output opaque and supplies its audio by default. `includeAudio` can mute it and `volume` controls its contribution to the deterministic 48 kHz stereo mix alongside existing Supers cues. Source audio is footage audio, not an authored bed.

V1 rejects combinations with `backgroundFill`, a dimensional `stage`, or transition Presets. A fill would hide the Source video before Effects, a stage currently paints its own opaque backdrop, and snapshot transitions would freeze endpoint video. Failing these combinations is more honest than branch-order behavior that appears supported but discards or freezes creator media.

Silence detection, cut generation, and manual cutting are a following arc. They extend `sourceVideo` with ordered, non-overlapping timeline-to-source edit segments. The asset URL, audio policy, and volume remain asset-level fields, so every v1 composition continues to mean one implicit full-span segment and requires no replacement schema or asset migration.

## Considered options

- **Make video a Surface** — rejected. Source video sits beneath the Surface Layer and must coexist with any transparent Surface, Blocks, Annotations, Overlays, and Effects.
- **Use the preview backdrop as the export source** — rejected. The reference backdrop is ephemeral judging UI, not Preset data, and has no deterministic decode contract.
- **Seek an HTMLVideoElement for each frame** — rejected. `currentTime` and media events are asynchronous browser playback mechanisms, not exact presentation-sample selection; HTML-in-Canvas capture of promoted media layers is also unreliable.
- **Composite Source video with ffmpeg after transparent export** — rejected. Crop, color conversion, timing, and alpha composition would differ between preview and export, breaking the shared frame seam.
- **Ship a clip/edit-list schema immediately** — rejected. V1 has one continuous range and must not carry inert placeholder fields. The domain boundary is chosen so edit segments can be added when cutting behavior is implemented and verified.
- **Run Effects over the combined footage and animation** — rejected as the default. Existing transparent compositions assume the footage is not theirs to treat. A future explicit footage-grade operation may opt into combined processing without changing Source video ownership.

## Consequences

- `state.sourceVideo` is additive and absent from every existing Preset, so old transparent and opaque pieces retain their current pixels and classification.
- Source video assets are separate immutable local bytes. Standalone Preset JSON remains composition data and references an asset that must already exist in the local asset store; it does not embed multi-gigabyte media.
- Preview and export need one shared deterministic decoder and frame-preparation lifecycle. The Timeline remains the only clock.
- Large source files require byte-range serving and bounded-memory export transport; whole-file Blob decode and all-frame PNG accumulation are not acceptable creator-scale endpoints.
- Future silence removal is an edit-decision producer over Source video intervals, not a new renderer or a replacement composition model.
