# Motion primitives library — implementation plan

> **Status — ✅ SHIPPED (2026-06). Historical.** v1 scope fully delivered: `instance-stack`, `text-3d`, `counter`, `cursor-trail` Pipelines + the `type-hero` `pair` variant + the `kerning-pop` / `bracket-pop` catalog entries; [ADR-0019](../adr/0019-identity-spec-via-pack.md) (identity-spec via-pack) + [ADR-0020](../adr/0020-variants-as-data.md) (variants-as-data) written; `lower-third` collapsed to variants. Canonical record is those ADRs + the pipeline registry (`src/lib/platform/pipelines/index.ts`); this doc is kept for the design/grilling rationale only. (Note: those families exist but are *not yet at the cinematic bar* — that's the separate corpus arc in `roadmap.md`.)

Post-grilling resolution of [`motion-primitives-library.md`](motion-primitives-library.md). The original idea doc remains as historical reference; this plan is the executable sequence.

## Reframe (load-bearing)

Identity and motion are **orthogonal axes**. The original plan staples them together via ADR-0015's graphic-kind dimension list (fill / edge / depth / light / motion-form / frame-relationship). The Pack/Preset split says fill / edge / chrome are Pack Roles. The seam is unresolved and the motion-primitives plan inherits it.

The fix: graphic-kind Pipelines own only the dimensions that are *structurally intrinsic* (usually `motion-form`, sometimes `frame-relationship`). Other dimensions concede to Packs via a new `via-pack` clause. Material/tool-kind Pipelines (like `newspaper`) stay unchanged — they own their dimensions directly. The one motion primitive that genuinely owns extra intrinsic dimensions is `text-3d` (depth + light — the TypeGPU edge).

This reframe shrinks the Identity Spec backfill cost from "23 × 6 dimensions" to "23 × 1-2 intrinsic + Pack manifest" and removes the structural reason the original plan said variant proliferation was expensive.

## Locked scope of v1 library

After grilling, v1 ships **4 new Pipelines + 1 new variant + 2 catalog entries** (down from the original 7 + 2). Pulled to separate followup Briefs: `depth-of-field` (needs engine z-plane infrastructure) and `mask-wipe` (needs multi-state composition). Both were under-scoped in the original plan.

| | What | Why |
|---|---|---|
| Variant | `type-hero` gains `pair` variant | card-pair collapses into existing Surface family — vocabulary grows by 0 Surfaces |
| Pipeline | `instance-stack` Block, 2 variants | mo1 echo-stack; greenfield test of variants pattern |
| Pipeline | `text-3d` Block, 1 variant | depth-buffered cylinder self-occlusion in own render pass |
| Pipeline | `counter` Block, 1 variant | per-digit slot-machine transition |
| Pipeline | `cursor-trail` Overlay (single-shape) | pointer is Pack Role, not variant |
| Catalog | `kerning-pop`, `bracket-pop` | per-unit + CSS-rasterizable → catalog |

## Phases

### Phase 1 — Foundation

Goal: make ADR-0014 (Pack/Preset split) and ADR-0015 (Identity Spec) structurally true. Until this lands the new library has no Pack manifest to declare via-pack against, no enforcing registration gate, and the seam between the two ADRs stays open.

**1.1 — ADR-0019: via-pack clause on graphic-kind Identity Specs**
- Write `docs/adr/0019-identity-spec-via-pack.md`.
- A graphic-kind dimension declares either `implementation: <code-pointer>` *or* `via-pack: <role-name>`.
- Registration validator accepts both forms.
- Pack-side validator confirms every via-pack role referenced by registered Pipelines resolves in the active Pack manifest.

**1.2 — Migrate `syntax` Pack folder per ADR-0014**
- Create `docs/packs/syntax/aesthetic.md` (move content from `docs/aesthetic.md`).
- Create `docs/packs/syntax/manifest.ts` (or `.json`) declaring Core Roles + Syntax-specific Roles.
- Core Roles named after Identity Spec dimensions: `fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment` (plus Pack-only chrome roles per ADR-0014).
- Migrate the 12 existing Presets — extract hex / font / effect refs into Role refs.
- Add `pack` field to Preset schema.
- Update Critic spawn prompt to load `docs/packs/<preset.pack>/aesthetic.md`.

**1.3 — Backfill 23 Identity Specs**
- 6 Surfaces missing identity.ts: chapter-card, paper, plain, pullquote-on-photo, title-sequence, type-hero.
- 1 Block: paragraph.
- 11 Annotations: box, callout, circle, highlight, isolate, lift-out, magnify, side-note, strike, tear-out, underline.
- 5 Overlays: cinematic-lower-third (will collapse in 2.1), lower-third, shader-fill, washi-tape, watermark.
- Material-kind (paper-family Surfaces) ship intrinsic dimensions like `newspaper` does.
- Tool-kind (hand-marking Annotations: highlight, underline, circle, strike) ship intrinsic tool-physics dimensions.
- Graphic-kind (chips, plates, Overlays, motion-led Surfaces) ship 1-2 intrinsic + 4-5 via-pack.
- `plain` Surface declares all dimensions via-pack (honest scaffold).

**1.4 — Port registration validator from aspirational to enforcing**
- Wire validator into `src/lib/pipelines/<layer>/index.ts` registration entry points.
- Refuses Pipelines with any unimplemented + non-via-pack dimension.
- Refuses Packs that don't resolve every via-pack role referenced by registered Pipelines.

**Acceptance of Phase 1:**
- Every visible Pipeline has an Identity Spec.
- The `syntax` Pack manifest resolves every via-pack role.
- A test Pipeline with a missing dimension fails registration.
- A test Pack missing a role required by a registered Pipeline fails Pack validation.
- The 12 existing Presets render against the Pack manifest (no inline hex / font / effect).

### Phase 2 — Variants pattern (proof + ADR)

Goal: prove the variants-as-data convention on existing code before declaring it as the v1 library's convention.

**2.1 — Proof migration: lower-third family**
- Collapse `src/lib/pipelines/overlays/cinematic-lower-third/` into `src/lib/pipelines/overlays/lower-third/` as `variants/`.
- `variants/types.ts`: `LowerThirdVariant` interface with `id`, `label`, `defaults`, motion-shape function.
- `variants/index.ts`: `VARIANTS` record + `VARIANT_IDS` array.
- `variants/standard.ts`, `variants/cinematic.ts`.
- `lower-third/index.ts` builds Zod discriminator from `VARIANT_IDS`.
- One Identity Spec covers both variants (per ADR-0020's "one Spec per family").
- Migrate `lower-third.json` and `lower-third-cinematic.json` to `{ type: 'lower-third', variant: 'standard' | 'cinematic' }`.

**2.2 — ADR-0020: variants-as-data convention**
- Write `docs/adr/0020-variants-as-data.md`.
- Layer-agnostic. Applies wherever there's a true family.
- One Identity Spec per family; every variant implements every dimension the family declares.
- Motion functions are pure (no engineState reads, no DOM access).
- Default variant is the most restrained one (Producer picks louder variants explicitly).
- Variant id is part of the schema (Zod enum from VARIANT_IDS).
- Use the lower-third migration as the worked example.

**Acceptance of Phase 2:**
- `lower-third.json` and `lower-third-cinematic.json` render identically to their pre-migration output.
- Adding a new variant to lower-third requires only: one file in `variants/`, one line in `variants/index.ts`, schema regen.
- ADR-0020 references the migration with code links.

### Phase 3 — Design ADRs (doc-only, can run parallel with Phase 1)

Pin design decisions that downstream work depends on. No code changes.

**3.1 — ADR-0021: z-plane semantics + depth-as-sidecar**
- Z = focal-distance (0 = in focus, 1 = max defocus). NOT world-space depth.
- Depth target is sidecar to color: every contributing Pipeline writes color (back-to-front alpha-blended for transparent output) and writes depth (sampled by post-process passes). Depth target never affects color compositing.
- Z declaration: per-Layer default (Surface = 0, Body = 0.3, Annotation = 0.5, Overlay = 0.7, Cursor = 0.9) + optional per-instance override.
- Engine work (gpu-host depth target, effect-chain depth input, contributing-Pipeline depth writes) deferred to a separate Brief alongside `depth-of-field`.

**3.2 — ADR-0022: multi-state composition for transition effects**
- How two composition states are declared (per-Preset state pair? state-A-Preset + state-B-Preset + transition-Preset? — pin one).
- How the renderer schedules both per frame.
- How mask-shaped Effects sample both color targets.
- Engine work + `mask-wipe` deferred to a separate Brief.

**3.3 — Amend ADR-0011: sharpen catalog vs Pipeline rule**
- Two-clause rule: per-unit AND CSS-rasterizable → catalog; anything else → Pipeline.
- Boundary tests: `kerning-pop` (catalog), `bracket-pop` (catalog), hypothetical "ink-blot reveal" (Pipeline — needs per-letter mask shader).

### Phase 4 — Motion primitives library v1

Gated on Phase 1 + Phase 2. Phase 3 ADRs should be signed before the Pipelines that reference them (`text-3d` and `cursor-trail` for z-plane).

**4.1 — type-hero gains `pair` variant + catalog entries**
- Migrate `src/lib/pipelines/surfaces/type-hero/` to family form (`variants/single.ts`, `variants/pair.ts`).
- `pair` variant params: `counterpointAnchor: 'inside-primary' | 'shoulder' | 'baseline-trailing'`, `enterStagger`, `scaleRatio` (Pack-resolvable).
- Update `type-hero-drift.json` to `{ variant: 'single' }`.
- Add `kerning-pop` and `bracket-pop` to `src/lib/text-animations/raw-catalog/effects/`.
- Run `scripts/sync-text-animation-catalog.ts`.

**4.2 — `instance-stack` Block with 2 variants**
- New folder `src/lib/pipelines/blocks/instance-stack/`.
- `identity.ts`: graphic-kind. Intrinsic: motion-form (lag-window propagation) and frame-relationship. Via-pack: fill, edge, depth, light.
- `variants/vertical-stack.ts`, `variants/horizontal-train.ts`.
- One HTML-in-Canvas capture of the text slot; shader pass draws N transformed copies in one fragment pass; count + scale + offset are GPU-side.
- Schema count cap: `count: z.number().int().min(2).max(40).default(9)`.
- Slot-validation via Critic (not parse-time cross-validation).
- Verification Preset under `src/lib/presets/`.

**4.3 — `text-3d` Block with 1 variant**
- New folder `src/lib/pipelines/blocks/text-3d/`.
- `identity.ts`: graphic-kind. Intrinsic: depth-treatment (cylinder self-occlusion via depth buffer attached to text-3d's own render pass), light-treatment (per-fragment lighting), motion-form (axis rotation), and frame-relationship. Via-pack: fill and edge.
- Depth is internal to text-3d's pipeline (depth buffer attached to its own render target). Output texture composites flat into the final frame — no engine z-plane dependency.
- `variants/cylinder-axis-y.ts` only. Other geometry variants (`cylinder-axis-x`, `folded-card`) land via subsequent Briefs.
- Verification Preset.

**4.4 — `counter` Block + `cursor-trail` Overlay (parallel)**
- `counter`: new folder. Family with `variants/slot-machine-roll.ts` only. Per-digit transitions; each digit is real glyph captured per frame (no sprite sheet aliasing at title scale). Schema variants: `format: 'integer' | 'currency' | 'percent' | 'timecode'`. Verification Preset.
- `cursor-trail`: new folder. Single-shape Pipeline (no `variants/`). Pointer asset is Pack Role (`cursor-trail.pointer`). Path declares array of `{ targetSlot, dwellMs, action }`. Motion blur computed shader-side from frame-to-frame Δposition, oriented along motion vector (anisotropic). Slot validation: render-time + Critic check. Z-plane = 0.9 by per-Layer default. Verification Preset.

**Acceptance of Phase 4:**
- Every new Pipeline's Identity Spec passes the enforcing registration validator.
- Every via-pack reference resolves in the `syntax` Pack manifest.
- Default param values at `progress=1` produce a finished composition without animation (verified by Critic against static screenshot).
- At least one verification Preset per Pipeline returns Critic `ACCEPT`.
- Schema regenerates; `scripts/verify-presets.ts` passes.
- 4K-frame contribution per Pipeline ≤ 8 ms.

## Deferred to separate Briefs

- **z-plane engine work + `depth-of-field`** — gpu-host depth target sidecar, effect-chain depth input, contributing-Pipeline depth writes, the DoF Effect. Gated on ADR-0021.
- **Multi-state composition + `mask-wipe`** — engine multi-state rendering, transition effect schema, mask-wipe Effect. Gated on ADR-0022.
- **Additional variants per family** — `instance-stack` diagonal-cascade, `text-3d` cylinder-axis-x / folded-card, `counter` fade-through / split-flap / typewriter. Each via a Brief that names the real Preset need (per the "no variant completionism" rule).

## Cross-cutting concerns

- **Critic checks for cursor-trail** — extend `docs/critic.md` to walk every cursor-trail path against the active Surface's contentSlots; flag unresolved targets.
- **Critic checks for count caps** — flag `instance-stack` count > ~12 (Pack-aesthetic-dependent threshold) as default-too-permissive candidate.
- **Stale doc cleanup** — `engine-architecture.md`'s `EffectType` listing currently shows only `paper-grain`; bring in sync with the live registry.

## Sequencing summary

```
Phase 1 (Foundation)
  1.1 ADR-0019  →  1.2 Pack folder  →  1.3 Backfill 23 Specs  →  1.4 Validator
        ↓
Phase 2 (Variants)               Phase 3 (Design ADRs, parallel with Phase 1)
  2.1 lower-third migration       3.1 ADR-0021 z-plane
  2.2 ADR-0020                    3.2 ADR-0022 multi-state
                                  3.3 ADR-0011 amendment
        ↓                                ↓
Phase 4 (Library v1)
  4.1 type-hero pair + catalog (parallel)
  4.2 instance-stack
  4.3 text-3d
  4.4 counter || cursor-trail
```
