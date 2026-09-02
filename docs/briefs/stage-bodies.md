# Stage bodies — models and dimensional type on the Dimensional Stage

**Kind:** domain
**Slug:** stage-bodies
**Pack:** syntax
**Verification preset:** crt-filmed

## Pitch

Phase 2 of the 3D Canvas Upgrade, as Scott reframed it on 2026-09-02: real objects and real 3D type on the depth Stage as a general capability, never a flat card remade in 3D. The first body is his CRT monitor — a nurb part compiled into the engine — with the composition on its glass, lit by the key and by its own picture, filmed by the phase-1 camera. The second is dimensional type: extruded, beveled headlines from the Pack's faces that cast shadow on the field and pull focus as they land.

## Surface(s) involved

Every Surface: `stage.screen` films whatever Surface the composition carries on the model's glass. `crt-filmed` uses `website-screenshot` in its `filmed` framing over the bundled YouTube capture.

## Content sample

The Syntax channel's YouTube Videos page (bundled capture `syntax-youtube-videos`), on the FW900 tube.

## Motion plan

One documentary camera: a low-left rest pose that holds the whole monitor, one `smooth` travel that pushes in until the glass fills the frame. No page entrance, no Overlays. Dimensional type will use settled-place: lifted and leaning in, landing on its plane with the lens racking to it.

## Channel chrome notes

The monitor is a real object and Pack-immune in its plastics; the Pack supplies the field, the key light, and the picture. The stepped-shadow card system stays two-dimensional: no chip, card, ticker, or lower-third is ever remade as a body.

## Engine work required

Shipped with [ADR-0059](../adr/0059-compiled-stage-models-and-the-physical-screen.md): the compiled-model lane (`scripts/compile-stage-model.ts`, `stage-mesh-format.ts`, `stage-models.ts`, `stage-model-assets.ts`, `StageModelController`), `stage.screen`, the body pass with per-region materials and the screen as an area light, the multisampled scene with nearest-depth resolve, the shadow map with blocker search, the focus-pull rule, and the body ceilings.

Still to build for dimensional type: glyph outlines from the Pack faces triangulated and extruded with a bevel, an Overlay Pipeline that contributes the body from its content and placement, and the Pack Roles its ink and accent resolve through.

## ADR required?

`already-filed: 0059-compiled-stage-models-and-the-physical-screen`; dimensional type amends it or files its own when its form is decided.

## Open questions

- Dimensional type: which faces (Space Grotesk 700 first), the extrusion depth and bevel radius as fractions of cap height, and whether the field or the page receives its shadow.
- Whether a screen model should suppress a Pack's post-process tube chrome (`crt-terminal`) that duplicates it.
- Whether the camera pose wants a per-orientation override so a landscape screen can sit larger in a vertical frame.

## What 'done' looks like

`src/lib/presets/crt-filmed.json` passes the deterministic affected render matrix at native horizontal (3840×2160) and vertical (2160×3840) under every Pack, and its exact evidence bundle receives human aesthetic approval, with no orientation-specific sibling Preset. Dimensional type ships one Pack-neutral deliverable the same way. The Brief retires when both have landed.
