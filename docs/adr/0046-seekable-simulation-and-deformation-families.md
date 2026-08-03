# ADR-0046 — Seekable simulation and constrained deformation families

## Status

**Canon (v1 built).**

Date: 2026-07-29
Builds on: [ADR-0012](0012-effect-pack-context-progress-timestamp.md) (explicit frame context), [ADR-0018](0018-collapse-effects-to-frame-only.md) (one post-process chain), [ADR-0023](0023-pack-is-appearance-only.md) (motion stays intrinsic), [ADR-0026](0026-transitions-v1-snapshot-and-wipe.md) (two-snapshot transition lane), [ADR-0042](0042-resolve-marker-sync.md) (exact rational frame math)

## Context

Particle dissolve, peel, shatter, ripple, cloth, and tiled deformation all need deterministic authored motion, but they do not need one undifferentiated graphics subsystem. Transition families consume two cached endpoint textures. Material deformation consumes the current composed Supers texture. Stateful impulses additionally need arbitrary seeks to produce the same state as serial playback and export.

Interactive website patterns are not an execution model for video. Pointer history, autonomous RAF loops, runtime randomness, and elapsed wall-clock integration cannot reproduce a paused frame or a second export.

## Decision

### Typed transition Effects

The transition registry stores renderers rather than names. Each renderer owns a Zod parameter schema, defaults, optional GUI Editor, a TypeGPU uniform layout, deterministic parameter packing, and a two-texture fragment body. The shared compiler enforces exact `from` pixels at progress zero, exact `to` pixels at progress one, premultiplied-alpha clears, native dimensions, and local progress derived from `transition.durationMs` rather than composition duration.

The registered families are `mask-wipe`, `particle-dissolve`, `sheet-peel`, and `seeded-shatter`. Endpoint snapshots are reused while only parameters or transition type change; compiled transition resources are replaced and disposed independently.

### Fixed-step simulation runtime

`SeekableSimulationRuntime` owns seeded reset, exact integer steps, stable same-step event ordering, forward continuation, backward reset-and-replay, isolated snapshots, and explicit disposal. `simulationStepForFrame` converts an output frame and exact transport rational to an integer simulation step without accumulated delta.

V1 state is compact control-field state prepared on the CPU and packed into GPU uniforms; the WebGPU fragment pass evaluates the native-resolution material field. This keeps arbitrary seeking synchronous and bounded while proving the lifecycle required by future storage-texture simulations. A future dense compute field may replace a compact kernel behind the same reset/step/snapshot/dispose semantics; it may not add an autonomous loop.

`fluid-ripple` and `cloth-bend` are ordinary post-process Effects. Each accepts one timeline-authored impulse/gust time and advances a 60 Hz damped kernel to the explicit frame timestamp. The resulting modal state drives GPU refraction or bend/fold shading. Pointer input is not persisted and cannot affect export.

### Tiled deformation

`tiled-deformation` is a separate ordinary Effect with `grid` and `hex` topology choices. Seeded radial reveal, bounded perspective lift, bevel, and one authored light direction are one family because they are variants of the same tile vocabulary. It does not remap hover or pointer events.

## Considered options

- **One generic deformation mode enum** — rejected. Transition, material, and tiled claims have different inputs and lifecycle.
- **Autonomous simulation playback** — rejected. The Timeline remains the only clock.
- **Infer fixed steps from accumulated floating deltas** — rejected. Integer frame/rational mapping is exact and seekable.
- **Ship compute/storage-texture infrastructure before a dense field requires it** — rejected. V1 proves the lifecycle with compact modal state and keeps the existing bounded Effect contract.
- **Treat peel/shatter as DOM animation** — rejected. They transform cached endpoint pixels and belong to the transition lane.

## Consequences

- Preview seeks, backward scrubs, and serial export address the same deterministic states.
- Transition parameters are schema-validated, GUI-authorable, round-trip safely through Svelte proxies, and do not force endpoint recapture.
- All final output remains native 3840x2160 or 2160x3840; transparent pixels are never replaced with an undeclared field.
- Dense fluid/cloth compute fields remain additive future work behind the shipped lifecycle, not a reason to fork the renderer now.
