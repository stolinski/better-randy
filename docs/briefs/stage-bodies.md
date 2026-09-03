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

Built 2026-09-03 for dimensional type ([ADR-0062](../adr/0062-dimensional-type-compiled-typefaces-and-the-first-overlay-body.md)): the compiled-typeface lane (`scripts/compile-stage-typeface.ts`, `stage-glyph-format.ts`, `stage-glyph-outline.ts`, `stage-typefaces.ts`, `StageTypefaceController`), glyph outlines resolved and extruded with a bevel (`stage-type-geometry.ts`), the `dimensional-type` Overlay contributing its body from content and placement (`OverlayStageBodyRenderer`, `stage-body-overlays.ts`), and the `dimensional-type.ink` / `.accent` / `.face` Roles.

## ADR required?

`already-filed: 0059-compiled-stage-models-and-the-physical-screen`; dimensional type amends it or files its own when its form is decided.

## Open questions

- Answered 2026-09-03 ([ADR-0062](../adr/0062-dimensional-type-compiled-typefaces-and-the-first-overlay-body.md)): Space Grotesk 700 is the reference face and every Pack names its own through `dimensional-type.face`; depth and bevel are authored per Overlay in cap heights (0.35 and 0.06 by default); its shadow falls on whatever stands behind it along the key through the shared shadow map, so field-or-page is not a choice to make.
- Whether a screen model should suppress a Pack's post-process tube chrome (`crt-terminal`) that duplicates it.
- Answered 2026-09-02: the camera reflows per orientation through `stage.camera.vertical` ([ADR-0059](../adr/0059-compiled-stage-models-and-the-physical-screen.md)) — a second rest pose and travel under the tall frame, so a landscape screen sits closer and pushes in until its picture fills the width.

## What 'done' looks like

`src/lib/presets/crt-filmed.json` renders at native horizontal (3840×2160) and vertical (2160×3840) under every Pack, and its exact evidence bundle receives human aesthetic approval, with no orientation-specific sibling Preset — met 2026-09-02; it is kept as the Stage's demo fixture (`kind: "fixture"`, Scott's request of 2026-09-03), so it stays in the corpus and out of the deliverable listing and the render matrix. Dimensional type ships one Pack-neutral deliverable that passes the deterministic affected render matrix the same way — `headline-hands-on`, built 2026-09-03 and awaiting the gate. The Brief retires when both have landed.
