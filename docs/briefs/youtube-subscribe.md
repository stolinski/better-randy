# YouTube subscribe — the checked subscribe beat

**Kind:** pipeline
**Slug:** youtube-subscribe
**Verification preset:** youtube-subscribe-demo

## Pitch

The first creator platform block (product steer 2026-07-09; reference: HeyGen Hyperframes `yt-lower-third`): a platform-faithful YouTube channel card — avatar, channel identity, the red Subscribe pill — whose whole story is the **press beat**: at an authored moment the pill dips, flips to Subscribed with a check, and the notification bell rings in. The single most-reached-for overlay in creator video, rendered broadcast-grade and frame-deterministic.

## Surface(s) involved

None — a new **Overlay** (`youtube-subscribe`), transparent over footage, both orientations.

## Content sample

Channel `Studio Atlas` · handle `@studioatlas` · meta `1.2M subscribers` · light card · beat at 0.42. (Pack-neutral fake channel — this is an engine block, not any channel's.)

## Motion plan

Standard overlay enter/exit sugar (fade + rise, `settled` in / `smooth` out). The beat choreography is intrinsic motion-form keyed in real ms off the authored `beat` fraction: press dip 140 ms (zero at both ends), state swap to Subscribed + check, bell ring-in with a 650 ms decaying wiggle resting at exactly 0, a 450 ms ripple leaving the pill. All derived from `globalProgress` — no CSS transitions, export == preview. **Focal slot:** the pill across the beat. Sound: a derived `pop` cue at the beat (ADR-0033 motion-character: a discrete UI impact).

## Channel chrome notes

**None by design — this is a pack-immune faithful artifact (ADR-0038).** The card is YouTube's: `#ff0033` pill, `#f2f2f2`/`#3f3f3f` Subscribed chip, light/dark card, Roboto voice. It consumes no Pack CSS vars and must render pixel-identical under every Pack; the Critic's two-Pack diff must NOT demand it respond. Intentional omissions: every collage/grit signature (a real platform control carries no pack dress).

## Engine work required

- `src/lib/pipelines/overlays/youtube-subscribe/` — schema + CanvasSource + Editor + identity (packImmunity declared).
- Registry + identity-registry entries.
- Timeline: `overlay-{id}-beat` sub-track (draggable point clip, fixed intrinsic width — the counter-roll pattern).
- `sound-cues.ts`: derived `pop` at the beat.

## ADR required?

`no` — composes shipped mechanisms (ADR-0038 pack-immunity, ADR-0033 derived cues, ADR-0020-style content-as-data beat).

## Open questions

None.

## What 'done' looks like

`src/lib/presets/youtube-subscribe-demo.json` + `-vertical` Critic-`ACCEPT` at native 4K: faithful in both states at 200%, the beat reads (dip → swap → check → bell ring, nothing binary), pack-immunity verified (identical pixels under two Packs), transparent E-lane clean, GUI parity (editor fields + draggable beat clip).
