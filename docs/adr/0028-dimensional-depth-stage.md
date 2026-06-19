# Dimensional depth stage — a real WebGPU 3D compositor for continuous-depth pieces

> **Status — Designed, not built. Refines [ADR-0027](0027-dof-v1-multiplane-bokeh.md) and [ADR-0021](0021-z-plane-semantics.md).** Validated end-to-end in an isolated POC (`src/routes/poc/dof3d/+page.svelte`); no engine integration yet. ADR-0027's multiplane bokeh stays **Canon and the default** for flat, text-critical pieces. This ADR adds the *continuous-depth* mechanism 0027 explicitly deferred — but realizes it as a **real 3D scene render** (DOM-as-texture on perspective geometry, per-pixel depth from the geometry, a real lens DOF) rather than 0027's documented "z-map DOM" upgrade. ADR-0021's Z *semantics* (focal-distance scalar in [0,1], per-Layer defaults) stand and are reused as plane placement.

## Context

ADR-0027 shipped DOF as **2.5D multiplane bokeh** because the engine flattens Surface + Overlays into one DOM texture (`copyElementImageToTexture`, colour only) — there is no per-pixel depth to read, and the composition's elements are *flat*, so per-plane depth equals per-element depth. 0027 named its own upgrade trigger precisely: an element with **continuous internal depth** — *"a perspective-tilted card"* — where defocus must vary *within* one element, and a real camera would produce parallax and real light a flat composite cannot.

That trigger is now a product requirement, not a hypothetical. Building a Netflix-grade depth piece against the flat path produced the repeated failure the corpus work surfaced: a card *pasted* onto a background, a CSS-shadow that doesn't sit in the scene's light, no continuity between foreground and background — "powerpoint basic," not cinematic. The flat path cannot make a foreground and background read as inhabiting one lit space, because it has no camera, no real light, and no continuous depth.

A spike resolved whether a WebGPU-native 3D stage could close that gap **without** leaving the one-stack, one-`renderAt`, deterministic-export discipline the engine is built on. It can. The POC renders a DOM card onto a real 3D plane and a lit back wall through a perspective camera, writes per-pixel camera-space depth, and applies a mip-prefiltered gather DOF. Validation (commits `861a697` grain-fix, `53d70e1` motion, `a8828ad` export, `ee07d25` 4K+vertical; captures in `docs/critic-captures/poc/`):

- **Determinism** — the shot is a pure function of `t`; the same `t` yields pixel-identical output (sha256 match). Honours frame-determinism.
- **Motion the flat path can't fake** — a slow dolly with **parallax** (card at z≈0 and wall at z≈−2 reproject at different rates) and a **rack focus** pulling from the back wall onto the title.
- **Export** — drives the engine's real Mediabunny path (`exportTransparentWebM`, `CanvasSource` over the WebGPU layoutsubtree canvas); the decoded video equals preview (vp9, 1920×1080, 120 frames).
- **Binding-resolution reflow** — renders clean at 3840×2160 and 2160×3840; CoC relative to the short side keeps the lens identical across resolutions; 1080p preview is real-time (~61 fps), 4K preview is ~32 fps (export is offline, unaffected).
- **Blur quality** — the DOF gather reads a **prefiltered mip** at a LOD spanning the gap between sparse taps; this is the fix for the grain that sank earlier attempts (gathering the *sharp* buffer with sparse taps is aliasing). In-focus text stays tack-sharp (LOD 0, small CoC).

## Decision

Add a **dimensional depth stage**: an opt-in, composition-wide *compositor mode* that renders a composition's already-separated Layer textures onto real 3D planes through a perspective camera, outputs per-pixel camera-space depth, and applies a mip-prefiltered gather DOF (plus, later, real scene light / cast shadow). It is selected per-Preset by a top-level `state.stage` block; **absent `stage`, rendering is unchanged** — the flat multiplane path (ADR-0027) stays the default and the backbone for text-critical pieces.

It is a **render path**, not a Layer, Effect, or Surface:

- **Not an Effect** — Effects post-process the *flattened* composite; the stage must intercept the *separated* Layers before flattening to place them in 3D (the same reason 0027's DOF is a render stage, not a post-process).
- **Not a Surface variant** — a Surface is one container/material; the stage re-composites the *whole* Layer stack (Surface + Overlays) in a camera. It spans all Layers.
- **Not a sixth Layer** — like text-animation orchestration ([ADR-0011](0011-text-animation-orchestration.md)), it adds no content; it changes how existing Layers composite. So it is a composition-wide selector peer to `transport` / `effects` / transitions, not a registry primitive of any Layer.

## Integration design

### Preset expression

```jsonc
"stage": {                      // OPTIONAL. Absent ⇒ flat multiplane path (ADR-0027), unchanged.
  "type": "depth",              // open string, registry-validated like overlay/effect types
  "camera": {                   // the move — camera-as-data, scoped to the stage (its first real consumer)
    "move": "push" | "static" | "drift",
    "amount": 0..1,             // dolly / lateral parallax strength
    "ease": "smooth" | "settled" | "sharp"
  },
  "focus": {                    // reuses ADR-0027 DOF vocabulary + ADR-0021 z scalar
    "focusZ": 0..1,             // in-focus depth (0 = near plane, 1 = far)
    "aperture": 0..1,           // max circle-of-confusion / blur strength
    "pull": { "from": 0..1, "to": 0..1, "start": 0..1, "duration": 0..1 }  // optional rack focus
  }
  // "light": { ... }           // later: a real scene light — the natural home for the inert
                                //        `light` / `material` structural Pack Roles to reach pixels
}
```

Each Layer's plane sits at its **ADR-0021 z** (Surface 0.0 … Overlay 0.7, per-instance override), mapped to camera-space distance — so the depth semantics 0021 pinned finally become real geometry. Camera framing derives from `transport.orientation`, feeding the engine's shipped orientation reflow (safe-areas as layout inputs) so the same Preset reframes per aspect — the POC proved the portrait case (the 16:9 card shrinks into the upper title-safe band, lit wall behind). Note camera-as-data was previously **stripped** as inert — `surface.camera` (`push`/`snap`) had no consumer, so the field, UI, and lint were removed together (roadmap § Recently shipped). The depth stage is the **first real consumer**, so camera returns *scoped to the stage that renders it* (`stage.camera`), not as a dangling Surface field — keeping the rule that data exists only where something reads it.

### Render path

When `stage.type === 'depth'`, `Workspace.renderAt(timestamp)` branches *after* per-Layer capture; everything downstream is untouched:

1. Capture Surface + each Overlay into separate textures at native density — the capture-to-texture seam already built for [ADR-0026](0026-transitions-v1-snapshot-and-wipe.md) / 0027 (colour only, as today).
2. Build the scene: one textured quad per captured Layer at its z; a perspective camera framed for the orientation; depth buffer (or back-to-front order) for correct cross-plane occlusion.
3. Scene pass → `INTERMEDIATE_FORMAT` (rgba16float) colour **plus per-pixel camera-space depth in alpha** — the per-pixel depth target ADR-0021 pinned, now *produced by geometry* instead of written per-Pipeline.
4. Mip pyramid of the scene colour; the gather DOF reads a CoC-appropriate **LOD** (never the sharp buffer — this is the grain fix), CoC = `aperture · |depth − focusZ| · maxCoc`, `maxCoc` relative to the short side.
5. Hand the graded result to the existing effect chain + dithered present pass, unchanged. Export drives the same `renderAt`, so preview == export and the premultiplied transparency contract holds end to end.

Reuses `gpu-host.ts` (TypeGPU, `INTERMEDIATE_FORMAT`) and `html-in-canvas.ts` as-is; the POC already runs entirely on them.

### Verification (Critic)

The stage is verified for **pipeline correctness only** — pack aesthetics never gate an engine-feature demo (the `pack-aesthetics-not-engine-gates` rule; CLAUDE.md proof-corpus discipline). Stage-specific checks: determinism (same timestamp → identical pixels), **blur grain-free at true native 1:1** (verify at the canvas's native resolution — upscaled screenshots bilinear-smooth the grain away and lie), in-focus text crisp at native density, export == preview (decode a frame and compare), and clean render + reflow in both orientations.

## Considered options

- **Real WebGPU-native 3D stage** (chosen): one GPU stack, one `renderAt`, one export path; per-pixel depth from geometry; real parallax, real light, real cast shadow, and continuous within-element depth — the things validation showed carry the "same space" read. Coexists with 0027's flat path, sharing the per-Layer capture seam and the CoC/bokeh vocabulary.
- **Three.js / external 3D engine** (rejected): a second GPU/render stack beside TypeGPU, with its own determinism and export semantics to reconcile, plus a large dependency and maintenance surface. Buys nothing the WebGPU-native stage doesn't, and breaks the one-stack discipline.
- **Z-map DOM** (rejected — was 0027's documented upgrade): encodes per-element z into a parallel restyled DOM captured to a depth texture. Yields per-pixel depth of a *still-flat* composite — no real camera parallax, no real light, no real cast shadow — i.e. it omits exactly what validation proved is decisive, while being a fragile parallel DOM. The 3D scene supersedes it.
- **Stay 2.5D multiplane only** (rejected for depth pieces): validated as fundamentally unable to do parallax / real light / real shadow — the "pasted card / powerpoint" symptom. Remains correct and default for *flat* pieces.
- **Per-pixel depth sidecar exactly as ADR-0021 pinned** (rejected): the architecture has no per-Layer GPU passes to write a flat per-Pipeline depth target (0027's finding); the 3D stage produces depth from geometry instead.

## Consequences

A new scene renderer + camera/focus schema + Critic checks — bounded, because it reuses the capture seam, the GPU host, and the whole post-capture path. Costs and follow-ups, none a feasibility blocker:

- **4K preview perf** ~32 fps (8.3 MP through a 12-level pyramid + 96-tap gather). Mitigation: half-resolution DOF and a capped mip count recover toward 60 fps; export is offline and unaffected.
- **Cross-plane occlusion** for arbitrary overlay z's needs a depth buffer or sorted compositing (the POC's two planes used painter's order).
- **Text crispness** is native-sharp in focus, but the flat path stays the backbone for text-critical pieces where camera/DOF aren't wanted — the hybrid is deliberate, not a stopgap.
- **Structural Pack Roles** — the stage is the natural place the inert `light` / `material` Roles finally reach pixels as real scene lighting/material; a forward hook, out of v1 scope.

Engine work (stage selector + schema, scene renderer consuming the capture seam, per-pixel-depth + mip-gather DOF, camera/focus from `surface.camera` + ADR-0021 z, orientation framing, the Critic checks, a demo Preset) is tracked as the dimensional-depth-stage epic in [`../roadmap.md`](../roadmap.md) / dex. The POC (`src/routes/poc/dof3d/`) is the reference implementation and stays until the stage lands.
