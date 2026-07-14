# Dimensional depth stage — a real WebGPU 3D compositor for continuous-depth pieces

> **Status — Canon (v1 built). Refines [ADR-0027](0027-dof-v1-multiplane-bokeh.md) and [ADR-0021](0021-z-plane-semantics.md).** Validated in an isolated POC (`src/routes/poc/dof3d/+page.svelte`), then **integrated into the engine and Critic-accepted** (2026-06): `state.stage` schema, the `DepthStage` renderer (`src/lib/platform/pipelines/depth-stage.ts`), the `renderAt` branch (preview + export), orientation reflow, and a Critic-ACCEPTed demo (`depth-stage-demo`). ADR-0027's multiplane bokeh stays **Canon and the default** for flat, text-critical pieces. This ADR realizes the _continuous-depth_ mechanism 0027 deferred as a **real 3D scene render** (DOM-as-texture on perspective geometry, per-pixel depth from the geometry, a real lens DOF) — not 0027's "z-map DOM" upgrade. ADR-0021's Z _semantics_ (focal-distance scalar in [0,1], per-Layer defaults) are reused as plane placement.
>
> **Validation hardening (2026-07-13).** The open `stage.type` field now resolves through `stage-registry.ts` during semantic Preset validation; unknown Stage types and unregistered backdrop substrate assets fail before rendering or persistence.
>
> **Shared frame seam (2026-07-13).** Stage preview and export no longer carry parallel dispatch code. Both enter `Workspace.renderCompositionFrameTo(outputView, timestamp)`, which builds the complete Surface inputs once, queue-orders the live DOM upload once, and gives the dimensional stage precedence over DOF and flat compositing. Output classification treats any declared stage as opaque even when it has no authored `backgroundFill`.
>
> **v1 built / not yet built.** Built: `state.stage` (`type`/`camera`/`focus`), `DepthStage` (surface plane over a backdrop plane at depth, perspective camera push/drift, per-pixel-depth mip-prefiltered gather DOF), preview+export wiring (export==preview, render deterministic to ~0.002%), and **overlay-at-depth** (2026-07): the Overlay layer hoists to its own capture plane (the ADR-0027 split) and rides a 3D plane at its ADR-0021 z — parallaxing, defocusing, and occluding/occluded in painter's order (`depth-stage-demo` exercises it at z 0.45). Also built (2026-07): **real scene lighting/shadow** — the Pack's `light-treatment` Role (`resolveLightTreatment`, the third structural Role wired to pixels) becomes a scene key light: a received directional rake on every plane plus plane-to-plane cast shadow (light-ray march to each caster plane, disc-sampled caster alpha, penumbra growing with the plane gap). Appearance (named direction + intensity) is the Pack's; geometry stays the Preset's (camera + plane z's). No `light-treatment` Role ⇒ an unlit stage, pixel-identical to before. The `material` Role stays inert. Also built (2026-07): **half-res DOF** — the 96-tap gather renders at half resolution (sampling the full-res scene pyramid, so the blur loses nothing) and a full-res compose pass re-injects the sharp scene where the image is in focus, blended by the gather's own bleed-reach mask (in-focus text stays native-crisp; a defocused foreground still bleeds over sharp planes). 4K preview: 32→47 fps horizontal, 26→45 fps vertical (`scripts/cdp-measure-fps.mjs`; ~44 with the corrections below). Critic-caught corrections (2026-07, first showcase run — chapter-card-descent, 4 review rounds): the gather is **depth-ordered** — a tap's light reaches a pixel by scatter (the tap's own CoC disc) at any depth, but a defocused centre refuses light only from IN-FOCUS nearer content (refusal scaled by tap sharpness; classification between mutually-defocused planes just speckles) — killing the halo an in-focus subject wore against a defocused backdrop. The mip pyramid is **CoC-weighted with per-texel weights** (mip 0→1 point-samples each source texel; interpolated cross-plane depth would read "in focus" at contours and punch holes). The plane pass composites **partial-alpha coverage over the reconstructed backdrop** (presence = coverage × fade) instead of a binary 0.5 alpha discard — the discard quantized baked semi-transparent ink (text-shadows) into a dotted dark fringe that survived the blur; under coverage, **depth stays with the dominant contributor** (a presence-interpolated depth crosses the focal plane at contours and re-injects sharp pixels inside the blur). The gather's **centre CoC is a small neighbourhood average of per-sample CoCs** (never averaged depth) so the blur-family selection is spatially smooth at plane contours; its LOD is continuous and always ≥ 1 (the compose pass owns sharpness re-injection), biased +1 for the half-res tap density; the spiral stays fixed/un-jittered (with a smooth source the prefiltered mips reconstruct a clean disc — jitter only converts residual estimator variance into visible dither). From the type-hero run: the stage surface fade is forwarded for any surface whose fade carrier is a skipped ENVIRONMENT pass (derived from the registry, not a hardcoded list — DOM-position-driven surfaces like newspaper carry their own envelope and are not double-faded); the coverage→depth dominance window sits LOW (0.05–0.3) so px-thin geometry keeps its own plane's depth; and the compose pass never lets the half-res bleed mask force the blur branch on a SHARP NEAREST-PLANE pixel (nothing exists in front of the frontmost plane to bleed over it) — without this, a 2px accent rule is erased wholesale (the half-res mask cannot represent a thin sharp island, and the depth-ordered gather rightly refuses sharp-near light). And the compose's blur-branch **commit ramps to CoC 6** — the scale at which the half-res gather is competent for all geometry — rather than cliffing at 2: px-thin features stay carried by the sharp branch through the small-CoC band of a rack (otherwise they blink out mid-pull and pop back when focus lands); the trade is a mildly under-blurred 2–6 px CoC band, continuous and invisible against the defocused bed. And the stage path now carries the **composition-owned surface fade**: surfaces whose fade lived in a skipped environment pass (chapter-card / title-sequence / pullquote-on-photo) fade on the stage by backdrop reconstruction — the plane fragment intersects the view ray with the backdrop plane, samples/shades it, and mixes colour AND depth toward it; the cast shadow fades with its caster. No shipped _deliverable_ uses the stage yet (`depth-stage-demo` is the proving fixture; `pullquote-on-photo` ships on the stage). Follow-ups tracked in [`../roadmap.md`](../roadmap.md).

## Context

ADR-0027 shipped DOF as **2.5D multiplane bokeh** because the engine flattens Surface + Overlays into one DOM texture (`copyElementImageToTexture`, colour only) — there is no per-pixel depth to read, and the composition's elements are _flat_, so per-plane depth equals per-element depth. 0027 named its own upgrade trigger precisely: an element with **continuous internal depth** — _"a perspective-tilted card"_ — where defocus must vary _within_ one element, and a real camera would produce parallax and real light a flat composite cannot.

That trigger is now a product requirement, not a hypothetical. Building a Netflix-grade depth piece against the flat path produced the repeated failure the corpus work surfaced: a card _pasted_ onto a background, a CSS-shadow that doesn't sit in the scene's light, no continuity between foreground and background — "powerpoint basic," not cinematic. The flat path cannot make a foreground and background read as inhabiting one lit space, because it has no camera, no real light, and no continuous depth.

A spike resolved whether a WebGPU-native 3D stage could close that gap **without** leaving the one-stack, one-`renderAt`, deterministic-export discipline the engine is built on. It can. The POC renders a DOM card onto a real 3D plane and a lit back wall through a perspective camera, writes per-pixel camera-space depth, and applies a mip-prefiltered gather DOF. Validation (commits `861a697` grain-fix, `53d70e1` motion, `a8828ad` export, `ee07d25` 4K+vertical; captures in `docs/critic-captures/poc/`):

- **Determinism** — the shot is a pure function of `t`; the same `t` yields pixel-identical output (sha256 match). Honours frame-determinism.
- **Motion the flat path can't fake** — a slow dolly with **parallax** (card at z≈0 and wall at z≈−2 reproject at different rates) and a **rack focus** pulling from the back wall onto the title.
- **Export** — drives the engine's real Mediabunny path (`exportTransparentWebM`, `CanvasSource` over the WebGPU layoutsubtree canvas); the decoded video equals preview (vp9, 1920×1080, 120 frames).
- **Binding-resolution reflow** — renders clean at 3840×2160 and 2160×3840; CoC relative to the short side keeps the lens identical across resolutions; 1080p preview is real-time (~61 fps), 4K preview is ~32 fps (export is offline, unaffected).
- **Blur quality** — the DOF gather reads a **prefiltered mip** at a LOD spanning the gap between sparse taps; this is the fix for the grain that sank earlier attempts (gathering the _sharp_ buffer with sparse taps is aliasing). In-focus text stays tack-sharp (LOD 0, small CoC).

## Decision

Add a **dimensional depth stage**: an opt-in, composition-wide _compositor mode_ that renders a composition's already-separated Layer textures onto real 3D planes through a perspective camera, outputs per-pixel camera-space depth, and applies a mip-prefiltered gather DOF (plus, later, real scene light / cast shadow). It is selected per-Preset by a top-level `state.stage` block; **absent `stage`, rendering is unchanged** — the flat multiplane path (ADR-0027) stays the default and the backbone for text-critical pieces.

It is a **render path**, not a Layer, Effect, or Surface:

- **Not an Effect** — Effects post-process the _flattened_ composite; the stage must intercept the _separated_ Layers before flattening to place them in 3D (the same reason 0027's DOF is a render stage, not a post-process).
- **Not a Surface variant** — a Surface is one container/material; the stage re-composites the _whole_ Layer stack (Surface + Overlays) in a camera. It spans all Layers.
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

Each Layer's plane sits at its **ADR-0021 z** (Surface 0.0 … Overlay 0.7, per-instance override), mapped to camera-space distance — so the depth semantics 0021 pinned finally become real geometry. Camera framing derives from `transport.orientation`, feeding the engine's shipped orientation reflow (safe-areas as layout inputs) so the same Preset reframes per aspect — the POC proved the portrait case (the 16:9 card shrinks into the upper title-safe band, lit wall behind). Note camera-as-data was previously **stripped** as inert — `surface.camera` (`push`/`snap`) had no consumer, so the field, UI, and lint were removed together (roadmap § Recently shipped). The depth stage is the **first real consumer**, so camera returns _scoped to the stage that renders it_ (`stage.camera`), not as a dangling Surface field — keeping the rule that data exists only where something reads it.

### Render path

When `stage.type === 'depth'`, `Workspace.renderAt(timestamp)` branches _after_ per-Layer capture; everything downstream is untouched:

1. Capture Surface + each Overlay into separate textures at native density — the capture-to-texture seam already built for [ADR-0026](0026-transitions-v1-snapshot-and-wipe.md) / 0027 (colour only, as today).
2. Build the scene: one textured quad per captured Layer at its z; a perspective camera framed for the orientation; depth buffer (or back-to-front order) for correct cross-plane occlusion.
3. Scene pass → `INTERMEDIATE_FORMAT` (rgba16float) colour **plus per-pixel camera-space depth in alpha** — the per-pixel depth target ADR-0021 pinned, now _produced by geometry_ instead of written per-Pipeline.
4. Mip pyramid of the scene colour; the gather DOF reads a CoC-appropriate **LOD** (never the sharp buffer — this is the grain fix), CoC = `aperture · |depth − focusZ| · maxCoc`, `maxCoc` relative to the short side.
5. Hand the graded result to the existing effect chain + dithered present pass, unchanged. Export drives the same `renderAt`, so preview == export and the premultiplied transparency contract holds end to end.

Reuses `gpu-host.ts` (TypeGPU, `INTERMEDIATE_FORMAT`) and `html-in-canvas.ts` as-is; the POC already runs entirely on them.

### Verification (Critic)

The stage is verified for **pipeline correctness only** — pack aesthetics never gate an engine-feature demo (the `pack-aesthetics-not-engine-gates` rule; CLAUDE.md proof-corpus discipline). Stage-specific checks: determinism (same timestamp → identical pixels), **blur grain-free at true native 1:1** (verify at the canvas's native resolution — upscaled screenshots bilinear-smooth the grain away and lie), in-focus text crisp at native density, export == preview (decode a frame and compare), and clean render + reflow in both orientations.

## Considered options

- **Real WebGPU-native 3D stage** (chosen): one GPU stack, one `renderAt`, one export path; per-pixel depth from geometry; real parallax, real light, real cast shadow, and continuous within-element depth — the things validation showed carry the "same space" read. Coexists with 0027's flat path, sharing the per-Layer capture seam and the CoC/bokeh vocabulary.
- **Three.js / external 3D engine** (rejected): a second GPU/render stack beside TypeGPU, with its own determinism and export semantics to reconcile, plus a large dependency and maintenance surface. Buys nothing the WebGPU-native stage doesn't, and breaks the one-stack discipline.
- **Z-map DOM** (rejected — was 0027's documented upgrade): encodes per-element z into a parallel restyled DOM captured to a depth texture. Yields per-pixel depth of a _still-flat_ composite — no real camera parallax, no real light, no real cast shadow — i.e. it omits exactly what validation proved is decisive, while being a fragile parallel DOM. The 3D scene supersedes it.
- **Stay 2.5D multiplane only** (rejected for depth pieces): validated as fundamentally unable to do parallax / real light / real shadow — the "pasted card / powerpoint" symptom. Remains correct and default for _flat_ pieces.
- **Per-pixel depth sidecar exactly as ADR-0021 pinned** (rejected): the architecture has no per-Layer GPU passes to write a flat per-Pipeline depth target (0027's finding); the 3D stage produces depth from geometry instead.

## Consequences

A new scene renderer + camera/focus schema + Critic checks — bounded, because it reuses the capture seam, the GPU host, and the whole post-capture path. Costs and follow-ups, none a feasibility blocker:

- **4K preview perf** — was ~32 fps (8.3 MP through a 12-level pyramid + 96-tap gather); the half-res DOF (gather at half res + full-res sharp compose, above) measures 47 fps horizontal / 45 fps vertical at 4K. Export is offline and unaffected either way.
- **Cross-plane occlusion** for arbitrary overlay z's needs a depth buffer or sorted compositing (the POC's two planes used painter's order).
- **Text crispness** is native-sharp in focus, but the flat path stays the backbone for text-critical pieces where camera/DOF aren't wanted — the hybrid is deliberate, not a stopgap.
- **Structural Pack Roles** — the stage is the natural place the inert `light` / `material` Roles finally reach pixels as real scene lighting/material; a forward hook, out of v1 scope.
- **Unification door left open** — the hybrid (flat default + stage for depth) is what's validated, but the stage reuses the shared capture + post path so it does not preclude later collapsing the two paths into one (flat = degenerate stage). The scariest blocker to that, text fidelity, is **validated**: a fronto-parallel plane through the stage is as crisp as a 1:1 blit at native density (POC `mode=ref` vs `mode=flat`; captures `docs/critic-captures/poc/unify-*`). Full unification remains a feature-parity migration, scoped separately — see [`../ideas/unified-webgpu-compositor.md`](../ideas/unified-webgpu-compositor.md).

Engine work (stage selector + schema, scene renderer consuming the capture seam, per-pixel-depth + mip-gather DOF, camera/focus from `surface.camera` + ADR-0021 z, orientation framing, the Critic checks, a demo Preset) is tracked as the dimensional-depth-stage epic in [`../roadmap.md`](../roadmap.md) / dex. The POC (`src/routes/poc/dof3d/`) is the reference implementation and stays until the stage lands.
