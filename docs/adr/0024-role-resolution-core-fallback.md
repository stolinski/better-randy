# Role resolution: per-Pipeline override with core-vocabulary fallback

A Pipeline declares a **specific** Role in its Identity Spec `viaPack` clause (e.g. `chapter-card.fill`); the resolver returns the active Pack's value for that Role if present, else falls back to the **core Role** of the same dimension (`fill-treatment`). This is `var(--specific, var(--core))`. The engine pins the core vocabulary every Pack must implement (`fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`, plus font/material/asset cores); per-Pipeline Roles are **optional overrides** a Pack supplies only where it wants that Pipeline to diverge.

## Context

The original manifest went all-in on per-Pipeline Roles (~60 of them, e.g. `chapter-card.fill`, `plain.fill`, `lower-third.fill`) and left the four bare core Roles defined-but-unreferenced. That makes authoring a new Pack expensive (60 values, mostly duplicates of 3–4 brand colors) and contradicts the glossary's "engine pins a core vocabulary" wording.

## Considered options

- **Per-Pipeline Roles only** (rejected): max control, but a new Pack must fill ~60 values; heavy duplication.
- **Core vocabulary only** (rejected): a Pack is ~6 values, but every Pipeline shares one fill — no per-Pipeline divergence without adding a Role later.
- **Hybrid: specific override + core fallback** (chosen): a minimal Pack defines ~6 core values and everything renders; a rich Pack overrides specific Pipelines where it wants divergence. Matches both the glossary and the CSS-variable mental model.

## Consequences

- A new Pack's floor cost drops from ~60 values to the core vocabulary.
- The existing ~60 per-Pipeline Roles become optional; unreferenced/contradictory ones are deleted during the render-is-truth migration.
- Dimension naming must be normalized so a core fallback exists per dimension (today "fill" appears as `fill`, `inkFill`, `fragmentFill`, `boxFill`).
