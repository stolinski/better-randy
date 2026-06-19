# Unified WebGPU-native compositor (flat = degenerate depth stage)

> **Status — 🧭 speculation; one gate validated (text fidelity). Not designed.** Lives in `ideas/` per the roadmap's three tiers. Graduates to `roadmap.md` only if/when a feature-parity audit (below) says it's worth scoping.

## The idea

Today there are two render paths: the **flat path** (DOM → one flattened texture → textured quad → effect chain; DOF via ADR-0027 multiplane bokeh) and the **3D depth stage** ([ADR-0028](../adr/0028-dimensional-depth-stage.md), validated in `src/routes/poc/dof3d/`). The idea is to **collapse them into one**: every composition is a 3D scene, and a *flat* piece is just the degenerate case — one fronto-parallel plane at z=0, camera dead-on, aperture 0 (no DOF). One WebGPU-native compositor instead of a flat path *plus* a stage. (The engine is already WebGPU/TypeGPU; "move everything to WebGPU" means routing flat content through the stage, not adding a GPU.)

## Why it matters

It changes the **shape of the ADR-0028 integration**. If unify is the destination, you build the stage as *the* compositor with flat as a special case — not as a bolted-on second path you then maintain forever. So the unify question is worth answering before the integration locks in a shape.

## The gate that worried us: text

A+ text crispness in both orientations is the crown jewel, and the flat path is battle-tested for it. The risk: does putting text on a 3D plane + the stage's sampling soften it relative to the flat path?

## The test (2026-06, POC `src/routes/poc/dof3d`)

A/B at 4K (3840×2160), **native 1:1** crops of the same title region (upscaled screenshots bilinear-smooth differences away — must capture at the canvas's real resolution):

- `?w=3840&h=2160&mode=ref` — card texture blitted **1:1** straight to the canvas (one resample; the crispness ceiling).
- `?w=3840&h=2160&mode=flat` — the *same* card on a **fronto-parallel plane filling the frame**, perspective camera, **aperture 0** (DOF collapses to identity), ambient-only lighting. The unify candidate, run through the full stage pipeline (scene target → mip build → DOF pass → present).

Captures: `docs/critic-captures/poc/unify-ref-crop.png` vs `unify-flat-crop.png`.

## Result: PASS — text-safe

The stage's flat case is **as crisp as the 1:1 blit**. Serif edges, thin strokes, and bowls are identical in sharpness; no softening, no halo, no ringing. The only differences are cosmetic — the present pass's warm grade and a faint corner vignette — not edges.

Why it holds: a fronto-parallel plane at constant z projects under perspective as a **uniform scale** (no keystone), so at ~native texel density (card authored at output resolution) the scene-target raster is effectively a 1:1 resample, and the final DOF pass at aperture 0 samples it 1:1. The argument is **orientation-independent** (canvas aspect only changes how much of the plane is visible, not how the plane is sampled), so the 4K-horizontal result transfers to vertical.

Caveat: this holds at ~native texel density. Sub-native density would soften — but *identically to today's flat path*, so there's no regression versus the status quo.

## What this de-risks — and what it does NOT

- **De-risked:** the scariest blocker (text fidelity) is gone. A unified compositor will not regress text.
- **Not validated here:** full unify is a **feature-parity migration**, not a text question. The flat path also carries Surface/Overlay **shaderPasses** (substrate physics, paper-grain), **focal-mark warps** (`magnify` / `lift-out` / `tear-out` / `isolate` in the composition shader), the **effect chain**, **transitions** (ADR-0026 snapshot + mask-wipe), and **text-animation DOM capture**. Most of these operate on the composite the stage still produces (as a plane texture), so they should route through — but each needs an audit before claiming parity. The flat case must also **skip the DOF/mip cost** (cheap: gate on aperture 0 / single plane) so unification doesn't tax flat pieces.

## Decision posture

Build ADR-0028's stage so it **doesn't preclude unify** — it already reuses the shared capture seam and the whole post-capture path, so this is mostly a matter of not hard-forking the flat path. Treat full unification as a **follow-on arc** to scope only after the stage ships and a feature-parity audit is done. The text gate being green is the green light to *keep the door open*, not to rewrite the compositor.
