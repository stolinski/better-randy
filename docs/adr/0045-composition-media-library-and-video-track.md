# ADR-0045 — Composition Media library and one primary Video track

## Status

**Canon (current model; supersedes ADR-0043's singular state and authoring model).**

Date: 2026-07-28
Builds on: [ADR-0032](0032-gui-agent-parity-authoring.md) (one standalone GUI/agent artifact), [ADR-0034](0034-gui-design-authoring-interface.md) (three-zone authoring UI), [ADR-0042](0042-resolve-marker-sync.md) (exact rational transport frames), [ADR-0043](0043-source-video-underlay.md) (deterministic decode/composite/audio/export foundation)

## Context

ADR-0043 proved one creator video beneath all five Layers with deterministic presentation-sample selection, one resident GPU texture, final-present compositing, Source audio, bounded export, and privacy-safe diagnostics. Its deliberately singular `state.sourceVideo` shape could attach one asset and trim one continuous full-composition range. Basic cutting would have made that asset object simultaneously represent stored bytes, composition membership, Timeline placement, and audio policy.

Those are different domains. Immutable bytes can be shared globally, a composition can retain several named inputs, and the Timeline can use an asset zero, one, or several times. Probe metadata also changes independently of an authored composition and must not churn Preset JSON. The approved editor still needs Supers's restrained three-zone UI: temporal footage editing belongs on the Timeline, not in a property form or a new Project document.

## Decision

### 1. Canonical Preset state

`supers@1` remains the schema identifier. The only canonical media shape is:

```jsonc
"media": {
  "assets": [
    {
      "id": "interview-a",
      "kind": "video",
      "name": "Interview A",
      "assetUrl": "/api/user-assets/<sha256>.mp4"
    }
  ],
  "videoTrack": {
    "clips": [
      {
        "id": "opening",
        "assetId": "interview-a",
        "timelineStartFrame": 0,
        "durationFrames": 180,
        "sourceStartSeconds": 4.25,
        "audio": { "enabled": true, "gain": 1 }
      }
    ]
  }
}
```

`media` defaults to `{ "assets": [], "videoTrack": { "clips": [] } }`. Asset and clip IDs are stable, non-empty, and unique within their collections. Every clip reference resolves. Clips are ordered by `timelineStartFrame`, have positive integer `durationFrames`, remain inside the composition frame count and source duration, and never overlap. Unused Media library entries are valid.

Only stable authored facts persist. A Media library entry stores `id`, `kind`, `name`, and `assetUrl`; a Video clip stores identity, reference, placement, Source start, and audio policy. Duration, dimensions, rotation, average frame rate, codec, audio layout, byte size, readiness, and probe errors are volatile observations returned by asset inspection. They are not Preset fields.

The content-addressed bytes behind `assetUrl` are global to the local Supers installation and deduplicated by content. `state.media.assets[]` is composition membership. Multiple entries and compositions may reference the same bytes with independent IDs and names. Removing membership never deletes shared bytes.

### 2. One deterministic Video track

V1 has one primary Video track beneath all five Supers Layers. It is not a Surface, Substrate, Effect, sixth Layer, Add-layer option, or separate Project artifact. It is an ordered 1x edit lane with hard cuts and transparent gaps.

Each clip occupies the half-open interval:

```text
[timelineStartFrame, timelineStartFrame + durationFrames)
```

At explicit output frame `F`, the active clip satisfies `start <= F < end`. Its mapping is:

```text
localFrame    = F - timelineStartFrame
Source time   = sourceStartSeconds + framesToSeconds(localFrame, transport rate)
requested PTS = media track first PTS + Source time
```

The decoder selects the last presentation sample at or before the requested PTS. The transport's exact rational rate controls frame/second conversion, so CFR, VFR, B-frame sources, NTSC output, non-zero first PTS, random seeks, and serial export share one rule. Decoder/cache ownership keys by immutable asset identity/URL rather than clip offset. Exactly one resident underlay texture holds the active decoded frame. A gap yields no texture and never paints black, holds the prior frame, or reuses stale audio.

Effects and Pack chrome process the premultiplied Supers result first. The final present pass centered-cover composites that result over the active Video clip at native target resolution with source display rotation. ADR-0043's deterministic decoder, compositor ordering, one-texture residency, cleanup, and bounded export decisions remain in force.

### 3. Audio and output classification

Each enabled clip decodes the same Source interval used by its pixels, places it in the matching destination interval, applies `audio.gain`, and mixes it deterministically with Supers cues and an eligible bed at 48 kHz stereo. Disabled clips contribute no footage audio. Hard cuts and gaps remain exact in preview and export; scrub remains silent.

Media library membership alone never changes output classification. A Video track is opaque only when its ordered clip intervals cover every composition frame. Any gap preserves transparent output; the renderer does not manufacture coverage. `backgroundFill` and a dimensional stage remain independently opaque. Fully covered WebM uses the opaque lane, gapped WebM retains alpha, and ProRes remains 4444 for both.

### 4. Authoring placement

ADR-0034's no-left-panel and three-zone decisions remain. The existing right rail gains an Inspector/Media mode switch; Media is not a permanent fourth panel. Media mode owns the composition library: transactional upload, composition-owned names, volatile probe/readiness details, drag affordances, and safe removal. A referenced entry cannot be removed until its clips are removed; removing an entry never deletes global bytes. Library-only changes participate in the same fork/autosave behavior as every Preset edit.

The Timeline is the sole temporal authoring surface. Dragging a Media library entry to the fixed Video track creates a clip. Body drag moves; left trim changes start, duration, and Source start by the same frame delta; right trim changes duration; Alt/Option interior drag slips Source time only. Snapping, composition bounds, neighboring clips, source coverage, and deterministic tie-breaking clamp every integer-frame write. The selected Video clip Inspector exposes audio enabled/gain and removal only. The root Inspector carries no Source-time, trim, or duration controls.

### 5. Migration and interchange

The shared Preset ingress temporarily accepts legacy `supers@1` input containing `state.sourceVideo` only. It validates that historical shape, then deterministically creates one Media library entry and one frame-0 full-span Video clip preserving asset URL, media-relative offset, audio inclusion, gain, and exact rational frame count. The legacy key is removed before canonical runtime state.

Input containing both `state.sourceVideo` and `state.media` is ambiguous and rejected. Canonical parse, GUI state, GET/PUT interchange, JSON export, CLI import, and first autosave emit `state.media` only. No dual-write period exists.

Standalone Preset JSON remains the complete composition artifact but not a media bundle. There is no Project artifact around it. Moving a composition between installations requires ingesting its referenced bytes and updating entry URLs; it does not require a second manifest type.

### 6. V1 exclusions

V1 does not include multiple Video tracks, overlaps, ripple edits, clip transitions, speed changes, loops/holds, source-footage grading, depth-stage video planes, live video transitions, silence detection, automatic cut generation, proxy management, linked audio tracks, or a general media-bin Project model. Thumbnail strips are optional presentation, not contract. Silence removal may later produce ordinary Video clips; it does not require another authored media shape.

Active Video clips remain invalid with `backgroundFill`, a dimensional `stage`, or transition Presets in v1. Those combinations fail validation rather than hiding footage, painting an independent backdrop, or freezing video in cached transition snapshots.

### 7. Diagnostics and privacy

Sentry may record bounded aggregate operational facts needed to diagnose export, such as whether Video clips participated, clip count, coverage, audio inclusion, and authored Source-time/gain summaries. It must not record Media library IDs, names, URLs, filenames, content hashes, byte sizes, codec/probe metadata, or decoded creator content. ADR-0043's privacy boundary remains and gains bounded aggregation for a multi-entry library.

## Considered options

- **Extend `state.sourceVideo` with segments** — rejected. It keeps bytes, membership, edit decisions, and audio policy collapsed into one singular object and cannot represent unused composition media cleanly.
- **Add a Project/media-bin artifact above Preset** — rejected. User composition remains the standalone authoring unit; another persisted envelope would break GUI/agent parity and interchange.
- **Make each video a Surface or Layer** — rejected. Footage sits beneath the complete five-Layer stack, and Add layer must remain registry-backed composition vocabulary.
- **Put Media in a new left panel** — rejected. The existing right rail can switch modes without adding a fourth workspace zone or undoing the timeline-as-outline decision.
- **Persist probe metadata for convenience** — rejected. Technical observations can change after decode/probe upgrades and are not authored render decisions.
- **Allow overlapping clips and resolve by order** — rejected. V1 has one primary hard-cut track; silent z-order rules would make pixels and audio ambiguous.
- **Treat any clip or library entry as opaque** — rejected. Gaps are intentionally transparent and classification must describe actual frame coverage.

## Consequences

- Media library membership, Video editing, preview, export, GUI autosave, agents, and CLI share one strict `state.media` contract.
- ADR-0043 remains the rationale for exact presentation-sample selection, final-present compositing, footage-audio ownership, bounded export transport, native resolution, cleanup, and privacy. Its singular state and authoring sections are historical.
- Existing legacy compositions upgrade without behavior loss, while dual-key input fails loudly and all output converges immediately on canonical media.
- The constrained one-track model is sufficient for basic cuts and silence-removal output without turning Supers into a general NLE.
