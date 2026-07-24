# ADR-0031 — iMessage: an interactive (choreographed) Surface

## Status

**Canon (v1 built).**

Date: 2026-06-26
Builds on: [ADR-0030](0030-web-document-emissive-surface.md) (per-site mocks, reused paper compositor), [ADR-0015](0015-identity-spec-per-pipeline.md) (Identity Spec)

## Context

The `web-document` Surface (ADR-0030) renders recognizable **web pages** — a card inside a browser window. iMessage is the explicit exception the user called out: it is **not a web page**. There is no browser chrome, and the whole point is the *interaction* — bubbles arriving, a typing indicator, receipts, tapbacks. A static screenshot of a chat is not the deliverable; the **choreography** is.

Two things made this a distinct Surface rather than another `web-document` site:

1. **Content shape.** Every web-document site fits the scalar content slots (`author`/`source`/`title`/`body`…). A conversation is an *ordered list of messages*, each with its own side, text, tapback, and receipt — a shape the single-`body` model can't carry.
2. **It animates over the clip.** The other surfaces settle in once and hold; iMessage plays a timed sequence (bubble → typing → bubble → highlight → tapback → reply → receipt) across the ~6s.

## Decision

A new **`imessage` Surface** (its own `type`, not a `web-document` site).

- **Content model.** `content.messages: ChatMessage[]`, where `ChatMessage = { from: 'me' | 'them', text, tapback?, status? }`. `text` is a body string (parsed to an `AnnotationBody`, so it may carry the hero `[highlight]`). The thread-level contact name reuses `content.author`. `content.body` is unused (empty).
- **Choreography is frame-deterministic.** The CanvasSource reads `animState.globalProgress` (0→1 over the transport) and schedules each bubble's pop-in (`easeOutBack` scale-from-the-tail), the three-dot typing indicator that precedes a reply, the tapback pop, and the Delivered → Read receipt — all as pure functions of progress. Preview == export; no wall-clock.
- **Stable layout.** Every bubble reserves its final space from frame 0 (visibility is scheduled via opacity/scale), so the thread never reflows as messages "arrive" and the highlight mark stays pinned to its phrase.
- **Reuses the paper compositor.** `createPaperPipeline` supplies DOM upload + the marks system, so the channel's `highlight` Annotation lands on a phrase **inside a received (gray, dark-ink) bubble**; the white page luminance selects the light/multiply blend (ADR-0030), so the dark bubble text reads through the amber.
- **Faithful, theme-able Messages look.** Light **or** dark theme, chosen from the preset's `paperColor` luminance (the same signal that picks the highlight blend) — so one Surface covers both, like real Messages. Gray (left) / blue (right) bubbles with grouped tail curls (tail only on the last of a same-sender run), a header (contact avatar + name, FaceTime icon), a heart-badge tapback on the bubble corner, and the bottom composer bar. No browser chrome, no CSS glow.

### Two engine changes this surfaced (both general, both kept)

- **`readMarks` now enumerates `content.messages[].text`, not only `content.body`.** The marks system built its color/progress arrays from `content.body` alone, so a `[highlight]` inside a message produced a DOM mark span (and geometry) but no registered mark — the highlight silently didn't draw. `readMarks` now walks the body slot then each message body, in DOM order, so the indices align with `getAnnotationMarkLayouts`.
- **`createPaperPipeline` gained a `substrate: 'paper' | 'flat'` option.** The paper compositor bakes a warm fiber/grain substrate into the captured DOM — right for paper/newspaper, wrong for a glowing screen. `flat` leaves the DOM untinted; iMessage opts in.

## Consequences

- iMessage is a real interactive Surface, not a screenshot — the bar is the motion, and it's measurable (the Identity Spec probes the arrival/typing/receipt/tapback dimensions across progress).
- The `messages` content shape is iMessage-only today; a future chat-style surface (SMS, Discord, Slack) can reuse it.
- v1 ships one authored conversation (`imessage-the-bug`, H+V). ~~There is no GUI editor for `messages[]` yet (authored as preset data); a future GUI parity task adds one.~~ **Shipped 2026-07-02:** the SurfaceInspector's Messages section edits the conversation per bubble (text with marks, sender, tapback, receipt, typing, add/remove), declared via `controls.messages` on the renderer; per-bubble timing stays on the timeline's message tracks and the per-bubble `message:N` sound cues surface in the Sound section.
- **Theme follows `paperColor`.** Light page → multiply highlight (dark bubble text reads through); dark page → ink-punch (light bubble text punched to ink). The dark theme matches the modern macOS Messages look (`docs/inspo/imessage/`). v1 ships both light and dark presets (H+V each).
- Open follow-ups: per-message **height-slide** on arrival (v1 pops in place), additional tapback glyphs beyond the heart, and image-attachment bubbles. (The GUI editor for `messages[]` shipped — see above.)
