# Web-document augmentation demo

**Kind:** domain
**Slug:** web-document-demo
**Verification preset:** `web-document-twitter` (horizontal) + `web-document-twitter-vertical`

> Status: **brainstorm in progress** (grill 2026-06-22). "Open questions" is non-empty — not yet `/author`-ready. Dex epic: `dj3nyv17`.

## Pitch

A motion piece that shows a recognizable website — replicating its look — as a **clean, ad-free backdrop** for the channel's **highlight + overlays**. You feed it a URL; an authoring-time scaffold scrapes the page's text/structure and emits a static Preset. The rendered output is a frame-deterministic 4K motion graphic, not a live product.

**The "no ads / augmented" framing is a *property*, not the show.** The mock is clean *by construction* — it simply omits ads/clutter. There is **no** animated "watch the ads leave" beat, no multi-state transition. The show is: recognizable site look → highlight a key text span → overlays. The clean site is a substrate the overlays ride on.

## Surface(s) involved

New Surface: **`web-document`** — one Surface, parameterized by `content.site`.

- **Deliverable shape:** a **transparent overlay asset**. The site renders as a **card/panel** (the only opaque element) floating on transparency, composited over the creator's footage. Not full-frame. Same transparency contract as the `newspaper` clipping card.
- **Material claim:** *"a web page on a backlit display, in a browser window."* Emissive (screen-lit), not a photographed reflective material. Browser chrome frame on the card whose **address bar shows the URL** (sells "this is a website," pays off the URL input).
- **Per-site layout = content, not Pack.** Each site (reddit/twitter/wikipedia/…) is a per-site mock layout — a Svelte sub-component captured via HTML-in-Canvas, selected by `content.site`. A Pack is appearance-only and cannot carry a site's structural layout.
- Brand color/font *may* resolve via a thin per-site token set (TBD — see Open questions / Pack).

## Content sample

v1 = **Twitter/X**. A single tweet card: avatar, display name + handle, timestamp, body text (with ONE `[highlight]…[/highlight]` hero span), action row (reply / repost / like / views). Authored by hand for v1; scraper-fed later. Real verbatim copy TBD at author time — pick a tweet whose key line is the obvious highlight.

## Motion plan

**~6s, both orientations** (horizontal 3840×2160 + vertical 2160×3840, card reflows). Shape: enter `0 → 0.8s` → highlight draw-on `~1.2 → 2.4s` → static hold to `6s` (the long hold lets a creator freeze/extend the last frame while talking over it).

- Entry: the clean site card settles in.
- **Highlight** beat (the focal moment): the existing **`highlight` Annotation** — the channel's hand-pulled highlighter (`tool` kind, Q6 imperfection) — draws on over ONE hero span (Q10: one focal per beat). Authored as a `[highlight]…[/highlight]` bracket tag in the mock body; `marks.timings` drives the draw-on. The human marker over a clean digital site is a deliberate, on-brand tension.
- Hold on the highlighted card.

No augmentation/ad-removal beat. The mock is clean by construction.

## Channel chrome notes

**No Syntax collage chrome on the card** — no torn edge, grit, or hard offset shadow. The card must look **EXACTLY like the real site** — a pixel-faithful replica, not a close/evocative copy (Scott, 2026-06-22): real colors, fonts, layout, icons, spacing. **Twitter renders in dark mode** (X "Dim": bg `#15202b`, text `#f7f9f9`, secondary `#8b98a5`, border `#38444d`, accent `#1d9bf0`, like `#f91880`, repost `#00ba7c`; real SVG action + verified-badge icons; X's system-font fallback stack). Per-site brand styling is **intrinsic to each mock component**, not Pack-resolved; the active Pack does not dress the card.

**Highlighter** = the project's canonical look: `#fabf47` at intensity ~0.62 (matches `research-paper-*` / `quote-magnify` / `newspaper`), not a hotter custom color.

**No CSS `filter`/glow on the captured card** — it pixelates the HTML-in-Canvas capture. The emissive/screen optical look is a TypeGPU `shaderPass` (T3), not CSS. The Producer carries this into the Preset `description` so the Critic doesn't re-flag missing collage chrome as `aesthetic-miss` (per the "pack aesthetics aren't engine gates" principle).

The one channel-craft element that DOES land: the **`highlight` Annotation** (hand-pulled highlighter), as the deliberate human-marker-over-clean-site tension.

**Trademark:** faithful reproduction (real brand fonts/colors, site UI) is a knowingly-accepted risk for editorial/channel use. Where a brand font isn't freely licensable, fall back to the nearest free look-alike.

## Engine work required

- New `web-document` Surface Pipeline + Identity Spec (emissive-screen material dimensions + browser chrome + URL bar). Must carry real substance — engine rejects div-shaped claims.
- Per-site mock Svelte components (clean, ad-free) captured through the HTML-in-Canvas path (pattern: `newspaper/CanvasSource.svelte`).
- `content.site` field + per-site content shape in the schema.
- Authoring-time URL→content scraper script under `scripts/` (built AFTER the look lands).

## ADR required?

Likely **yes** — first emissive Surface + first "augmentation" concept. Draft during authoring. (TBD scope.)

## Open questions

_None blocking v1._ Deferred to phase 3 (after the look lands, per "build the look first"):

- **Scraper scope:** what the URL→content script extracts (display name, handle, body, timestamp, avatar, URL) and how the highlight span is chosen (author marks it by hand for v1; scraper heuristic later).
- **Reddit + Wikipedia mocks** (clone the Twitter pattern once the Surface is Critic-ACCEPTed).

### Resolved
- ~~URL ingestion~~ → authoring-time scaffold (scraper emits Preset; look built hand-authored first).
- ~~Surface modeling~~ → one `web-document` Surface, per-site layout = content.
- ~~Material claim~~ → emissive screen + browser chrome (URL bar), as a card/panel.
- ~~Deliverable shape~~ → transparent overlay asset (site card floats on transparency).
- ~~Augmentation beat~~ → none; clean by construction.
- ~~Fidelity / chrome~~ → faithful site-true look, no Syntax collage chrome, per-site styling intrinsic.
- ~~Highlight~~ → existing `highlight` Annotation, one hero span, bracket-tagged in mock body.
- ~~v1 sites~~ → Twitter/X first; Reddit + Wikipedia template off it.
- ~~Orientation~~ → both horizontal + vertical in v1.
- ~~Duration~~ → ~6s: enter → highlight → long hold.

## What 'done' looks like

**v1 (delete-trigger):**
- `web-document` Surface registered with a Critic-passing **Identity Spec** (emissive-screen material dimensions + browser chrome + URL bar, each implemented + probed — carries real substance, not a div).
- `TwitterMock.svelte` CanvasSource: faithful clean tweet card, captured via HTML-in-Canvas, opaque card on transparent frame, reflows both orientations.
- `highlight` Annotation draws on over the hero span; ~6s enter → highlight → hold.
- `src/lib/presets/web-document-twitter.json` (horizontal) **and** `web-document-twitter-vertical.json` both Critic-`ACCEPT` at native resolution.
- ADR filed (first emissive Surface).

**Phase 3 (post-v1, not part of the delete-trigger):** Reddit + Wikipedia mocks; URL→content scraper script.
