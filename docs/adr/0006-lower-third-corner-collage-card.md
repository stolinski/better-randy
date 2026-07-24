# Lower-third is a corner collage card with `{ kicker, title }`

## Status

**Superseded by ADR-0023.** Lower-third appearance moved out of composition truth and into Pack resolution.

> **Status — SUPERSEDED by [ADR-0023](0023-pack-is-appearance-only.md) (Refocus, 2026-06).** "Collage card" is a *Syntax-pack appearance*, not the lower-third overlay's engine identity — under multi-pack, an `editorial-mono` lower-third is not a torn card. The overlay is **appearance-neutral** (`kicker` + `title` + `subtitle`); the `subtitle` drop is reversed (the shipped `cinematic` variant carries one), and collage-card chrome moves into the Syntax pack. Kept for the L1/G4 sizing history.

The `lower-third` overlay is committed to the **collage card** material identity (small corner torn-paper card, all four sides torn, full channel chrome per `docs/aesthetic.md § Collage System`) rather than a label strip or printed-sticker chip. That commitment forces a content schema reduction: at 4K horizontal, the L1 height band (10–18% of frame ≈ 216–389 px) cannot fit three text elements while simultaneously satisfying G4 cap-height bands (kicker 80–112 px, title 96–144 px, subtitle 80–112 px) — the minimum-of-each math already exceeds the L1 ceiling before padding. We chose to drop the `subtitle` field entirely from the schema rather than relax L1 or G4 rubric bands; `lower-third` content becomes `{ kicker: string, title: string }`. Editorial role information moves into the title line when needed ("Wes Bos, Co-host"). The same chrome and identity apply to `watermark`, which keeps its `{ handle, label? }` schema because it anchors top-right (outside the L1 band) and the L1 height constraint doesn't bind it.

## Considered options

- **Label strip identity** (rejected: visually correct for the editorial meaning of "lower-third," but the user committed to corner-card form for visual coherence with the channel's other collage cards).
- **Printed-sticker chip identity** (rejected: introduces a new material vocabulary the channel doesn't have today, and aesthetic.md § Anti-Aesthetic explicitly forbids "axis-perfect rectangular cards as the collage layer").
- **Relax L1 height band to 10–25% for corner-card-form lower-thirds** (rejected: rubric change propagates risk to other overlay types and future critic runs).
- **Relax G4 cap-heights on corner cards** (rejected: same rubric-propagation risk).
- **Keep all three text fields, accept L1+G4 violations** (rejected: ships a known anti-pattern).

## Consequences

The current `lower-third.json` preset and any future presets using `lower-third` must migrate from three text fields to two. The Editor component loses its subtitle input. The `LowerThirdContent` Zod schema becomes `{ kicker: string, title: string }`. If a future use case genuinely needs three-line identification (name + role + organization, for example), the right move is a *new* overlay type (e.g. `byline` as a label strip with three-line content) rather than reintroducing subtitle to `lower-third`. The visual rebuild follow-up was folded into the [roadmap](../roadmap.md); the per-overlay shader infrastructure that enables torn edges is captured in [ADR-0005](0005-overlay-renderer-shader-pass.md).
