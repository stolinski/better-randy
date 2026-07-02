# iMessage floating bubbles — movie-style chromeless thread

**Kind:** pipeline
**Slug:** imessage-friday-deploy
**Verification preset:** imessage-friday-deploy

## Pitch

The movie treatment of a text conversation: nothing but the bubbles, floating
directly over footage — no Messages window, no iOS header, no composer bar.
The existing `imessage` Surface (ADR-0031) already choreographs the whole
interaction (bubble pop-in, typing indicator, tapbacks, Delivered → Read
receipts) but hardcodes the app window around it. This adds a **chrome mode**
to that Surface — `chrome: 'window' | 'none'` — so the same conversation can
render as the film-insert look every Netflix show uses when a character texts.
For the channel it's the highest-frequency use case: a dev-culture punchline
playing out over b-roll without a fake phone screen eating the frame.

## Surface(s) involved

Extends the existing **`imessage`** Surface
(`src/lib/pipelines/surfaces/imessage/`). No new Surface; a new mode on the
existing one. `chrome: 'window'` (default) is the current faithful Messages
window; `chrome: 'none'` drops the page background, header, timestamp, and
composer bar, keeping only the bubble thread.

## Content sample

Verbatim — this ships in the verification preset's `surface.content.messages`:

1. `them`: "did you just push to prod"
2. `me`: "it was one line" — `status: "read"` (Delivered → Read receipt)
3. `them`: "it's 4:55 on a friday" — preceded by the typing indicator,
   `tapback: "emphasize"` (‼) pops on it after arrival
4. `me`: "see you monday 🫡"

`author`: "Wes" (drives nothing visible in chromeless mode — kept for the
window-mode round-trip and GUI parity).

## Motion plan

Chosen combination: **substrate-darken + pop-in (existing spring) + eased exit**.

- **substrate-darken** (lean-in, `aesthetic.md § Motion Vocabulary`): a
  localized radial vignette (≤ 30% of frame) rises under the thread column as
  the surface enters, giving the bubbles legibility over any footage grade.
  Rendered by the Surface itself in chromeless mode (see Engine work) — it is
  part of the surface's visibility ramp, frame-deterministic.
- **Bubble pop-in**: the existing per-message `enter` spring (easeOutBack
  scale, binary opacity at appear) carries over unchanged.
- **Timeline shape** (normalized, 6s @ 30fps, same transport as the
  `imessage-the-bug` family):
  - `0.00` — surface enter begins; vignette rises with `paperVisibility`
  - `0.07` — msg 1 pops ("did you just push to prod")
  - `0.22` — msg 2 pops ("it was one line"), receipt runs Delivered → Read
  - `0.38` — typing indicator; resolves into msg 3 ("it's 4:55 on a friday")
  - `~0.55` — ‼ tapback pops onto msg 3
  - `0.70` — msg 4 pops ("see you monday 🫡")
  - `0.90` — surface `exit` (schema-supported): thread + vignette ease out
- **Focal slot**: msg 3 — "it's 4:55 on a friday" (the punchline; typing
  suspense before it, tapback emphasis after it).
- **Sound**: `soundKit: "message-pop"` and the `message-send` sample on the
  `me` messages, exactly as the existing family.

No lean-out moves.

## Channel chrome notes

**Fully bare by design** — the film-insert treatment. Intentional omissions
(carry all of these into the Preset `description` so the Critic doesn't flag
`aesthetic-miss`):

- **Mono signature thread: omitted.** Consistent with the iMessage family's
  faithful-OS-artifact stance (the window presets carry no mono either).
  Speaker identity reads from bubble side + color, as in film.
- **Hard offset shadow: omitted.** OS artifact, not collage layer.
- **Torn edge: omitted.** Same reason.
- **Registration jitter: omitted.** Same reason.
- **Grit overlay: omitted.** `effects: []`, matching the family.

The substrate-darken vignette is the only added element, and it's a sanctioned
lean-in move, not collage chrome.

## Engine work required

All inside the existing `imessage` pipeline + schema:

1. **Schema** (`src/lib/platform/engine-schema.ts`): add
   `chrome: 'window' | 'none'` to the imessage surface, default `'window'`.
   ⚠ Known footgun: schema `.default()` is not applied at runtime for
   existing presets (`validateOverlayContents` precedent) — the renderer must
   read `chrome ?? 'window'`, never trust the parse.
2. **Renderer** (`src/lib/pipelines/surfaces/imessage/CanvasSource.svelte`):
   `chrome === 'none'` branch drops the header, `Today 2:14 PM` timestamp,
   composer bar, page background, border-radius, and card box; keeps the
   bottom-anchored thread with the existing width knobs
   (`CARD_WIDTH_RATIO_H/V`), centered.
3. **Tail curls must be reworked for transparency.** The current two-pseudo
   tail paints its cutout with `background-color: var(--im-page)` — over
   transparent footage that renders an opaque page-colored block. Chromeless
   mode needs a mask/clip-path or inline-SVG tail that cuts to *transparent*.
   Same issue on the tapback badge's `border: … solid var(--im-page)` ring —
   in chromeless mode the ring must be dropped or masked, not painted.
4. **Vignette layer**: a radial-gradient element behind the thread column
   (≤ 30% of frame), opacity driven by the surface visibility ramp. Plain
   gradient — NO CSS `filter` (pixelates HTML-in-Canvas capture).
5. **Identity** (`src/lib/pipelines/surfaces/imessage/identity.ts`): describe
   the chromeless mode so the Critic measures the right things (no header to
   look for; vignette + bare bubbles instead).
6. **Theme**: `paperColor` luminance still picks light/dark received-bubble
   gray; in chromeless mode "page" luminance only affects bubble/meta colors.

No new shader passes. Sound, scheduling (`schedule.ts`), and the timeline
descriptors are reused unchanged.

## ADR required?

`yes` — new ADR referencing ADR-0031. It records (a) chrome as a mode on the
faithful-artifact Surface rather than a sibling pipeline, and (b) the
transparent tail-curl technique replacing the page-color cutout. Both are
conventions a future reader will hit when adding chromeless modes to other
artifact surfaces (web-document is the obvious next candidate).

## Open questions

None.

## What 'done' looks like

- `src/lib/platform/engine-schema.ts` — `chrome` field on the imessage surface.
- `src/lib/pipelines/surfaces/imessage/CanvasSource.svelte` — chromeless
  branch incl. transparent tails + vignette.
- `src/lib/pipelines/surfaces/imessage/identity.ts` — chromeless dimensions.
- `docs/adr/<NNNN>-imessage-chrome-mode.md`.
- `src/lib/presets/imessage-friday-deploy.json` (horizontal, 6s, webm) —
  **the verification preset; its Critic `ACCEPT` at native 4K is the delete
  trigger for this Brief.**
- `src/lib/presets/imessage-friday-deploy-vertical.json` — family-convention
  reflow sibling, authored from the same Brief, Critic-run *sequentially*
  after the horizontal ACCEPTs (not fanned out).
- Existing `imessage-the-bug*` presets still render identically
  (`chrome ?? 'window'` path proven).
