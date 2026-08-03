# ADR-0047 — Reject a general asset-to-geometry importer

## Status

**Canon (broad scope rejected; bounded demand may be reconsidered).**

Date: 2026-07-29
Builds on: [ADR-0002](0002-per-tool-routes-to-preset-engine.md) (one constrained engine), [ADR-0023](0023-pack-is-appearance-only.md) (Pack-neutral composition), [ADR-0046](0046-seekable-simulation-and-deformation-families.md) (procedural deformation families)

## Context

The capability arc asked whether SVG/image silhouettes or GLB assets should become geometry for glass, particles, or deformation. The shipped families do not require that lane: particle reveal samples live composition alpha/luminance, peel tessellates a known sheet analytically, shatter generates seeded cells, tiled deformation generates its topology, cloth bends the composition plane, and fluid operates on a field.

A general importer would need to define SVG contour and hole semantics, triangulation and simplification, GLB buffers and materials, textures, units, coordinate systems, animations, skins, cameras, lights, compression extensions, malformed-asset limits, Pack ownership, orientation behavior, readiness, cancellation, caching, and disposal. That is a model compositor, not a small primitive.

## Decision

Supers does not ship a general SVG/image-contour extrusion or arbitrary GLB ingestion lane.

Planned deformation families use procedural geometry and live composition textures on the shared WebGPU host. No Three.js dependency, second graphics context, broad image Media type, mesh loader, or generic material system is added.

A bounded geometry compiler may be reconsidered only when a concrete registered Pipeline cannot meet its Identity claim without one. Valid revisit examples are a single flat SVG silhouette extrusion with Pack-owned material, or image-alpha particle emission where direct texture sampling is insufficient. That work requires its own Brief and ADR scoped to one asset class.

## Consequences

- The active families remain smaller, deterministic, Pack-neutral, and orientation-independent.
- Async asset readiness and cancellation do not expand without a consumer.
- Supers keeps After Effects as a quality ceiling without adopting a general scene-import architecture.
- This decision completes the exploration by rejecting broad scope; it does not claim asset preprocessing is technically impossible.
