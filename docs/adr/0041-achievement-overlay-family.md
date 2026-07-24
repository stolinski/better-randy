# ADR-0041 — Achievement notifications as one Overlay family

## Status

**Canon (v1 built).**

Date: 2026-07-15
Builds on: [ADR-0020](0020-variants-as-data.md) (variants as data), [ADR-0023](0023-pack-is-appearance-only.md) (appearance-only Packs), [ADR-0033](0033-sound-design-motion-emitted-cues.md) (motion-emitted sound)

## Context

Task completion and game-style achievement unlocks both need a compact upper-right notification over footage. They share the same card, editable kicker/title contract, authored focal-beat identity, entry/hold/exit macro timing, Pack-resolved appearance, editor controls, and frame relationship. Their semantic distinction is concentrated at the focal moment: one draws a functional check and quiets task ink; the other lands a celebratory medal and follows with a late chip pop.

## Decision

Register one graphic `achievement` Overlay family with `checklist-complete` and `unlocked` data variants. The shared content contract is `{ variant, kicker, title, beat }`; `beat` is composition data represented by a draggable timeline clip. Each variant owns a pure millisecond-based intrinsic motion function around that beat and declares the semantic sound events derived from the same timing. Entry and exit remain the Overlay transition windows, with this family opting into decisive travel through the right frame edge. Appearance resolves through `achievement.*` Pack Roles. Orientation is a Pipeline layout input: one horizontal Preset reflows from a 32%-wide card to an 82%-wide vertical card inside safe insets, rather than duplicating Presets by orientation.

## Considered options

- **Separate `task-complete` and `achievement-unlocked` Overlay Pipelines** — rejected because it duplicates the card, content schema, editor, timeline identity, transition model, Pack Role vocabulary, and reflow logic for a difference confined to the focal choreography.
- **Hard-code the focal moment inside each renderer** — rejected because the creator could not retime the meaningful beat, and derived sound would drift from a separately edited timeline cue.
- **Author separate horizontal and vertical Presets** — rejected because orientation is a transport choice and the content/motion are identical; duplicate corpus artifacts would drift while hiding a missing Pipeline reflow capability.
- **Express the focal choreography as generic Overlay keyframes** — rejected because stroke draw, medal geometry, and late chip reveal are semantic internal parts of one notification, not composition-level transforms of the whole Overlay.

## Consequences

The Registry gains one Overlay and one Identity Spec while future achievement semantics can land as additive variant data. The GUI and agent author the same four content fields; moving the focal clip updates pixels and derived sound together. Packs may restyle the family without owning motion. Both corpus Presets remain horizontal and transparent, and switching orientation exercises the same Pipeline instead of selecting another artifact.
