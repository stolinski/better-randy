# Show-open bumper — "In Focus" (the flagship integration piece)

**Kind:** preset
**Slug:** show-open-in-focus  (pack-swap sibling: `show-open-in-focus-crt`)

## Pitch

The flagship corpus-v2 integration piece (dex `cz213ft7` / epic `f9nh09gl`): one continuous full-frame show-open that reads as a finished broadcast asset and exercises the shipped families **together** — the dimensional depth stage (live camera push + rack focus), a lower-third overlay riding its own depth plane, per-character title choreography, reading-order Cascade, a sound bed with motion-emitted cues, and the opaque ProRes export lane. Deliberately **pack-neutral**: the content belongs to no channel, and the one recipe ships under two opposite Packs (`syntax` warm/reflective vs `crt-terminal` emissive/phosphor) to prove the piece is the engine's, not a look's. This is the "same recipe, different publication" money shot on an *integration* piece rather than a single family.

## Surface(s) involved

`title-sequence` on the depth stage (ADR-0028), plus a `lower-third` Overlay at depth (overlay-at-depth from the depth-expansion epic). No new Surfaces.

## Content sample

Series identity (neutral, evocative, channel-agnostic — the rack-focus mechanic literally brings it *into focus*):

- Surface `title-sequence`: kicker `SEASON TWO`, title `In Focus`
- Overlay `lower-third` (cinematic): kicker `EPISODE 07`, title `The Long Way Around`, subtitle `premieres friday`

## Motion plan

One live timeline, ~8 s, reading-order Cascade (surface → kicker → title → lower-third):

1. Camera **push** (amount ~0.6) runs the whole piece → true parallax between the title on the near plane and the `atmosphere-slate` backdrop photo at depth.
2. **Rack focus** starts fully on the backdrop (`focusZ` pull from 1) and lands on the title (`to` ~0.05) as the per-character rise completes — the title arrives *into focus*.
3. Kicker `fade-through` welded to surface-enter end; title `per-character-rise` welded to kicker; lower-third resolve welded to title-end +~250 ms. Each beat lands and the whole holds ≥ ~3 s before staggered exits ending ≤ 0.95.
4. **Focal slot:** the title at its landed, in-focus frame (~0.55–0.85).

Sound: ambient **bed** throughout; motion-emitted cues on the reveals; an explicit `impact` on the title land (per-motion override on the title animation's enter).

## Channel chrome notes

**Pack-neutral by construction** — the composition omits `typography.paperColor`/`inkColor` so each Pack's core `fill`/`ink` drive colour (ADR-0038); it carries no collage card, tape, hard-offset shadow, or grit *in the composition* — every appearance signature (light rake + cast shadow vs. emissive glow, grain vs. scanline, edge treatment, type voice) is resolved by whichever Pack renders it. Neutral `atmosphere-slate` backdrop chosen so the photo favors neither Pack's palette. Intentional omission to record for the Critic: no composition-level chrome — that is the whole point (appearance is the Pack's).

## Engine work required

None — composes from the shipped Registry (depth stage, title-sequence, lower-third-at-depth, text animations, Cascade, sound bed/cues, ADR-0038 pack-driven typography). If the Critic surfaces an engine defect, it lands as a code fix (held until the in-flight Hiviz→Supers rename sweep commits, per session coordination).

## ADR required?

`no` — every capability is covered by shipped ADRs (0028 depth stage, 0035 keyframes/Cascade, 0033 sound, 0038 pack-driven typography, 0026 not used: spine is live depth-stage, not a snapshot wipe — the snapshot path can't carry a live camera move).

## Open questions

None.

## What 'done' looks like

`src/lib/presets/show-open-in-focus.json` **and** `src/lib/presets/show-open-in-focus-crt.json` (identical recipe, differing only in `name` / `description` / `pack`) each Critic-`ACCEPT` at native 4K, both proving one composition renders as two distinct finished publications. Mind the opaque full-frame probe gap (corpus-tail `9w7kdptf`). Exported with sound on the opaque ProRes lane.
