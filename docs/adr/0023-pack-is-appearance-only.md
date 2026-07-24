# Pack scope is appearance-only; no default Pack

## Status

**Canon (core).**

A **Pack** carries **appearance only** — color (fill, ink), edge treatment, depth, light, font, material, and assets. All **motion** (form, timing, easing) is intrinsic to the **Preset** and **Pipeline** and never concedes to a Pack. A Preset declares exactly one Pack as its default and the runtime may override the active Pack ("render preset X under pack Y"); there is **no privileged default Pack** — `syntax` is one Pack among N, not a fallback.

## Context

The Pack/Role system (ADR-0014, ADR-0015, ADR-0019) left the appearance-vs-motion seam undrawn: the implementation put some motion into Pack Roles (`magnify.enterMotion`, `paragraph.bodyEnter`, `pullquote-on-photo.focalMotion`) while treating `motion-form` as intrinsic. The motion-primitives plan flagged this as the unresolved seam. The mental model that resolved it: a lower-third (or any composition) has a *visual preset* (what happens and when) and a *channel aesthetic* (what it looks like) — those are orthogonal axes, and motion belongs to the former.

## Considered options

- **Pack = appearance + motion character** (rejected): a Pack could also theme motion "flavor" (settle style, easing personality) while the Preset owns motion form/timing. More expressive — a pack swap could change how things *feel* — but keeps a blurry form-vs-flavor seam that has to be policed indefinitely.
- **Pack = appearance only** (chosen): sharpest, simplest line; matches the preset=motion / pack=aesthetic model; lets a new Pack be authored as a handful of appearance values.

## Consequences

- The motion Roles (`enterMotion`, `bodyEnter`, `focalMotion`, …) are removed from manifests and re-declared `implementation` (intrinsic) on their Pipelines' Identity Specs. This **refines ADR-0019**, which permitted any graphic-kind dimension to be `viaPack`.
- Two channels cannot differ *only* in motion personality via a pack swap; differing motion is a Preset/Pipeline choice.
- `pack` becomes a required field on every Preset (no default); the active Pack is overridable at render time for headless/CLI batch rendering.
