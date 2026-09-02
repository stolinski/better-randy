# ADR-0051 — Evolve the Dimensional Stage with Pipeline-defined TypeGPU geometry

## Status

**Designed, not built.** Ordered as phase 2 of the 3D Canvas Upgrade by [ADR-0057](0057-filmed-canvas-camera-pose-and-posed-planes.md) (2026-09-01): the stage camera pose, posed Overlay planes, depth-tested plane-basis compositor, and filmed page framing land first, and the geometry contract below is built through that camera. ADR-0057 also adds physical screen and paper bodies as the first Surface-owned contributions.

Date: 2026-08-26

Builds on: [ADR-0002](0002-per-tool-routes-to-preset-engine.md) (one constrained engine), [ADR-0023](0023-pack-is-appearance-only.md) (appearance-only Packs), [ADR-0028](0028-dimensional-depth-stage.md) (the shipped Dimensional Stage), [ADR-0046](0046-seekable-simulation-and-deformation-families.md) (deterministic TypeGPU simulation), and [ADR-0047](0047-reject-general-asset-to-geometry-import.md) (no general asset importer)

## Context

The shipped `depth` Stage proves the important architecture: one TypeGPU/WebGPU host, one explicit frame clock, one preview/export seam, native output, and one post-stage Effect path. Its current spatial vocabulary is deliberately narrow: a backdrop plane, a captured Surface plane, and one captured Overlay plane under a fixed perspective-camera vocabulary, analytic plane lighting/shadow, and depth of field.

Supers now wants substantially richer 3D model quality. TypeGPU can supply procedural and instanced geometry, indexed depth-tested rendering, compute deformation, SDF/raymarched forms, materials, cameras, shadows, reflections, and lighting without making an interchange format or a second scene engine the product model. The hard product choice is where authoring authority lives: a generic object tree would turn Supers into the general compositor it explicitly rejects, while one-off stage code would make every 3D family its own renderer architecture.

## Decision

The initiative name is **3D Canvas Upgrade**. The canonical engine change is the **Dimensional Stage expansion**; the Canvas remains the output target, not the 3D authoring domain.

Supers will evolve the existing `depth` Stage in place. Existing plane-based Presets and their `state.stage` data remain valid; a parallel generic scene Stage is not added.

3D authoring remains **Pipeline-defined**. A registered Surface, Block, or Overlay Pipeline may optionally provide a bounded **Stage geometry contribution**: geometry, transform, material-role inputs, spatial bounds, and frame-derived draw state owned by that Pipeline. The contribution retains its originating Layer identity. It is not a sixth Layer, a free-standing object document, or an entry in a generic `stage.objects[]` scene tree.

The ownership split is:

- the **Pipeline** owns the geometry family, intrinsic motion form, and its Identity Spec;
- the **Preset** owns content, constrained form parameters, timing, and orientation-responsive staging;
- the **Pack** owns appearance through typed material, light, depth, edge, fill, ink, and accent Roles;
- the **Dimensional Stage** owns the shared camera space, depth-tested scene pass, lighting/shadow execution, focus/DOF, captured Layer planes, resource ordering, and handoff to the existing Effect/present/export path.

TypeGPU is the first and preferred implementation surface. Procedural meshes, instancing, compute deformation, SDF/raymarching, and narrowly compiled geometry are valid; no particular model-file format is required. Three.js remains demand-gated. It may be reconsidered only when a concrete approved Pipeline cannot meet its Identity claim through the TypeGPU-native contract and a bounded proof shows that the dependency closes that exact gap without weakening frame determinism, native output, Pack neutrality, orientation reflow, transparency, or preview/export parity. `@typegpu/three` reduces the cost of that future proof but does not itself activate a Three.js runtime.

## Consequences

- The current hardcoded plane renderer must become a real depth-tested scene compositor while preserving its existing plane behavior.
- The engine needs one searchable geometry-contribution contract and deterministic allocation, readiness, replacement, and disposal ownership.
- Camera, material, lighting, and shadow vocabulary expands only behind concrete registered Pipeline claims; no inert generic controls land ahead of a consumer.
- The GUI edits each 3D Pipeline through its bounded inspector and direct-manipulation contract rather than exposing a generic scene hierarchy or node editor.
- The first implementation arc requires at least one registered 3D Pipeline plus one Pack-neutral verification Preset rendered at native horizontal and vertical targets under every Pack, through the same preview/export seam.
- General SVG/image extrusion, arbitrary GLB ingestion, a universal material graph, wall-clock physics, and a sixth 3D Layer remain out of scope.
