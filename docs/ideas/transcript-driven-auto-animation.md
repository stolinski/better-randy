# Transcript-Driven Auto Animation

**Status:** Unbuilt product idea. This document describes a possible transcript-to-Preset workflow, not a current route, service, manifest contract, or batch renderer. Current engine facts are called out explicitly below; all product-flow steps remain future work.

## Pitch

Drop a video into Supers. The app transcribes it, an AI pass reads the transcript to decide what kinds of overlay animations would land at each moment, and Supers emits a batch of transparent overlay clips keyed to the original timecodes. The editor drops them onto their timeline and the talking-head footage suddenly has receipts, callouts, quotes, and citations.

## Flow

The following flow is proposed, not implemented:

1. User ingests a video Media asset, adds a composition-scoped Media library entry, and places Video clips on the primary Video track.
2. Transcribe with word-level timestamps.
3. AI segmentation pass labels intent per span: research citation, statistic, quote, definition, named entity, concept, tangent, joke, etc.
4. AI selection pass picks a Supers **Preset** per labeled span based on intent + emphasis. The Preset encodes the Surface, content shape, marks, overlays, effects, and transport (see [`preset-format.md`](../preset-format.md)) — there is no separate "tool" coordinate (retired by [ADR-0002](../adr/0002-per-tool-routes-to-preset-engine.md)).
5. For spans that need external content (research papers, tweets, articles, definitions), an enrichment pass fetches the source and extracts what we need (title, authors, abstract, key figure, quoted line, URL, screenshot).
6. Supers queues a render job per span: Preset slug (or freshly-authored Preset JSON) + extracted content + in/out timecodes.
7. Batch export produces a folder of transparent overlays, named by timecode, ready to drop into Resolve/Premiere.

## What the AI is choosing

- **Which exact catalog Preset** maps to the span's intent. Current candidates include `research-paper-attention`, `research-paper-critique`, `quote-magnify`, `quote-lift-out`, `quote-tear-out`, and `lower-third`. These filename groupings are catalog search aids, not schema-level Preset families.
- **Which composition treatment** fits the beat: aggressive vs. subtle, mark density, and ease feel. Orientation is a transport setting on one reflowing Preset, never a choice between horizontal and vertical sibling Presets.
- **Which current primitive can carry enriched evidence.** Structured web content uses the existing `web-document` Surface, stored captures use `website-screenshot`, and sequential explanations compose the shipped diagram Blocks. A future dedicated Pipeline must be proposed and shipped through the normal Brief/ADR process; `tweet`, `webpage`, and `timeline-explainer` are not current Surface types.
- **Duration and anchor frame**: snap to the phrase, leave a beat after the punch word. Translates to `transport.durationSeconds` and per-span `start`/`duration` fractions inside the Preset.
- **Confidence**: low confidence proposals get flagged for review instead of auto-included.

## Enrichment examples

- "A 2021 Stanford study showed..." → search → fetch paper → `research-paper-attention` or `research-paper-critique` with the real title, sourceUrl, and a `[highlight]…[/highlight]` mark on the relevant abstract sentence.
- "There's a post from..." → fetch and verify the post → existing `web-document` for structured content or `website-screenshot` for a faithful stored capture.
- "If you look at the docs for X..." → fetch the docs page → existing `web-document` or `website-screenshot` with an Annotation marking the relevant section.
- "Three things matter here..." → an existing quote Preset or a composition of the shipped diagram Blocks for sequential reveals, no external fetch needed.

## Output shape

- A manifest JSON per span: `{ spanId, startTime, endTime, presetSlug, presetJson, content, sourceUrl, confidence }`. `presetSlug` is set when picking from the catalog; `presetJson` is set when authoring a fresh Preset from scratch (mutually exclusive with `presetSlug`).
- One transparent WebM or ProRes 4444 MOV per span, named `hh-mm-ss-ff__<preset-slug>.<format>`.
- An optional Resolve/Premiere XML or EDL so overlays land on the timeline already aligned.

## Open questions

- Where does transcription run? Local Whisper vs. cloud API. Quality vs. cost vs. privacy.
- Which model does the intent labeling? Same pass or two passes (segment, then label)?
- How do we keep enrichment fetches honest? Citations need to actually match what the speaker said, not just be a plausible-looking paper. Probably needs a verification step or a confidence threshold below which we skip the fetch.
- How does the user steer it? A pre-render review UI where each proposed overlay is a card the user can accept, swap Preset, edit copy, or kill — before any rendering happens.
- Batch render cost: rendering N transparent overlays for a 40-minute video is a lot of GPU time. Queue + progress UI matters.
- Re-runs: if the user changes Video clips or Source time, how do we re-key transcript timecodes without redoing the whole pipeline?
- Does the AI **pick from the catalog** or **author fresh Presets** for content that doesn't fit any built-in? Agents can author schema-valid Preset JSON today, but no transcript automation or runtime AI-authoring contract is implemented. Start with catalog selection plus explicit Preset edits; treat automatic fresh authoring as future work.

## Why this fits Supers

Supers already has the Preset catalog, composition Media library, one frame-addressable Video track, `CompositionExportController`, and transparent export primitives. Transcript ingestion, segmentation, enrichment, proposal review, automatic cut generation, batch orchestration, and NLE manifest generation are all unbuilt product work.

## Adjacency

Shipped prerequisite: the CLI render/batch lane is documented in [`user-composition-workflows.md`](../user-composition-workflows.md), with its original design history in [`history/cli-video-generation.md`](../history/cli-video-generation.md). The CLI accepts complete Presets, not content overrides, so this future flow must materialize one complete Preset per span before handing the batch to the renderer.
