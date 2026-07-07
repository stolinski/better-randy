# Transcript-Driven Auto Animation

## Pitch

Drop a video into Supers. The app transcribes it, an AI pass reads the transcript to decide what kinds of overlay animations would land at each moment, and Supers emits a batch of transparent overlay clips keyed to the original timecodes. The editor drops them onto their timeline and the talking-head footage suddenly has receipts, callouts, quotes, and citations.

## Flow

1. User uploads or links a source video.
2. Transcribe with word-level timestamps.
3. AI segmentation pass labels intent per span: research citation, statistic, quote, definition, named entity, concept, tangent, joke, etc.
4. AI selection pass picks a Supers **Preset** per labeled span based on intent + emphasis. The Preset encodes the Surface, content shape, marks, overlays, effects, and transport (see [`preset-format.md`](../preset-format.md)) — there is no separate "tool" coordinate (retired by [ADR-0002](../adr/0002-per-tool-routes-to-preset-engine.md)).
5. For spans that need external content (research papers, tweets, articles, definitions), an enrichment pass fetches the source and extracts what we need (title, authors, abstract, key figure, quoted line, URL, screenshot).
6. Supers queues a render job per span: Preset slug (or freshly-authored Preset JSON) + extracted content + in/out timecodes.
7. Batch export produces a folder of transparent overlays, named by timecode, ready to drop into Resolve/Premiere.

## What the AI is choosing

- **Which Preset family** maps to the span's intent. Today's families: `research-paper-*` (paper Surface with decorative marks on body text), `quote-*` (paper Surface with focal marks — magnify / lift-out / tear-out / vertical), `lower-third` (plain Surface with a lower-third overlay). Planned future families would unlock once the corresponding Surface or Overlay types ship: tweet (`tweet` Surface), webpage-evidence (`webpage` Surface), timeline-explainer (`timeline-explainer` Surface) — all listed as future in [`engine-architecture.md`](../engine-architecture.md).
- **Which specific Preset within the family**: aggressive vs. subtle, vertical vs. horizontal, mark density, ease feel.
- **Duration and anchor frame**: snap to the phrase, leave a beat after the punch word. Translates to `transport.durationSeconds` and per-span `start`/`duration` fractions inside the Preset.
- **Confidence**: low confidence proposals get flagged for review instead of auto-included.

## Enrichment examples

- "A 2021 Stanford study showed..." → search → fetch paper → `research-paper-*` Preset with the real title, sourceUrl, and a `[highlight]…[/highlight]` mark on the relevant abstract sentence.
- "There's a tweet from..." → fetch tweet → (future) tweet-Surface Preset with the tweet content.
- "If you look at the docs for X..." → fetch the docs page → (future) webpage-Surface Preset with a circled region marking the relevant section.
- "Three things matter here..." → existing `quote-*` Preset or (future) timeline-explainer Preset for sequential reveals, no external fetch needed.

## Output shape

- A manifest JSON per span: `{ spanId, startTime, endTime, presetSlug, presetJson, content, sourceUrl, confidence }`. `presetSlug` is set when picking from the catalog; `presetJson` is set when authoring a fresh Preset from scratch (mutually exclusive with `presetSlug`).
- One transparent WebM/MOV per span, named `hh-mm-ss-ff__<preset-slug>.webm`.
- An optional Resolve/Premiere XML or EDL so overlays land on the timeline already aligned.

## Open questions

- Where does transcription run? Local Whisper vs. cloud API. Quality vs. cost vs. privacy.
- Which model does the intent labeling? Same pass or two passes (segment, then label)?
- How do we keep enrichment fetches honest? Citations need to actually match what the speaker said, not just be a plausible-looking paper. Probably needs a verification step or a confidence threshold below which we skip the fetch.
- How does the user steer it? A pre-render review UI where each proposed overlay is a card the user can accept, swap Preset, edit copy, or kill — before any rendering happens.
- Batch render cost: rendering N transparent overlays for a 40-minute video is a lot of GPU time. Queue + progress UI matters.
- Re-runs: if the user edits the source video (cuts a section), how do we re-key timecodes without redoing the whole pipeline?
- Does the AI **pick from the catalog** or **author fresh Presets** for content that doesn't fit any built-in? Pick-from-catalog is simpler and AI-authoring-from-schema is already a path the engine supports (per the `AI authoring contract` section in `engine-architecture.md`). Probably start with catalog-pick + parameterized overrides; AI-authored Presets are a v2.

## Why this fits Supers

Supers already has the Preset catalog and the deterministic, frame-addressable timeline + transparent export pipeline. The missing piece is the front end that says "given this transcript, here are 47 overlays you probably want." That front end is the product.

## Adjacency

Companion idea: [`cli-video-generation.md`](cli-video-generation.md) — once this flow exists, the CLI is the natural batch-rendering surface for the auto-generated manifest. The CLI takes a Preset slug + optional content overrides; the auto-animation flow produces N Preset references with content overrides per span; the CLI renders them.
