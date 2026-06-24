# Web-document — the first emissive Surface (a website on a backlit display)

> **Status — Canon (v1 built).** The `web-document` Surface ships its v1 Twitter/X mock: schema (`surface.type: 'web-document'`, top-level `site`, optional `avatarUrl`), the `TwitterMock` CanvasSource, the dark-surface highlight variant on the paper compositor, the emissive screen `shaderPass`, an Identity Spec with five implemented + probed dimensions, and two Critic-ACCEPTed deliverables (`web-document-twitter`, `web-document-twitter-vertical`). Phase 3 (Reddit + Wikipedia mocks, URL→content scraper) is **not** part of this ADR's delete-trigger; tracked in dex `dj3nyv17`.

## Context

Every Surface to date is a **photographed reflective material** — paper, newsprint — lit from outside, carrying grain, occlusion shadow, lens vignette. The channel needs a different substrate: a **recognizable website** (a tweet, later a Reddit thread / Wikipedia article) as a clean, ad-free backdrop for the channel's highlight + overlays. You feed it a URL; the rendered output is a frame-deterministic 4K motion graphic that *looks exactly like the real site* (Scott's bar: pixel-faithful, not an evocative pastiche — X renders in "Dim" dark mode).

A website is not a reflective sheet. It is **emissive**: light comes *out* of a backlit LCD/OLED panel. Modeling it with the paper material vocabulary (reflectance, paper grain, drop shadow) would read as wrong. And a single "tweet card" is one of many sites the Surface must eventually wear, so the per-site look cannot live in the Pipeline or the Pack.

Two sub-problems surfaced while building it:

1. **The highlighter is built for dark ink on light paper.** The channel's hand-pulled highlight (`#fabf47` @ 0.62) multiplies amber over a light surface so dark ink shows through. On a dark tweet card with *light* text, a multiply band is invisible and a screen band washes the text out — the highlighted line was unreadable. (See the dark-surface highlight decision below.)
2. **`Workspace` selected the surface compositor by a hardcoded surface-type ternary** (`paper`/`newspaper` → paper compositor, else → plain), bypassing the registry. `web-document` silently ran the plain compositor and its declared `createPipeline` was dead code. Fixed by routing through `SurfaceRenderer.createPipeline`, honoring each Surface's declared pipeline + options.

## Decision

Add `web-document`: the first **emissive-material** Surface. It claims *"a web page on a backlit display, in a browser window"* and carries that claim as real material substance (a TypeGPU `shaderPass`), not a styled div. One Surface, **per-site layout = content**.

### Per-site layout is content, not a Surface and not a Pack

Each site (twitter / reddit / wikipedia) is a **mock layout** — a Svelte sub-component captured via HTML-in-Canvas, selected by a top-level `surface.site` field. It is *not* a new Surface per site (they share one material claim, one compositor, one highlight, one motion plan) and *not* Pack-resolved (a Pack is appearance-only per [ADR-0023](0023-pack-is-appearance-only.md) and cannot carry a site's structural layout; the brand styling is intrinsic to each mock). The shared content slots map per-site: `author` = display name, `source` = handle, `dateLabel` = timestamp, `sourceUrl` = the address-bar URL, `body` = the post text carrying the single `[highlight]` hero span. `avatarUrl` is an optional CORS-accessible image (silhouette fallback).

### Deliverable shape: a transparent overlay card

Same transparency contract as the newspaper clipping: the site renders as a **card/panel** — the only opaque element — floating on a transparent frame, composited over the creator's footage. Not full-frame. Reflows horizontal (3840×2160) and vertical (2160×3840); the card widens to the vertical safe-area.

### Reuse the paper compositor; add a dark-surface highlight mode

`web-document` reuses the paper Pipeline's runtime (HTML-in-canvas DOM upload, marks textures, composite) so the existing highlight Annotation lands identically. The compositor gains `highlightSurface: 'light' | 'dark'`:

- **`light`** (paper / newspaper, default) — translucent amber multiply; dark ink shows through. **Byte-identical** to the prior behavior.
- **`dark`** (web-document) — a dark surface with *light* text. Lay a clean, near-opaque amber band (coverage saturates so the dark bg never bleeds through and muddies it; marker texture rides as a brightness sheen, not alpha) and punch the light text down to near-black ink via DOM luminance. This reproduces the readable paper-highlighter look (vivid amber + crisp dark text) on any dark background, instead of an invisible or washed-out band.

### Emissive optics are a shaderPass, not CSS

A CSS `filter`/glow on the captured card pixelates the HTML-in-Canvas capture, so the emissive look is a single-pass surface `shaderPass` (`shader-passes/web-document-screen.ts`, pattern: `newspaper-physics`), run on the composited card between DOM upload and the effect chain ([ADR-0008](0008-surface-shaderpass.md) / [ADR-0010](0010-shaderpass-dispatch.md)). It carries the optical tells the paper compositor + CSS cannot: **subpixel emission** (per-column R/G/B stripe), **backlight bloom** (lit UI radiates a soft glow; the amber highlight sits below the bloom threshold by design so the hand-marked span stays crisp ink, not glowing UI), a **screen backlight floor + edge halo** (darkest pixels above true black; the panel's edge emission bleeds past the bezel into the transparent frame — *light comes OUT*), and **viewport-edge defocus** (the card boundary falls slightly out of focus, screen-behind-glass). No vignette, no occlusion shadow, no paper grain — emissive, not reflective.

### Identity Spec

Five dimensions, each `implementation`-pointed + probed per [ADR-0015](0015-identity-spec.md): `window-chrome-frame` (CSS — browser window + address-bar URL), `subpixel-emission`, `backlight-bloom`, `screen-backlight-floor`, `viewport-edge-defocus` (the latter four in the shaderPass). The registration validator passes at boot.

### Faithful site look is not an aesthetic-miss

The card deliberately omits Syntax collage chrome (no torn edge / grit / hard offset shadow) — its value is that a viewer recognizes the *real* site. Each Preset's `description` carries this so the Critic does not re-flag the missing collage chrome as `aesthetic-miss` (per the "pack aesthetics aren't engine gates" principle, [ADR-0019](0019-identity-spec-via-pack.md) / `docs/critic.md`). Faithful brand reproduction is a knowingly-accepted editorial risk.

## Consequences

- **Surface pipeline selection now routes through the registry** (`getSurfaceRenderer(type).createPipeline(...)`); no hardcoded surface-type branches in `Workspace`. A new Surface's declared pipeline + options are honored without editing the wiring. All existing surfaces are unchanged (their registry methods matched the old hardcoded behavior).
- **The dark-surface highlight is reusable** by any future dark emissive Surface, not just the tweet.
- **Phase 3 is cheap**: Reddit + Wikipedia are new mock layouts behind the same `surface.site` selector, inheriting the compositor, highlight, emissive shaderPass, and motion plan. The URL→content scraper emits a Preset against this schema.
- **Trademark**: faithful reproduction of real brand fonts/colors/UI is accepted for editorial/channel use; where a brand font isn't freely licensable, fall back to the nearest free look-alike.
