# Role resolution: per-Pipeline override with core-vocabulary fallback

## Status

**Canon (core).**

A Pipeline declares a **specific** Role in its Identity Spec `viaPack` clause (e.g. `chapter-card.fill`); the resolver returns the active Pack's value for that Role if present, else falls back to the **core Role** of the same dimension (`fill-treatment`). This is `var(--specific, var(--core))`. The engine pins the core vocabulary every Pack must implement (`fill-treatment`, `edge-treatment`, `depth-treatment`, `light-treatment`, `field-treatment` since the 2026-08-03 extension below, plus font/material/asset cores); per-Pipeline Roles are **optional overrides** a Pack supplies only where it wants that Pipeline to diverge.

## Context

The original manifest went all-in on per-Pipeline Roles (~60 of them, e.g. `chapter-card.fill`, `plain.fill`, `lower-third.fill`) and left the four bare core Roles defined-but-unreferenced. That makes authoring a new Pack expensive (60 values, mostly duplicates of 3–4 brand colors) and contradicts the glossary's "engine pins a core vocabulary" wording.

## Considered options

- **Per-Pipeline Roles only** (rejected): max control, but a new Pack must fill ~60 values; heavy duplication.
- **Core vocabulary only** (rejected): a Pack is ~6 values, but every Pipeline shares one fill — no per-Pipeline divergence without adding a Role later.
- **Hybrid: specific override + core fallback** (chosen): a minimal Pack defines ~6 core values and everything renders; a rich Pack overrides specific Pipelines where it wants divergence. Matches both the glossary and the CSS-variable mental model.

## Consequences

- A new Pack's floor cost drops from ~60 values to the core vocabulary.
- The existing ~60 per-Pipeline Roles become optional; unreferenced/contradictory ones are deleted during the render-is-truth migration.
- Dimension naming must be normalized so a core fallback exists per dimension (at decision time "fill" appeared as `fill`, `inkFill`, `fragmentFill`, `boxFill`). _Done 2026-07-04:_ `tear-out.fragmentFill` → `tear-out.fill`, `isolate.dimDepth` → `isolate.depth`, `paragraph.glyphEdge` → `paragraph.material` (a glyph _material_ claim — the optional `material-treatment` dimension); `inkFill`/`boxFill` were already gone. The mandatory core vocabulary is pinned in `packs/types.ts` (`MANDATORY_CORE_ROLES`) and enforced for every registered Pack by `validatePackCoreVocabulary`.
- _Hardened 2026-07-13:_ `validatePackRegistry` is the Pack authoring/CI gate layered over the core fallback floor. It enforces registry identity and metadata, font-role declarations, chrome Effect schemas, and rejects Pack-selected Pipeline roles until they have a real runtime consumer. `validatePackCoreVocabulary` remains the small boot-safe minimum; `pnpm verify-presets` runs the complete manifest and reference-Identity contracts.
- _Extended 2026-08-03 (ADR-0039 §3):_ `field-treatment` joins the mandatory colour cores — the Pack's full-frame FIELD (what `backgroundFill: "pack"` resolves to via `resolveBackgroundFill`), distinct from the card/plate `fill-treatment`. Mandatory rather than optional-with-fallback because no correct fallback exists: `fill-treatment` is wrong for dark packs (syntax's cream cards on a warm-black field), and a hardcoded literal deciding a Pack's pixels is exactly what this ADR forbids.
