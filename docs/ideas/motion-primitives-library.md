# Motion primitives library

> **Status — ✅ SHIPPED (2026-06). Historical reference.** This original pitch was grilled into [`motion-primitives-library-plan.md`](motion-primitives-library-plan.md) and fully delivered (4 pipelines + variants + catalog entries + [ADR-0019](../adr/0019-identity-spec-via-pack.md)/[0020](../adr/0020-variants-as-data.md)). Canonical record: those ADRs + the pipeline registry. Kept for the design rationale.

## Pitch

Ship a small library of TypeGPU-backed motion primitives that lift Hiviz's typographic vocabulary to the level of editor-quality motion-graphics apps (the immediate reference is [mo1.app](https://mo1.app/), particularly its echo-stacks, 3D text geometry, scale-counterpoint compositions, and cursor-driven scene work). The thesis is that Hiviz's presets read as taste-poor not because the Critic is too lenient or the Producer is undisciplined, but because the *primitive vocabulary* is too thin. Every Preset rediscovers good motion from scratch, and the structural pull of a thin library is toward novelty over restraint. A tight, opinionated primitive set with tasteful defaults at `progress=1` (so the unanimated frame is already a finished composition) fixes the substrate, and the existing Brief → Producer → Critic loop starts producing tasteful Presets by construction.

Seven new Pipelines + two TextAnimation catalog additions, sized to expand the *vocabulary* without expanding the *surface area* of the engine. Each Pipeline declares its Identity Spec (per [ADR-0015](../adr/0015-identity-spec-per-pipeline.md)) and externalizes aesthetic choices as Pack Roles (per [ADR-0014](../adr/0014-pack-preset-split.md)). The architectural addition is a **variants-as-data** convention inside any family-Pipeline so the *next* primitive in a family lands as a single file, not a new BlockType / OverlayType.

## Problem

Three structural pulls produce the taste deficit:

1. **Monolithic Presets re-author motion from scratch.** Each Preset declares its own marks, overlays, transitions, and effect chain inline. There is no shared "kinetic verb" library; the closest analog is the 24-effect TextAnimation catalog (per [ADR-0011](../adr/0011-text-animation-orchestration.md)), which covers per-unit text staggers but nothing else. Composition-level motion (echo stacks, 3D text, mask wipes, depth-of-field, animated cursors) has no primitive.
2. **Pipeline proliferation for motion variants.** When a Pipeline ships a single fixed shape, the natural next step when more variants are wanted is to add a *new* Pipeline. The registry today holds seven Surfaces, eleven Annotations, five Overlays — many of which are motion-variants of each other. Each new Pipeline must re-declare its Identity Spec, its CanvasSource, its render path; the cost is large enough that variants don't get added, and the library stays narrow.
3. **Defaulted Identity-Spec dimensions render as div-shaped.** Per [ADR-0015](../adr/0015-identity-spec-per-pipeline.md), a Pipeline that ships with five of six Identity Spec dimensions defaulted reads as an animated div regardless of its claim. The library needs to ship every primitive with every dimension implemented, and Pack Roles must externalize anything aesthetic so the Pipeline's behavior is fully claimed in code.

## The library

Seven new Pipelines, organized by Layer. Each entry declares: the claim (Identity Spec one-liner), seed variants (where applicable), params, the TypeGPU strength that justifies its existence over a CSS-rendered equivalent, and the Pack Roles it externalizes.

### Surface

**`card-pair`** — kind: `graphic`. Claim: *a composition of two text slots in a fixed scale relationship.*

The signature mo1 move (giant `1`, tiny `2` floating next to it) is not a motion verb — it is a compositional decision baked into the Surface. card-pair hosts two named text slots (`primary`, `counterpoint`) at a programmatically determined scale ratio + offset relationship. Every Preset using card-pair inherits scale-counterpoint composition for free.

- Params: `scaleRatio: number` (counterpoint as fraction of primary cap-height, default `0.04`), `counterpointAnchor: 'inside-primary' | 'shoulder' | 'baseline-trailing'`, `enterStagger: number` (how much later the counterpoint enters vs the primary).
- TypeGPU edge: subpixel-accurate text at extreme scale ratios (primary at 1200pt + counterpoint at 48pt in the same composition). HTML-in-Canvas + WebGPU samples cleanly where CSS font-hinting falls over.
- Pack Roles: `card-pair.background` (Surface or fill Role), `card-pair.enterMotion` (motion-form Role), `card-pair.scaleRatio` (numeric Role with Pack-suggested values for a typographic system).

### Block

**`instance-stack`** — kind: `graphic`. Claim: *a text slot rendered as N spatially-offset instances with a per-instance progress lag.*

The "every line ×9" echo signature. One text string, deterministically repeated with offset, per-instance opacity ramp, and lag-window so instance N-1 finishes its enter motion *after* instance 0. The block is a single DOM source captured once by HTML-in-Canvas; the shader pass draws N transformed copies into a single composition texture, so count + scale + offset are GPU-side and the count is not bounded by DOM cost.

- Seed variants: `vertical-stack` (mo1's "every line"), `horizontal-train` (right-marching), `diagonal-cascade`.
- Params: `variant`, `count`, `spacing` (in cap-heights), `opacityFloor`, `lagWindow` (0..1 of slot enter duration), `text` (the slot content).
- TypeGPU edge: one HTML-in-Canvas capture + N instanced draws in a single fragment pass means count can scale to 20+ without DOM-stacking cost; per-instance offset is precise to fragment-level not CSS-pixel.
- Pack Roles: `instance-stack.lagCurve` (ease defining how progress propagates from front to back instance), `instance-stack.opacityFloor`, `instance-stack.spacingScale`.

**`text-3d`** — kind: `graphic`. Claim: *a text slot rendered on a curved geometry with real perspective and per-fragment lighting.*

The "ROUND SPIN IT" primitive. Text wraps onto a cylinder (or sphere, or folded card) with an axis of rotation, and is shaded per-fragment so the back-facing portion of the geometry self-occludes correctly. The dimension that justifies the entire primitive is `depth-treatment` — real z-buffer + perspective is the thing CSS `transform: rotate3d` cannot do without flattening the back face into a mirror of the front.

- Seed variants: `cylinder-axis-y` (vertical-axis spin, mo1-style), `cylinder-axis-x` (horizontal roll), `folded-card` (two-plane fold at an angle).
- Params: `variant`, `radius` (in cap-heights), `rotationSpeed`, `lighting` (`flat` | `soft` | `hard-rim`), `text`.
- TypeGPU edge: the entire premise of the primitive — real 3D, real lighting, real self-occlusion at 4K resolution.
- Pack Roles: `text-3d.material` (resolves to a Pack-defined ink/foil/paper shader), `text-3d.lighting` (Pack-defined lighting rig), `text-3d.curvature`.

**`counter`** — kind: `graphic`. Claim: *an animated numeric block that interpolates between two values with a per-digit transition.*

Count-up / count-down / currency / percent / timecode. The signature is the per-digit transition: digits don't crossfade — they roll (slot-machine), flip (split-flap), fade-through, or typewriter-in. Each digit is rendered as a real glyph captured per-frame, so the transition composites cleanly at title scale where sprite-sheet substitutions would alias.

- Seed variants: `slot-machine-roll`, `fade-through`, `split-flap`, `typewriter`.
- Params: `variant`, `from`, `to`, `format` (`'integer' | 'currency' | 'percent' | 'timecode'`), `ease`.
- TypeGPU edge: per-digit glyphs are real text captured at 4K each frame; multi-digit transitions composite without the cross-fade ghosting that DOM-counter implementations show at scale.
- Pack Roles: `counter.digitMaterial` (resolves to ink / foil / paper), `counter.digitTransitionEase`, `counter.numeralStyle` (lining / oldstyle / tabular — Pack typographic choice).

### Overlay

**`cursor-trail`** — kind: `graphic`. Claim: *an animated pointer that traverses named target slots and dwells, with real motion-blur from frame-to-frame velocity.*

A diegetic cursor moving between content elements is the "screen recording but better" gesture mo1 leans on. The cursor follows a path of named targets (slot names declared by the active Surface), dwells per target, and renders with a true motion blur computed shader-side from per-frame Δposition — not a CSS box-shadow trail.

- Seed variants: `mac-pointer`, `arrow`, `hand-pointer`, `crosshair`.
- Params: `variant`, `path` (array of `{ targetSlot, dwellMs, action: 'hover' | 'click' | 'idle' }`), `trailFade`, `easing`.
- TypeGPU edge: per-frame motion blur sampled shader-side from velocity; the blur shape is correct (oriented along the motion vector, anisotropic) where a CSS approximation is isotropic.
- Pack Roles: `cursor-trail.pointer` (Pack-defined pointer asset), `cursor-trail.trailMaterial`, `cursor-trail.dwellCurve`.

### Effect

**`depth-of-field`** — frame-only effect (no Identity Spec — effects are post-process per [ADR-0015](../adr/0015-identity-spec-per-pipeline.md)). Multi-tap shader pass that defocuses the composition with a focal-distance + bokeh-size + bokeh-shape, sampled against the engine's z-plane assignments.

- Params: `focalSlotId` (the slot that should be in focus; everything else defocuses by its z-distance), `bokehShape` (`circle` | `hex` | `anamorphic`), `bokehSize`, `intensity`.
- TypeGPU edge: the thing CSS / SVG / `filter: blur()` fundamentally cannot do — real lens DoF requires multi-tap sampling against a depth source. Hiviz has one because Surface, Body, Annotation, Overlay each declare a z-plane.
- Honors transparency per the engine's transparency contract.
- Pack Roles: `dof.bokehShape`, `dof.bokehSize`, `dof.focalCurve`.

**`mask-wipe`** — frame-only effect. Animated procedural wipe between two body states (paragraph swap, surface transition). Geometric (bar, iris, diagonal) or value-noise (torn-paper, ink-bleed) edge shape.

- Seed variants: `bar-horizontal`, `iris-circle`, `diagonal-45`, `torn-paper`, `value-noise`.
- Params: `variant`, `direction`, `softness`, `seed` (deterministic noise seed when `variant` uses noise).
- TypeGPU edge: the `torn-paper` variant uses the same value-noise function as the `newspaper-physics` shader pass — same vocabulary, same seed convention; the wipe matches the substrate's edge if the substrate is newspaper.
- Pack Roles: `mask-wipe.edgeMaterial` (Pack-defined edge texture / noise), `mask-wipe.softnessCurve`.

## TextAnimation catalog additions

Per [ADR-0011](../adr/0011-text-animation-orchestration.md), text-animation effects that fit the `generic-stagger` strategy ship as JSON in `src/lib/text-animations/raw-catalog/effects/` and sync via `scripts/sync-text-animation-catalog.ts`. Zero pipeline code; zero registry entries. The catalog lane is the cheapest extension surface in the engine and should absorb any motion verb expressible as per-unit (per-character / per-word / per-line) keyframed motion.

- **`kerning-pop`** — letter-spacing animation on a title-scale slot. From wide (1.2 em) to tight (0 em) or the inverse, over the enter window. Per-character split mode. Layout-aware reflow handled by the GSAP SplitText path.
- **`bracket-pop`** — small overshoot animation applied only to glyphs in a character class (default: `[](){}<>0-9`). Other glyphs hold still. Useful for kickers, numerals on `counter` blocks, and source-URL slots.

Both ship as pure data and require no engine change.

## The variants-as-data convention

This is the load-bearing structural addition. Without it, the seed variants in each family Pipeline above each become their own Pipeline registration; the library inflates from 7 to ~20 entries, every variant re-declares an Identity Spec, and the next variant is again expensive.

### Shape

Each family-Pipeline carries a `variants/` subfolder:

```
src/lib/pipelines/blocks/instance-stack/
  index.ts                   # BlockRenderer; constructs Zod schema from VARIANT_IDS
  identity.ts                # Identity Spec; dimensions claimed by every variant
  CanvasSource.svelte        # One render path; reads active variant by id
  variants/
    types.ts                 # InstanceStackVariant interface
    index.ts                 # VARIANTS record + VARIANT_IDS array
    vertical-stack.ts        # One file per variant
    horizontal-train.ts
    diagonal-cascade.ts
```

### Variant file

A variant is a pure data record + a deterministic motion function:

```ts
// src/lib/pipelines/blocks/instance-stack/variants/vertical-stack.ts
export const verticalStack: InstanceStackVariant = {
  id: 'vertical-stack',
  label: 'Vertical stack',
  defaults: {
    count: 9,
    spacing: 1.1,
    opacityFloor: 0.15,
    lagWindow: 0.4
  },
  motionShape: (instanceIndex, instanceCount, progress) => {
    // Pure function: instance index + global progress → per-instance motion state.
    // No side effects. No reads of engineState. No DOM access.
    const t = progressForInstance(instanceIndex, instanceCount, progress, 0.4);
    return {
      yOffset: instanceIndex * SPACING,
      opacity: lerp(0.15, 1, t)
    };
  }
};
```

### Schema integration

The Pipeline's main `index.ts` imports `VARIANT_IDS` and builds the discriminator Zod enum from it:

```ts
import { VARIANT_IDS } from './variants';

const InstanceStackSchema = z.object({
  type: z.literal('instance-stack'),
  variant: z.enum(VARIANT_IDS as [string, ...string[]]),
  count: z.number().int().min(2).max(40).default(9),
  // ...
});
```

Adding `radial-burst` later: one new file under `variants/`, one line in `variants/index.ts`, the Zod schema picks it up automatically, the schema export script regenerates `docs/preset-format.schema.json`. No edits to Workspace.svelte, no edits to PIPELINE_REGISTRY, no new Identity Spec.

### Constraints on the convention

- **One Identity Spec per family, not per variant.** Every variant must implement every dimension the family declares. If a proposed variant cannot implement a dimension the family claims, it is not a variant — it is a new Pipeline. This is the discipline that prevents the variants pattern from being abused to ship divs under the family banner.
- **Motion functions are pure.** No reads of engineState, no DOM access, no time-of-day dependencies. The motion function receives `(instanceIndex, instanceCount, progress)` and returns per-instance state. This keeps the family deterministic and export-parity-safe per the frame-determinism rule.
- **Default variant is the most restrained one.** Per the taste rule "defaults look good unanimated," the variant set defaults to the lowest-novelty option — `vertical-stack` for `instance-stack`, `cylinder-axis-y` for `text-3d`, `slot-machine-roll` for `counter`. The Producer picks louder variants explicitly.
- **Variant id is part of the schema.** Adding a variant is a schema change (the Zod enum widens). Validate Presets against the regenerated schema and re-run `node --experimental-strip-types scripts/verify-presets.ts` whenever variants change.

### When NOT to use the convention

Single-shape Pipelines (`card-pair` Surface, `depth-of-field` Effect) do not get a `variants/` folder. The pattern is for *families* — Pipelines where the motion shape is the differentiator and the Identity Spec is shared. A Pipeline that ships only one shape, today, can adopt the variants pattern later by adding the folder and migrating its existing shape into a variant file; the migration is mechanical.

## Pack Role inventory

The library introduces these new Roles to the Core Role vocabulary the `syntax` Pack manifest must resolve (per [ADR-0014](../adr/0014-pack-preset-split.md)):

| Role | Kind | Used by |
|---|---|---|
| `card-pair.background` | pipeline | `card-pair` Surface |
| `card-pair.enterMotion` | style | `card-pair` Surface |
| `instance-stack.lagCurve` | style | `instance-stack` Block |
| `instance-stack.opacityFloor` | style | `instance-stack` Block |
| `text-3d.material` | pipeline | `text-3d` Block |
| `text-3d.lighting` | chrome | `text-3d` Block |
| `counter.digitMaterial` | pipeline | `counter` Block |
| `counter.numeralStyle` | style | `counter` Block |
| `cursor-trail.pointer` | pipeline | `cursor-trail` Overlay |
| `cursor-trail.trailMaterial` | pipeline | `cursor-trail` Overlay |
| `dof.bokehShape` | style | `depth-of-field` Effect |
| `dof.bokehSize` | style | `depth-of-field` Effect |
| `mask-wipe.edgeMaterial` | pipeline | `mask-wipe` Effect |

A future Pack (editorial-minimal, neo-brutalist) implements the same Roles with different values. The Pipeline code does not change.

## Identity Spec dimensions

Every visible Pipeline (Surface, Block, Overlay) ships an Identity Spec at `src/lib/pipelines/<layer>/<name>/identity.ts`. Per ADR-0015, `graphic`-kind Identity Specs claim six dimensions: `fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`, `motion-form`, `frame-relationship`. Each dimension declares an implementation contract and a Critic-side probe.

Per-primitive dimension claims, summary:

- **`card-pair`** — `motion-form` is the signature (two-slot staggered enter); `frame-relationship` is the signature (scale ratio + counterpoint anchor). The remaining four are honored by the active Pack's background Role and the slot typography.
- **`instance-stack`** — `motion-form` is the signature (lag-window propagation across instances); `depth-treatment` is non-trivial (later instances sit behind earlier ones at a real z-offset, picked up by `depth-of-field` if active).
- **`text-3d`** — `depth-treatment` is the load-bearing dimension; `light-treatment` is the second signature; `fill-treatment` (resolved via `text-3d.material`) carries materiality.
- **`counter`** — `motion-form` is the signature (per-digit transition); `frame-relationship` claims tabular alignment so multi-digit counters don't reflow.
- **`cursor-trail`** — `motion-form` is the signature (velocity-anisotropic blur); `depth-treatment` is non-trivial (cursor sits in its own z-plane above all content).

Effects do not ship Identity Specs (Critic walks effects through the Q-rubric / G-rubric only).

## Alignment with existing ADRs

- **[ADR-0011](../adr/0011-text-animation-orchestration.md)** — TextAnimation catalog. The two catalog additions (`kerning-pop`, `bracket-pop`) ride the existing `generic-stagger` strategy. No engine changes required for them.
- **[ADR-0014](../adr/0014-pack-preset-split.md)** — Pack/Preset split. Every aesthetic decision in the library is a Pack Role, not a hardcoded value. Default values live in the `syntax` Pack manifest; future Packs dress the same Presets differently.
- **[ADR-0015](../adr/0015-identity-spec-per-pipeline.md)** — Identity Spec per Pipeline. Each new Pipeline ships its Identity Spec as part of "done." Registration validator gates on completeness.
- **[ADR-0016](../adr/0016-anti-patterns-loadbearing-when.md)** — Anti-patterns are loadbearing-when-claimed. `text-3d`'s per-fragment lighting is "drop-shadow stacking on text" when judged against the old anti-pattern list; ADR-0016 says it is loadbearing-when-claimed-by-`light-treatment`. The library leans on this resolution and would be rejected by the pre-ADR-0016 rubric.
- **[ADR-0018](../adr/0018-collapse-effects-to-frame-only.md)** — Effects are frame-only. `depth-of-field` and `mask-wipe` are post-process passes on the composed frame, not per-layer.

The library does NOT require new ADRs for any of these alignments. It DOES propose one new ADR for the variants-as-data convention.

## Sequencing

Each stage unblocks the next; value lands before the full library ships.

1. **ADR-0019 — Pipeline variants as data.** Doc-only; locks the convention. Without this the next steps have nowhere to anchor.
2. **`instance-stack` Block with two variants** (`vertical-stack`, `horizontal-train`). First implementation of the variants pattern. The most mo1-coded primitive; the smallest scope; reveals whether the rest of the library feels right.
3. **`kerning-pop` + `bracket-pop` catalog entries**, parallel with step 2 (different files, no dependency). Cheap wins; proves the catalog lane is alive.
4. **`text-3d` Block with `cylinder-axis-y` variant.** First heavy TypeGPU lift; second use of the variants pattern; first primitive where the TypeGPU edge is unambiguously load-bearing.
5. **`counter` Block, `card-pair` Surface, `cursor-trail` Overlay** in parallel. Three independent additions; team can split.
6. **`depth-of-field` Effect.** Last among effects because it needs a depth source — confirm the engine's z-plane assignment is consistent before shipping.
7. **`mask-wipe` Effect.** Effects with timing (state-A → state-B over a window) are new in the engine; this needs a small extension to the Effect schema (an `animation` block on params, opt-in per effect, mentioned as a follow-up in `engine-architecture.md`).
8. **`syntax` Pack manifest updates** for the new Roles, in lockstep with each Pipeline's landing.
9. **Stale doc cleanup** — `engine-architecture.md`'s `EffectType` listing currently shows only `paper-grain`. Bring the doc in sync with the live registry as part of step 1.

## Acceptance criteria

For each new Pipeline:

- **AC-L1 (MUST)** Identity Spec ships with every dimension implemented and probed; registration validator passes.
- **AC-L2 (MUST)** Schema is regenerated and `node --experimental-strip-types scripts/verify-presets.ts` passes.
- **AC-L3 (MUST)** At least one verification Preset under `src/lib/presets/` uses the new Pipeline. The Critic returns `ACCEPT` for that Preset.
- **AC-L4 (MUST)** The Pipeline's Pack Roles are resolved in `docs/packs/syntax/` (or wherever the Pack manifest lands per ADR-0014's rollout).
- **AC-L5 (MUST)** Default param values produce a frame at `progress=1` that reads as a finished composition without animation. Verified by the Critic against a static screenshot.
- **AC-L6 (SHOULD)** At 4K horizontal frame, the Pipeline contributes ≤ 8 ms to per-frame render time.

For family-Pipelines additionally:

- **AC-LV1 (MUST)** Adding a new variant requires only: one new file in `variants/`, one line in `variants/index.ts`, and schema regen. No edits outside the Pipeline folder.
- **AC-LV2 (MUST)** Every shipped variant implements every Identity Spec dimension the family claims. A variant that cannot is rejected at registration time.
- **AC-LV3 (MUST)** Motion functions are pure (no engineState reads, no DOM access). Verified by code inspection.

## Anti-scope

The library deliberately does NOT include:

- **A new timeline UI.** mo1's polished timeline (named clips, audio waveform, nested groups) is real and worth chasing, but it is UI work, not engine work. A separate proposal.
- **Audio support.** ~~Hiviz is a transparent-overlay tool; audio is an editor concern (DaVinci Resolve), not Hiviz's. Stays out.~~ **Reconsidered (2026-06, [ADR-0033](../adr/0033-sound-design-motion-emitted-cues.md)):** sound *cues* enter Hiviz as **motion-emitted sound events** resolved by a swappable **Sound kit** (automatic, frame-deterministic, baked into export). In-app **mixing** still stays out — that remains the NLE's job.
- **More Surfaces in the typography-led-composition family.** `type-hero`, `title-sequence`, and `chapter-card` already exist; we are not adding `mega-numeric`, `quote-card`, etc. The library expands motion vocabulary, not chrome vocabulary.
- **Variant proliferation in seed sets.** Each family ships with 2–4 seed variants. New variants come from real Preset needs (a Brief that names one), not from completionism.
- **Generic morphing between primitives.** `instance-stack` does not animate into `text-3d`. Switching primitive type is a content edit; see `engine-architecture.md` non-goals.
- **Catalog inflation for Pipeline-shaped motion.** If a motion verb needs more than per-unit keyframes (depth, materials, true 3D, multi-pass post), it is a Pipeline, not a catalog entry. The catalog lane is not a back door to ship Pipeline-class effects without an Identity Spec.

## Open questions

For grilling. Each becomes either a resolution in the ADR or a follow-up Brief.

1. **Where does `card-pair` actually live?** Existing typography-led Surfaces (`type-hero`, `title-sequence`, `chapter-card`) already host title-scale text; `card-pair` overlaps. Is `card-pair` a new Surface, or is it `type-hero` gaining a second slot? If the latter, `type-hero` needs a variants folder for `single-slot` vs `pair`. The variants pattern can absorb this; the call is whether the visible vocabulary should grow by one or by zero.
2. **Effects-with-timing schema change.** `mask-wipe` needs an `animation` block on its `params` (start/duration within the frame). `engine-architecture.md` lists this as a deferred follow-up. Do we ship the schema extension as part of the library, or pull `mask-wipe` out of the v1 library scope?
3. **`instance-stack` count cap.** GPU-side instancing means count can scale higher than DOM-stacking, but at some N the composition reads as visual noise rather than emphasis. Pick a cap (40? 20?) and enforce it at schema level, or leave it to the Critic to flag as `default-too-permissive`.
4. **`cursor-trail` target-slot vocabulary.** The cursor's `path` references named slots on the active Surface. Slots are declared per-`SurfaceRenderer.contentSlots`. Does `cursor-trail` validate slot names at Preset parse time, or only at render time? Parse-time validation requires the Preset parser to know which Surface is active before validating the Overlay; today the Overlay schema validates independently.
5. **Variants pattern and Annotations.** Annotations are also a place where families exist (`magnify` / `lift-out` / `tear-out` are arguably variants of one focal kind). Does the variants pattern apply to AnnotationRenderer too, or only to Surface / Block / Overlay? Today the focal annotations are sibling Pipelines; the variants pattern would let them collapse to one. Out of scope for v1 but worth naming.
6. **Pack rollout sequencing.** ADR-0014 declares Pack/Preset split as locked in; the `syntax` Pack folder doesn't exist in `docs/packs/` yet. The library adds Pack Roles, which assumes the Pack folder exists. Order: Pack folder migration first, library after? Or do they interleave?
7. **`text-3d` and the focal-shader composition.** The paper Surface's composition fragment shader handles up to 8 focal slots. `text-3d` renders to its own texture and would need to composite into the same focal stack — does that work in the current architecture, or does `text-3d` bypass focal annotations entirely?
8. **Catalog vs Pipeline taste rule, made concrete.** "Catalog if expressible as per-unit motion, Pipeline otherwise" is a guideline; the boundary cases will fight us. Is `kerning-pop` really catalog-only, or does it need a shader pass for sub-pixel-accurate kerning at 4K? Worth probing before locking.

## Why this fits Hiviz

The engine already supports adding Pipelines at low cost (one folder + one registry line). The library doesn't change that — it commits to *which* Pipelines and *to what taste contract* each new one ships with. The TextAnimation catalog already proves the data-only extension lane works. The Pack/Preset split is decided. The Identity Spec gate is decided. The library plugs into all of these and adds one structural piece (variants as data) that the engine has not yet committed to but obviously needs once families like `instance-stack` exist.

The mo1.app reference is useful as a vocabulary forcing function (echo stacks, 3D text, scale-counterpoint, cursor-driven scenes) but the library is not a clone. mo1's stack is CSS / SVG / DOM; Hiviz's edge is TypeGPU + HTML-in-Canvas at 4K with real materials and real lensing. Every primitive in the library exists because there is a TypeGPU strength that justifies it, not because mo1 has the same verb.

## Adjacency

- **[`transcript-driven-auto-animation.md`](transcript-driven-auto-animation.md)** — Once the library lands, the auto-animation flow has a richer Preset catalog to pick from. `counter` for statistics, `instance-stack` for list reveals, `cursor-trail` for "look at this" gestures, `text-3d` for emphasis on names / titles.
- **[`cli-video-generation.md`](cli-video-generation.md)** — Library Pipelines are addressable by Preset slug just like everything else; no CLI changes required.
