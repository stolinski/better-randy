# Achievement notifications

**Kind:** pipeline
**Slug:** achievement-complete
**Verification preset:** achievement-complete

## Pitch

A compact upper-right notification family for decisive completion beats over footage. The `checklist-complete` variant is the standalone alternative to the half-frame checklist: it confirms one finished task without keeping the checklist visible. The `unlocked` variant uses the familiar video-game achievement register for a larger celebratory beat. They share one card, content, timing, and editor model, but differ at the semantic focal moment: a drawn check for functional progress versus a hex-medal reveal and late chip pop for celebration.

## Surface(s) involved

Both presets use the existing transparent `plain` Surface. The new work is an `achievement` Overlay Pipeline with two data variants:

- `checklist-complete`
- `unlocked`

No Surface is added or extended. The Overlay lands in the upper-right safe area as a compact icon-left/text-right card: approximately 32% of frame width horizontally and 82% vertically. Both corpus presets remain horizontal; the Pipeline must reflow correctly when either composition is switched to vertical. Do not create orientation-duplicate presets.

## Content sample

`achievement-complete`:

- Kicker: `TASK COMPLETE`
- Title: `Env vars set`

`achievement-unlocked`:

- Kicker: `ACHIEVEMENT UNLOCKED`
- Title: `First commit`
- Badge: flat hex medal

These strings ship verbatim and remain editable through the Overlay editor. The completion/unlock beat is authored composition data exposed on the timeline, not a hard-coded wall-clock delay.

## Motion plan

Both four-second presets use the same frame-deterministic macro shape:

1. Entry: the card flies in from beyond the right frame edge over approximately 420 ms with strong deceleration and a restrained `settled-place` overshoot. Emit a quiet `whoosh-in` event.
2. Focal beat at approximately 1.35 seconds: the selected variant performs its intrinsic completion motion.
3. Hold: the completed state remains fully readable.
4. Exit: beginning near 3.4 seconds, the card accelerates back through the right edge over approximately 350 ms. Emit a quiet `whoosh-out` event.

The deliberate slide-from-edge move is normally generic motion-template territory, but is retained here because the user explicitly requires notification behavior that enters and clears from the same screen edge. It must be rendered as decisive travel plus a settled placement, with no swoosh graphics, blur, or glossy wipe.

Variant focal slots:

- `checklist-complete`: a hollow checkbox and live task title arrive incomplete. At the authored beat, a green check `stroke-draw`s into the box, the box resolves to its completed state, and the task ink dims slightly. The check is the sole hero. Emit restrained draw/click completion cues.
- `unlocked`: a flat hex medal scales from approximately 0.82 to 1 with one restrained overshoot. The yellow `ACHIEVEMENT UNLOCKED` chip pops slightly after the medal lands, following the Syntax chip-pop vocabulary. The medal is the hero; the title remains stable. Emit one compact pop/impact cue.

No wall-clock playback, random motion, glow, particle burst, score burst, progress bar, or per-word typewriter animation.

## Channel chrome notes

Use the native Syntax live-overlay card system:

- Mono signature thread: the kicker/chip uses Space Mono 700 uppercase with the channel tracking.
- Card: warm dark opaque plate, visible border, 16 px 4K radius, and the full stepped hard shadow resolved through Pack Roles.
- Display title: Space Grotesk 700.
- Accent hierarchy: yellow is reserved for the kicker/chip and medal emphasis; success green appears only at the checklist completion beat. Keep the saturated-hue count within the channel cap.
- Torn edge: intentionally omitted. This is channel chrome, not a quoted physical substrate.
- Registration jitter: intentionally omitted. The card and badge are clean printed chrome, not a hand mark or found document.
- Grit overlay: intentionally omitted. This is a transparent live Overlay and should match the clean native overlay system.
- No gradients, glow, gaussian shadow, glossy light sweep, scribble, or zine treatment.

Appearance must resolve through the active Pack. The Syntax Pack supplies the treatment above; the Presets must not hard-code Syntax colors, fonts, edge treatment, or depth treatment.

## Engine work required

- Add `src/lib/pipelines/overlays/achievement/` as one registered graphic Overlay family with `index.ts`, `identity.ts`, `CanvasSource.svelte`, and `Editor.svelte`.
- Add `variants/types.ts`, `variants/index.ts`, `variants/checklist-complete.ts`, and `variants/unlocked.ts` following ADR-0020. Variant motion functions must be pure and frame-deterministic.
- Model editable kicker, title, variant, and authored beat in the Overlay content schema. Keep the two variants on one content/editor contract; do not create separate Overlay types.
- Give the completion beat a draggable timeline identity and derive its sound cues from the motion. Entry and exit continue to use Overlay transition windows.
- Register the `achievement` Overlay in `src/lib/platform/pipelines/index.ts` and update all registry/schema-derived fixtures or generated schema artifacts required by the existing verification commands.
- Add the GUI controls needed to select either variant, edit the two text fields, and retime the focal beat. Preserve direct canvas selection and existing Overlay position/transition controls.
- Add `achievement.*` appearance Roles to `src/lib/packs/syntax/manifest.ts` for the card plate, ink, muted ink, accent, success, border, radius, stepped depth, and fonts, using specific-to-core fallback rather than embedding appearance in the Presets.
- Add focused tests for content parsing, unknown variant rejection, deterministic beat states, sound derivation, horizontal/vertical frame fit, and editor/state updates using the repository's existing Pipeline test patterns.
- Add `src/lib/presets/achievement-complete.json` and `src/lib/presets/achievement-unlocked.json`, both horizontal, four seconds, transparent, and using the exact copy and motion plan above.

## ADR required?

yes

The Producer must record why functional task completion and game-style unlock are variants of one `achievement` Overlay family rather than separate Pipelines, how the authored focal beat relates to intrinsic variant choreography, and why orientation is Pipeline reflow rather than duplicated corpus Presets.

## Open questions

## What 'done' looks like

- `src/lib/pipelines/overlays/achievement/` implements the family, both variants, Identity Spec, editor, deterministic motion, sound, and horizontal/vertical reflow.
- The Syntax Pack resolves every declared appearance dimension without Preset-level appearance literals.
- A new ADR records the family and variant boundary.
- `src/lib/presets/achievement-complete.json` ships the `checklist-complete` variant and Critic-`ACCEPT`s at native 4K horizontal resolution.
- `src/lib/presets/achievement-unlocked.json` ships the `unlocked` variant and Critic-`ACCEPT`s at native 4K horizontal resolution.
- Switching either Preset to vertical renders at native 2160×3840 inside platform safe areas with no clipping, overlap, or orientation-specific duplicate Preset.
- The Brief is deleted only after both presets receive Critic `ACCEPT`.
