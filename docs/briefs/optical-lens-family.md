# Optical lens family

**Kind:** domain
**Slug:** optical-lens-family
**Pack:** syntax
**Verification preset:** optical-lens-showcase

## Pitch

Rebuild Supers' focal magnification as a convincing optical event and add the
clear-glass and frosted-pane vocabulary that `fluted-glass` does not cover. A
marked phrase should feel inspected through a real lens: the surrounding text
recedes, the focal content remains readable, and bounded edge refraction,
dispersion, depth, and reflection sell the material without turning the piece
into glossy chrome. The same clean-room optical model supplies a scoped clear
lens Effect and a full-pane frost Effect with authored melt/reveal geometry.

This domain takes behavioral inspiration from observed optical interface work,
but no third-party component, shader, source, parameter surface, default, or
asset is imported or ported. The implementation is independently authored in
TypeGPU/WGSL from optics and signed-distance-field fundamentals.

## Surface(s) involved

- Extend every Surface using `createPaperPipeline`, including `paper`,
  `newspaper`, and structured document Surfaces, so the existing `magnify`
  Annotation receives the upgraded focal optics without becoming a new
  Annotation type.
- Use `paper` in the verification Preset for dense text, marks, transparent
  alpha, and focal readability.
- Use `pullquote-on-photo` or another image-bearing Surface in the verification
  Preset's fixture coverage so clear refraction and frost are judged over both
  type and continuous-tone pixels.

## Content sample

Title: `The interface is not the image.`

Body:

`The browser lays out the words, but the lens decides what the viewer notices. [magnify]A useful optical effect preserves the sentence while changing the attention around it[/magnify]. Refraction is the cue; readability is the constraint.`

Source label: `OPTICAL STUDY / LIVE TYPE`

The image-bearing fixture uses the same title and source label. No lorem ipsum,
greeked body, or fake attribution ships.

## Motion plan

- Establish the Surface completely before the focal event, satisfying A1.
- Magnify enters over 450-650 ms with a short iris/settle envelope, holds at
  full optical strength long enough to read the marked sentence, then exits in
  220-280 ms. The optical magnification factor does not tween through a long
  mushy range; the lens body reveals a stable readable image.
- The surrounding context dims as the lens resolves, making one focal slot the
  hero. Dimming is intrinsic to the focal Annotation and floors at the authored
  `surface.backgroundVisibility`.
- Clear lens glass uses an authored normalized region and a short
  `settled-place` reveal. It has no pointer-follow behavior in exported motion.
- Frost grows from an authored edge/front over a deterministic window. An
  optional authored melt region reveals the live content and may refreeze by
  reversing that same progress function; it does not preserve cursor history.
- All temporal noise, shimmer, and relief derive from timestamp/frame plus a
  stable seed. No wall-clock reads or runtime randomness.

## Channel chrome notes

- Optical material is not Syntax channel chrome. The source document keeps its
  own substrate physics and the lens acts as a tool over it.
- Magnify includes the useful scanner grammar: a reticle ring, sparse ticks,
  corner brackets/crosshair, and an authored radial inspection ripple. Their
  form and motion are intrinsic to Magnify; color/ink and material treatment
  resolve from the active Pack. Syntax renders them as flat printed technical
  marks in its accent/ink vocabulary, never as neon or glossy HUD chrome.
- Syntax receives no neon glow, gradient atmosphere, lens flare, or gaussian
  ambient glow. The loud focus gesture remains the Pack accent and the document
  itself.
- Lens rim and reflection are intrinsic optical evidence, kept restrained and
  physically localized. Optional instrument chrome, if later added by another
  Pack, must resolve through Pack Roles and cannot be required for the lens to
  read.
- `fluted-glass` remains a separate architectural-rib Effect. Clear lens glass
  and frost must not be implemented as more flute shapes.

## Engine work required

### Shared clean-room optical model

- Add a concept-focused shared optical module under `src/lib/utils/` for
  independently-authored SDF lens geometry, normalized optical parameter
  packing, and any WGSL snippets genuinely reused by the focal and Effect
  Pipelines.
- Use a stable vocabulary across all consumers:
  - `shape`: `circle | rounded-rect`
  - normalized `region`: `{ x, y, width, height }`
  - `magnification`
  - `thickness`
  - `refraction`
  - `roughness`
  - `dispersion`
  - `reflection`
  - `rimLight`
  - `tint` and `tintStrength`
- The model works in composition pixels/native UV, preserves premultiplied
  alpha, and clamps sampling so transparent pieces do not smear an opaque edge
  or paint coverage outside their original silhouette unless the authored lens
  itself is a visible transparent Overlay.

### Rebuild `magnify`

- Keep `magnify` as a focal Annotation and preserve bracket-tag authoring.
- Replace the current fixed hard pill with a shape selected by marked geometry:
  a circle for short/single-line marks and a restrained rounded rectangle for a
  longer focal phrase. The lens stays bounded and does not stretch to an entire
  paragraph.
- Make `marks.timings[index].intensity` the constrained strength dial. It scales
  magnification/refraction together inside safe limits rather than exposing a
  generic optical control panel for Annotations.
- Add an intrinsic restrained scanner reticle around the optical boundary:
  outer ring, sparse cardinal/diagonal ticks, corner brackets or crosshair, and
  a small center registration mark. Resolve its visible ink from the mark color
  with Pack-safe fallback rather than hardcoding sci-fi cyan.
- Emit one deterministic radial inspection ripple from the lens center during
  the settle beat. It bends the surrounding page in a narrow band and fades
  before the read hold. It is tied to focal progress, not a pointer click.
- Set a real nonzero surrounding dim amount and respect
  `surface.backgroundVisibility` as the floor.
- Keep focal text and decorative marks aligned inside the lens. Use native 4K
  source pixels plus reconstruction/sharpening that does not halo type. Do not
  claim DOM re-rasterization unless a real independently captured high-resolution
  focal source is implemented and proven.
- Rewrite `magnify/identity.ts` so every implementation claim and probe is true.
  Required dimensions: focal hierarchy, reconstruction/readability, optical
  boundary, material depth, and motion form.

### Clear refractive lens Effect

- Register a new ordinary Effect named `refractive-lens` for an authored local
  clear-glass region over the composed frame.
- Params use the shared optical vocabulary plus `edgeFlatness` and `bevel`.
- The area outside the authored region is byte-for-byte/pass-through equivalent
  before final quantization. The region can magnify or hold 1x while refracting
  at its rim.
- The Effect is deterministic and timeline-driven. Region placement uses
  normalized geometry so one Preset reflows; orientation-specific Effect
  geometry is not added in this domain.

### Frosted pane Effect

- Register a new ordinary Effect named `frosted-glass` for a pane-wide or
  normalized-region treatment.
- Independently authored frost combines a deterministic multi-scale coverage
  field, transmission blur, relief-normal refraction, restrained Fresnel/rim
  response, thin/thick tint interpolation, and sparse highlights.
- Params: normalized `region`, `coverage`, `contrast`, `roughness`, `haze`,
  `refraction`, `detailScale`, `tint`, `tintStrength`, `highlight`, `seed`, and
  an optional authored `melt` block `{ center, radius, softness, from, to }`
  where `from/to` are timeline progress values.
- Frost blur may use lower-resolution intermediates, but final compositing and
  edges remain native resolution. If the current one-pass Effect contract cannot
  meet the quality/performance bar, extend the runner with the smallest explicit
  multi-pass resource contract rather than embedding an isolated render engine.
- Melt/refreeze is a pure function of current timeline progress in v1. Persistent
  trails wait for the seekable stateful simulation lane.

### Authoring and validation

- Add schema validation, defaults, Registry entries, Identity coverage where
  applicable, and complete GUI editors for both new Effects.
- Add focused unit tests for parameter packing, alpha/pass-through behavior,
  focal slot geometry, and deterministic frame inputs.
- Update the Preset format/current-truth architecture docs and generate schema.

## ADR required?

yes

The ADR records the optical vocabulary, the boundary between focal Annotation
and composition Effects, the truthful Magnify identity correction, and whether
`frosted-glass` requires a reusable multi-pass Effect contract.

## Open questions

None.

## What 'done' looks like

- The existing `magnify` Annotation is rebuilt in place and visibly stronger;
  its surrounding dim and Identity contract are truthful.
- `refractive-lens` and `frosted-glass` are registered, typed, GUI-editable,
  deterministic, alpha-safe Effects distinct from `fluted-glass`.
- `src/lib/presets/optical-lens-showcase.json` demonstrates focal Magnify,
  clear refraction, and frost with real content.
- Supporting fixtures isolate clear lens and frost alpha/pass-through behavior
  where one combined deliverable cannot expose a failure clearly.
- The same verification Preset renders intentionally at native horizontal
  3840x2160 and vertical 2160x3840 under at least `syntax` and one non-Syntax
  Pack, with no orientation- or Pack-specific sibling Preset.
- Targeted tests, `npm run check`, `npm run verify-presets`, alpha probes, and
  native browser captures pass.
- The Critic returns `ACCEPT` with no `pipeline-bug` or
  `default-too-permissive` findings; that ACCEPT deletes this Brief.
