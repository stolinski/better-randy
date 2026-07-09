# Instagram follow — the follow press beat

**Kind:** pipeline
**Slug:** instagram-follow
**Verification preset:** instagram-follow-demo

## Pitch

The second creator platform block (product steer 2026-07-09; reference: HeyGen Hyperframes `instagram-follow`, vertical-first): a platform-faithful Instagram profile card — story-ring gradient avatar, username, meta line — whose blue Follow button presses to Following at an authored beat, with a soft one-shot card settle. Shares the press-beat discipline shipped with `youtube-subscribe` (composition-data beat on a draggable sub-track, intrinsic choreography, derived pop cue).

## Surface(s) involved

None — a new **Overlay** (`instagram-follow`), transparent over footage, vertical-first (Reels 2160×3840) with a horizontal sibling.

## Content sample

Username `studioatlas` · name `Studio Atlas` · meta `482K followers` · light card · beat 0.42. (Pack-neutral fake account — an engine block, not any channel's.)

## Motion plan

Standard overlay enter/exit sugar. Intrinsic beat choreography keyed in real ms off `beat`: button press dip 140 ms (zero at both ends), swap to Following, a 420 ms one-shot card settle resting at exactly 1. Both button states stack in one grid cell so the card never reflows at the swap. All derived from `globalProgress` — export == preview. **Focal slot:** the button across the beat. Sound: derived `pop` at the beat.

## Channel chrome notes

**None by design — pack-immune faithful artifact (ADR-0038):** story-ring gradient `#f9ce34→#ee2a7b→#6228d7`, Follow blue `#0095f6`, Following chip `#efefef`/`#363636`, platform system-type voice. Consumes no Pack CSS vars; must render pixel-identical under every Pack. Intentional omission of all collage/grit signatures.

## Engine work required

- `src/lib/pipelines/overlays/instagram-follow/` — schema + CanvasSource + Editor + identity (packImmunity declared).
- Registry + identity-registry entries.
- Beat sub-track + derived pop cue: extend the shared platform-CTA blocks in `Workspace.buildTracks` / `sound-cues.ts` (shipped with youtube-subscribe) to include this type.

## ADR required?

`no` — same shipped mechanisms as youtube-subscribe.

## Open questions

None.

## What 'done' looks like

`src/lib/presets/instagram-follow-demo.json` (vertical-first) + `-horizontal` Critic-`ACCEPT` at native 4K: faithful in both states at 200%, the press beat reads with no layout reflow, pack-immunity holds, transparent lane clean, GUI parity (editor + draggable beat clip).
