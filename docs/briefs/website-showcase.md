# Website Showcase — a captured site with a URL plate

**Kind:** pipeline
**Slug:** website-showcase
**Verification preset:** website-showcase

## Pitch

A featured-resource overlay that puts a real website on screen without rebuilding it as a site-specific mock. The author gives Supers a URL; the local authoring service captures a fixed desktop viewport once and stores the resulting image, then the composition presents that screenshot inside restrained browser chrome with a separate Pack-resolved URL plate centered below it. A Syntax viewer can inspect the actual resource and retain the address without the composition reading like a screen recording. One Preset reflows across horizontal and vertical transport targets; orientation is a dial, never a filename or a second authored composition.

## Surface(s) involved

Add a new **`website-screenshot` Surface**. It depicts a stored screenshot on a backlit browser display: the captured website is substrate-immune and must retain its own pixels under every Pack, while the browser frame remains restrained neutral framing. Existing Surfaces cannot carry the idea cleanly:

- `web-document` renders isolated, pixel-faithful site mocks selected by `surface.site`; it does not accept an arbitrary captured viewport.
- `plain` has no image-backed browser material claim or responsive browser framing.
- Extending `web-document` would mix two different content models: structured mock content and immutable screenshot pixels.

Add a new **`source-url` Overlay** for the channel-added URL plate. A source URL is Overlay chrome, not part of the found website substrate. Keeping it separate lets it resolve through Pack Roles and lets its delayed arrival Cascade from the Surface entrance.

The browser and URL plate form one visual stack. At either orientation the Pipeline preserves the full 16:10 capture, scales the stack to the target's action-safe width, centers it, and keeps the URL plate centered below the browser. Vertical transport does not select a second image, alternate coordinates, or a second Preset.

## Content sample

Ships verbatim in `website-showcase`:

- **Capture URL:** `https://github.com/syntaxfm`
- **URL plate:** `github.com/syntaxfm`
- **Screenshot:** a fresh, unauthenticated 1440×900 desktop viewport capture of `https://github.com/syntaxfm`, using the site's default color-scheme behavior. The Producer captures and stores it during authoring; preview and export consume only the stored image and never load the live page.

## Motion plan

Six-second transparent overlay:

- **0–420 ms — screenshot entrance:** the browser rises from below the frame with decisive travel, strong deceleration, and a small **settled-place** overshoot. This requested edge entrance is an intentional lean-out move; it is justified by the literal browser-window reveal and kept out of generic template territory through short timing, flat movement, and one controlled settle.
- **~540–820 ms — URL entrance:** the `source-url` plate follows 120 ms after the browser settles, rising a short distance and landing with a sharp chip-pop / settled-place motion. Its enter is Cascade-welded to the Surface enter end.
- **~820–5300 ms — hold:** both elements remain completely still so the screenshot and URL can be read. No camera drift, glow sweep, or ambient motion.
- **~5300–6000 ms — exit:** the URL plate releases first by a short lead, then the complete stack accelerates downward and clears the bottom edge. The screenshot and plate travel in the same direction and are fully off-frame by the final frame.

Focal slots:

- Browser screenshot is the hero during the primary entrance and hold.
- URL plate is the sole hero during its delayed arrival.

Motion and capture are frame-deterministic. Preview and export read the stored screenshot and explicit timeline progress only; no wall-clock animation or live-page state reaches rendering. Default motion-emitted whoosh / impact cues may voice the browser and plate arrivals; no bed or manual cue.

## Channel chrome notes

- **Mono signature thread** — present in the `source-url` Overlay. The URL uses the active Pack's mono/chrome font Role (Space Mono under Syntax).
- **URL plate** — Pack-resolved matte card: fill, visible edge, rounded treatment, and depth all come from the Overlay's Identity Spec Roles. Under Syntax this becomes the warm-black plate, gray border, canonical stepped hard shadow, and one restrained yellow edge accent. The URL remains the only copy; there is no `VISIT` or `FEATURED RESOURCE` label.
- **Browser chrome** — controls only: a slim neutral title bar with the three window-control dots. No address bar, because the separate URL plate owns the citation and duplicate URL copy would weaken hierarchy.
- **Torn edge** — omitted intentionally. The current Syntax Pack forbids torn-paper channel chrome; the screenshot is a digital substrate.
- **Registration jitter** — omitted intentionally. Browser pixels and flat printed chrome require crisp registration; no physical pen mark is present.
- **Grit / paper grain** — omitted intentionally. A captured display is emissive, not paper, and the URL plate uses the Pack's flat card construction.
- **Gaussian shadow / glow** — forbidden on the URL plate. The browser may reuse the existing `web-document-screen` emissive material pass for subtle display optics, but that material treatment must not spill onto Pack chrome.

The composition is **Pack-neutral** per ADR-0039. Website pixels are immutable quoted substrate; the URL plate is the Pack-claimable channel layer and must look good across the full Pack catalog.

## Engine work required

New Surface Pipeline + new Overlay Pipeline + schema + Identity Specs + local capture authoring flow + GUI parity + verification Preset.

- **`src/lib/pipelines/surfaces/website-screenshot/index.ts`** — register the `website-screenshot` Surface, define defaults and controls, and create the image-backed render instance. Reuse existing HTML-in-Canvas / surface infrastructure and the `web-document-screen` shader pass where compatible rather than duplicating emissive optics.
- **`src/lib/pipelines/surfaces/website-screenshot/CanvasSource.svelte`** — render the stored screenshot inside a slim controls-only browser frame. Own responsive H↔V sizing, full-capture preservation, action-safe placement, transparent surroundings, image failure handling, and intrinsic rise/settle/downward-exit motion from explicit timeline progress.
- **`src/lib/pipelines/surfaces/website-screenshot/identity.ts`** — material Identity Spec for "a captured website on a backlit browser display." Probe at least: stored-image fidelity, complete 16:10 viewport preservation, controls-only browser frame, emissive display treatment, transparent-frame boundary, and orientation-responsive action-safe fit.
- **`src/lib/pipelines/overlays/source-url/index.ts`**, **`CanvasSource.svelte`**, and **`identity.ts`** — register a reusable URL plate with content `{ url }`. Identity is `graphic`: appearance dimensions resolve through Pack Roles; motion-form and frame-relationship are intrinsic. The Overlay supports normal position / keyframe / Cascade timing and renders the canonical Pack card without hard-coded Syntax colors or fonts.
- **`src/lib/platform/engine-schema.ts`** — add `website-screenshot` to `SurfaceTypeSchema`; add an optional screenshot image slot to Surface content (for example `imageUrl` using the existing `/api/user-assets/...` model); add and validate `source-url` Overlay content `{ url: string }`. Export the regenerated preset schema.
- **Pipeline registries and identity registry** — register both new variants and their Identity Specs. Add a Surface poster only if the existing catalog requires one for every registered Surface.
- **Local Playwright capture service** — add the local browser dependency and a SvelteKit server endpoint that accepts the author-entered URL, opens a fresh 1440×900 desktop context, uses the site's default color-scheme behavior, waits for a stable initial page, disables/reduces continuing page animation before capture, captures the viewport (not full page), and stores the bytes through the existing content-addressed `user-assets` path. It may navigate to any URL Playwright supports; this is a trusted local-authoring capability, not a remotely deployed service. The endpoint returns the stored image URL. Live URL loading is author-time only and never part of preview/export.
- **GUI parity in `SurfaceInspector.svelte`** — expose the capture URL and current screenshot for `website-screenshot`. Enter or blur triggers capture; deduplicate the Enter→blur pair so one edit launches one job. Successful capture updates `surface.content.imageUrl` and the `source-url` Overlay's normalized display URL. Surface capture state and failure are shown within the existing inspector patterns, without a save/refresh button or explanatory panel. Preserve direct image upload/replacement through the existing user-image path so GUI and agent-authored Presets produce the same stored artifact shape.
- **Agent parity** — the authoring path must expose the same capture operation as a script or callable endpoint so an agent can turn a URL into the same stored `imageUrl` without hand-editing asset bytes.
- **Preset linter** — enforce frame-fit, action-safe margins, minimum readable URL size, and the complete browser-plus-plate read window at both orientations. These are orientation-aware checks on one Preset, not grounds for duplicate Presets.
- **Tests** — cover URL normalization, capture request/result validation, Enter→blur deduplication, schema and semantic validation, missing/broken image fallback, and deterministic H/V layout calculations. Browser integration coverage captures a stable local fixture so tests do not depend on GitHub availability.

## ADR required?

`no`. The Pipeline split and its trade-offs are fully recorded in this Brief. The implementation follows existing decisions: quoted substrate immunity (ADR-0039), per-Pipeline Identity Specs, Overlay chrome via Pack Roles, frame-deterministic animation, and authoring parity.

## Open questions

_None — ready to `/author`._

## What 'done' looks like

- `website-screenshot` Surface Pipeline, CanvasSource, Identity Spec, Registry entry, schema, and deterministic image-backed rendering
- `source-url` Overlay Pipeline, CanvasSource, Identity Spec, Registry entry, schema, and Pack Role resolution
- Local Playwright URL-capture endpoint plus agent-callable capture path, persisting captures through `user-assets`
- SurfaceInspector URL capture on Enter/blur with image upload/replacement parity
- `src/lib/presets/website-showcase.json`, containing the captured `github.com/syntaxfm` reference and one responsive composition only
- Preset schema regenerated; structural, unit, Svelte, and browser-render checks pass
- `website-showcase` Critic-`ACCEPT`s at native 4K under both horizontal (3840×2160) and vertical (2160×3840) transport settings, with no orientation-specific Preset files
- Pack-matrix render sweep confirms the immutable screenshot and browser substrate remain faithful while the URL plate looks intentional under every catalog Pack
