# Full Pack buy-in: preset color becomes an override; verisimilar Surfaces declare immunity

The engine buys fully into the Pack model for **colors, materials, and fonts**: a Preset owns structure, content, and choreography, and carries **no required aesthetic fields**. `typography.paperColor` / `typography.inkColor` become **optional overrides** — when absent, surfaces resolve fill/ink from the active Pack through the ADR-0024 chain (`specific → core`), so one lower-third preset renders as Syntax, as a high-end broadcast look, or as something deliberately plain purely by pack swap. Pipelines whose entire value is fidelity to a real artifact (iMessage, web-document mocks) declare **pack-immunity** in their Identity Spec — immunity is a registry-visible property, never an unwired accident. Within an immune Surface's frame the *artifact* stays faithful, but every *treatment layered on it* (highlight marks, edge treatment, depth shadow) still resolves from the Pack.

## Context

A 2026-07-02 audit of "why does switching the Pack visibly do nothing?" found not a fallback leak but **two competing appearance systems**:

1. **Pack Roles** (ADR-0014/0019/0023/0024) — correctly architected, but consumed by only ~17 of 48 pipeline renderer files.
2. **The preset `typography` block** — `paperColor`/`inkColor` are *schema-required* literal hexes on every Preset, read directly (`engineState.typography.*`) by the highest-traffic renderers: paper, plain, newspaper, iMessage, web-document, and paragraph blocks.

The typography block paints the dominant pixels of most compositions, and the Pack has no code path to them. All 70 corpus presets carry these hexes (almost all restating Syntax values); exactly one preset uses a non-Syntax pack. Result: a pack swap changes accents and edge/depth on a minority of pipelines while the frame's main read is frozen — the system *looks* inert even where it works. Separately, iMessage and the web-document mocks ignore the Pack **correctly** (the green bubble must be *that* green; Twitter dark mode is pixel-faithful by requirement) — but their immunity is an accident of not being wired, indistinguishable from the bugs.

The seam ADR-0023 drew (Pack = appearance, Preset = motion) was never closed from the Preset side: the Preset still owns appearance wherever the typography block reaches.

## Considered options

- **Purge literal fallbacks only, keep the typography block required** (rejected): the dominant pixels stay preset-owned; every new Pack renders the corpus looking like Syntax. The pack-contract epic's validator would certify manifests that still can't reach the frame.
- **Pack authority extends to motion flavor / spacing** (rejected): reaffirms ADR-0023 — a high-end vs. basic feel differing in motion is a Preset/Pipeline choice. Pack authority is exactly **colors, materials, fonts** (edge/depth/light are material).
- **Implicit immunity** — verisimilar pipelines just don't consume roles (rejected): indistinguishable from the bug this ADR exists to fix; "does this pipeline respond to packs?" must be answerable from the registry.
- **Preset color as explicit override + declared immunity** (chosen): the Preset schema drops required aesthetics; an authored `typography` color is an intentional departure from the Pack, visible as such in the GUI and to the Critic.

## Consequences

- **Schema**: `typography.paperColor` / `inkColor` become optional. Absent → surfaces resolve the Pack's core fill/ink (per ADR-0024). Present → explicit override, wins over the Pack. Back-compat: every existing preset parses and renders identically on day one.
- **Corpus migration is mechanical**: a script compares each preset's typography hexes against the active Pack's resolved values and deletes restatements; the survivors are genuine overrides to review by hand. "Migrate 70 presets" collapses to reviewing a handful.
- **Renderers**: every pipeline reading `engineState.typography.*` switches to `override ?? packRole`. No pipeline may contain a literal hex (extends the ADR-0024 purge already tracked in epic `wscbvu5k`).
- **Identity Spec** gains a declared immunity marker for faithful-artifact Surfaces (`imessage`, `web-document`). Immune Surfaces skip appearance-var injection for the artifact itself; annotations/marks/edge/depth applied to them still pack.
- **Critic check (the regression lock)**: rendering any preset under two Packs must produce a pixel diff on every non-immune pipeline — screenshot-diffable, so partial buy-in can never silently return.
- The multi-pack money shot (CRT-pack corpus rerender, `60bjlhue`) is blocked on this ADR landing, not just on the manifest/validator work — without it the rerender proves the gap, not the system.
