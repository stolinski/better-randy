# ADR-0033 — Sound design: motion-emitted cues resolved by a swappable Sound kit

Status: **Designed, not built**
Date: 2026-06-26
Relates to: [ADR-0011](0011-text-animation-orchestration.md) (timed-motion domain; named "audio cues" as a future one), [ADR-0023](0023-pack-is-appearance-only.md) (Pack is appearance-only), [ADR-0024](0024-role-resolution-core-fallback.md) (Role resolution, core fallback), [ADR-0015](0015-identity-spec-per-pipeline.md) (motion is intrinsic, never conceded), [ADR-0029](0029-image-substrate-on-depth-stage.md) (deterministic bundled assets)

## Context

Hiviz produces broadcast-quality motion, and broadcast motion has **sound design** — whooshes on entrances, impacts on a title drop. The composition model had nothing for it: the 5 Layers are all visual, the schema carries no audio, export is video-only. A prior lean in `docs/ideas/motion-primitives-library.md` said *"audio is an editor concern (DaVinci Resolve), not Hiviz's. Stays out."*

The reversal is driven by a concrete pain: today you hand-place every whoosh and click in DaVinci, and re-sync them by hand whenever the motion changes. The ask is **"want it all in automatically."** And it's feasible: Mediabunny 1.45.3 exposes `addAudioTrack` + `AudioBufferSource` (audio muxes into the WebM export with the current encoder; ProRes needs the ffmpeg backend to take a second input). The timed-motion-domain pattern ([ADR-0011](0011-text-animation-orchestration.md), which explicitly anticipated "audio cues") and the deterministic bundled-asset pattern (`substrate-textures.ts`, [ADR-0029](0029-image-substrate-on-depth-stage.md)) both map directly onto sound.

## Decision

Sound design enters Hiviz for the **cues** case (the ideas-doc lean is overturned for cues; in-app **mixing** stays out — that remains the NLE's job).

### 1. Scope: composition-locked cues + an optional bed, baked into export — no mixer

Sound that is *part of the composition*, not a DAW. A library of cues, an optional single music/ambient **bed** (only for self-contained **segments / bumpers**; transparent **Overlays** keep the footage's own audio), muxed into the deliverable. Multi-track mixing, level automation, fades, EQ — out of scope, stays in Resolve.

### 2. The sound rides the animation (sound events are intrinsic to motion)

A motion primitive **emits** a semantic **sound event** at a frame-deterministic moment — `whoosh-in` at an overlay slide's start, `impact` at a card-drop's settle, `tick` per character of a kinetic build. The **trigger time and which-event are intrinsic to the motion** (owned by the Pipeline, like `motion-form` — never conceded to a kit or Pack). This is the automatic default: **no manual placement** for the common case, which is what kills the DaVinci pain.

### 3. Sound kit — a swappable resource, sibling to the appearance Pack

A **Sound kit** resolves **sound-event** Roles → concrete audio samples, two-level with core fallback (the [ADR-0024](0024-role-resolution-core-fallback.md) machinery, reused). "Choosing a sound style" = selecting a kit; swapping it re-sounds the whole piece. A kit carries **sound only** — no appearance (that is the Pack), no motion-timing (that is intrinsic to the motion). A Preset names one default kit; the runtime may override it. This keeps [ADR-0023](0023-pack-is-appearance-only.md)'s "Pack = appearance-only" intact while giving sound the same proven resolution machinery on its own axis.

### 4. Automatic cues are derived, not stored

The single source of truth is the **motion**. At render, each motion's emitted event resolves through the active kit **at the motion's own frame** — so the sound stays welded to the motion through every re-time and reflow, for free. `audioCues[]` on `EngineState` (peer to `textAnimations[]` / `marks.timings[]`) holds only **manual** cues and the **bed**. Sound renders no pixels, so it is **not a sixth Layer** — it is a timed-cue orchestration domain.

### 5. Escape hatches

- A **per-motion override**: mute, swap the event, or lock a specific sample for one animation.
- A signature animation may carry a **locked-specific** sound (not kit-resolved).
- **Manual free-standing cues** at an absolute timeline fraction (an outro sting, the bed start).

### 6. Determinism contract

- **Export audio is a deterministic offline mix** — a pure function of `{emitted events + manual cues + bed + kit samples + duration}`, mixed into one `AudioBuffer` at fixed sample positions and muxed via Mediabunny `addAudioTrack` (WebM) / an ffmpeg second input (ProRes). Same inputs → same samples. *preview == export holds for the exported track.*
- **Preview audio is real-time, playback-only** — cues schedule through Web Audio during the wall-clock play loop; **scrub is silent** (optional one-shot blip when the playhead crosses a cue). Scrubbable preview audio (per-frame buffer seeking) is rejected for v1.
- The frame-determinism rule governs the **exported artifact**; preview audio is an un-exported approximation, exactly like dropped-frame preview pixels.

### 7. Assets are bundled deterministically

Sound samples load via the audio analog of `substrate-textures.ts` ([ADR-0029](0029-image-substrate-on-depth-stage.md)): Vite import → `decodeAudioData` → memoized `AudioBuffer` cache, keyed by slug. Committed, deterministic, no network at render.

### 8. Core sound-event vocabulary (starter)

The engine pins a core set; kits supply samples; core-fallback covers gaps. Starter: `whoosh-in`, `whoosh-out`, `impact`, `tick`, `pop`, `sub-drop`, `sting`. Motions declare which they emit via a **default per-primitive mapping** plus a per-entry override.

## Alternatives rejected

- **A sixth "Audio" Layer** — sound renders no pixels; it is an orchestration domain peer to `textAnimations[]` / `marks.timings[]` ([ADR-0011](0011-text-animation-orchestration.md)).
- **Fold sound into the appearance Pack** — breaks [ADR-0023](0023-pack-is-appearance-only.md) "appearance-only" and welds look to sound. A separate kit keeps the axes independent.
- **Manual cue placement as the primary model** — that *is* the DaVinci pain. Automatic emission is the value.
- **Materialized automatic cues** (stored in `audioCues[]`) — duplicates the motion's source-of-truth and must be re-synced on re-time. Derived = locked for free.
- **Scrubbable preview audio** / an **in-app mixer** — out of scope (lift vs. value; Resolve's job).

## Non-goals

- A mixing surface (multi-track, level automation, fades, EQ).
- Scrubbable preview audio.
- Automated sound verification (a "sound Critic") — by-ear for now (cf. the deferred GUI-parity verification question); revisit.

## Consequences

- New `EngineState` field `audioCues[]` + a per-motion sound override; a core sound-event enum; a default primitive→event mapping.
- A new **Sound kit** resource (manifest + resolver) parallel to the Pack, reusing [ADR-0024](0024-role-resolution-core-fallback.md) resolution.
- A new audio-asset loader ([ADR-0029](0029-image-substrate-on-depth-stage.md) pattern), an offline mixer, and export muxing on both paths.
- Export gains an audio track; the transparent/opaque export lane is unchanged — audio is orthogonal to alpha.
- Tracked in dex; see [`roadmap.md`](../roadmap.md) § Sound design.
