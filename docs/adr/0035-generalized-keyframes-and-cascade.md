# Generalized keyframes + Cascade — composition-owned motion channels

## Status

**Canon (built).**

> **Status: Canon (built)** — shipped 2026-07-02 in dex epic `4i8gx2i7`: schema, channel-owned rendering, Cascade resolution, timeline/inspector editing, welded sound cues, and envelope-aware static lint. The existing `enter`/`exit` shape survives as lossless sugar.

The 2-keyframe tween (`Transition: { start, duration, ease }`) is replaced as the *general* form by ordered **`keyframes[]` per channel** with **per-property ease** from the constrained enum, plus **Cascade** — a declarative anchor that welds one element's timing to another's. Declaring keyframes on an element means the composition **takes full ownership of that element's motion**: the pipeline's intrinsic enter/exit form does not run. An element with no keyframes renders exactly as today.

## §1 Context

Three pressures converged:

- **Choreography ceiling.** A Transition is one window, one ease, all properties. Multi-step motion (scale 1→0.96→1 settle, dip-then-land reveals) is inexpressible; the opacity-exit softening had to be hardcoded (`getEaseGsap` special-cases `'exit'`+`'opacity'`).
- **Timing drift.** Reading-order entrances (kicker → title → subtitle) are hand-set absolute fractions. Re-time one element and the others silently drift — and the rubric's A1/A2 rules (marks ≥0.02 after surface enter-end; ≥120 ms mark stagger) are cascade constraints the author re-satisfies by hand every edit.
- **A doctrine collision.** Overlay motion *form* (fade + 32 px rise) is intrinsic per pipeline (`OverlayMount.visibilityStyle`, Identity Spec `motion-form`), while the binding rule says animation must be schema-first and GUI-visible, never hardcoded in a component. Both were true because the schema only carried *timing*; form had nowhere to live. Keyframes give it the home.

Feasibility: `animation-manager.ts` already executes arbitrary multi-tween manifests (text-animation strategies emit per-glyph tween sets). The 2-keyframe constraint lives only in the schema and `buildAnimationManifest` (Workspace.svelte ~306–420).

## §2 Ownership — replace, not layer

- **No keyframes declared** → `enter`/`exit` sugar drives the element's scalar visibility fraction and the pipeline renders its intrinsic motion-form, byte-for-byte as today. Zero visual change to the existing corpus.
- **Keyframes declared** → the composition owns that element's motion outright. The intrinsic enter/exit form is bypassed (the mount/shader consumes the authored channels, not the visibility-fraction translation). No layering: authored motion never composites with hidden motion.
- Rejected: *layer on top* (double-motion mystery — exactly what the Svelte/state rules ban) and *pipeline-exposed named params* (a new per-pipeline contract; the GUI couldn't offer one uniform editor).

Identity Spec `motion-form` dimensions remain the **default** an element ships with — "intrinsic" now means *what you get when the composition doesn't take the pen*, not *unoverridable*.

## §3 Channels (v1)

| Element | Keyframeable channels |
|---|---|
| Overlay | `opacity`, `x`, `y`, `scale`, `rotation` |
| Surface | `opacity` only |
| Marks / text animations | none in v1 (windows + Cascade only, §4) |

- Surface transforms are **camera territory** (`stage.camera`, depth stage) — two systems must not fight over the same pixels.
- `rotation` lands with a static base `rotation` on `OverlayPositionSchema` plus canvas direct-manipulation (absorbs standalone task `5vcak6og`) so schema, inspector, and canvas handles ship as one piece.
- Marks stay a single stroke-draw scalar; text animations stay catalog strategies (already multi-tween). Either can join in a later rev if a piece demands it.

## §4 Cascade — welded relative timing

Any timed element (overlay, mark, text animation) may anchor its **enter start** to another element's enter **start or end** plus an offset in **milliseconds**:

```jsonc
"cascade": { "anchor": { "overlay": "title" }, "event": "end", "offsetMs": 120 }
```

- **Milliseconds, not fractions** — a 120 ms stagger must stay 120 ms when the piece re-times from 3 s to 6 s; fraction offsets stretch, which is the drift bug re-imported. (G6's bands are already absolute ms.)
- Anchor refs: `"surface"` | `{ overlay: id }` | `{ mark: index }` | `{ textAnimation: id }` — the same identities the timeline rows use.
- Resolution happens once in `buildAnimationManifest`: cascades topo-sort to absolute starts before tween emission. **Cycles are a lint error** (fail fast at validate/lint time, never a runtime guess).
- Sound cues resolve *after* cascade resolution, so automatic cues ride a re-timed cascade welded — same philosophy, one mechanism (ADR-0033).
- A1/A2-style choreography becomes declarative: marks anchor to `surface` `end` + offset; the linter can finally *suggest* the fix instead of only flagging the violation.

## §5 Schema shape

```ts
// Keyframe positions are ms from the element's resolved clip start —
// same welded-absolute reasoning as cascade offsets.
KeyframeSchema        = { atMs: number, value: number, ease?: EaseSchema }  // ease = curve INTO this keyframe
ChannelKeyframesSchema = { opacity?: Keyframe[], x?: Keyframe[], y?: Keyframe[], scale?: Keyframe[], rotation?: Keyframe[] }
// on OverlaySchema (surface gets { opacity } only):
animation?: { channels?: ChannelKeyframes, cascade?: CascadeSchema }
```

- **Ease stays the constrained enum** (`smooth`/`settled`/`sharp`/`bouncy`) per keyframe segment. No bezier values, no curve editor — the taste guardrail survives; rejected as a step toward the general node compositor the north star refuses.
- `x`/`y` are composition-fraction deltas from the element's `position` (anchor/offset stays the layout home); `scale`/`rotation` are absolute channel values seeded from the static position fields.
- The per-property model **deletes** the `getEaseGsap` opacity-exit special case: the sugar expands enter/exit into per-property defaults that encode the same craft rule explicitly.
- **Sugar, not migration:** `enter`/`exit` `{ start, duration, ease }` parses losslessly and round-trips byte-identical (the ADR-0032 save gate). No preset rewrites.

## §6 Rubric guardrails — lint the envelope

The linter derives each element's **enter envelope** (first keyframe → final landing) and applies the existing G6/A1/A2/L4 window checks to that envelope. What happens *inside* the envelope — overshoots, dips, double-takes — is Critic-taste territory, not machine-linted. Rejected: structurally banning non-monotonic curves (bans the craft the feature exists for) and no-guardrails (G6 silently stops firing — a safety-net regression).

## §7 Consequences

- `engine-schema.ts`, `buildAnimationManifest`, `OverlayMount` (channel consumption path beside the intrinsic one), sound-cue resolution order, `preset-rubric.ts` envelope derivation, timeline keyframe markers + cascade links, inspector keyframe list + anchor picker.
- The GUI keeps progressive disclosure: enter/exit sugar is the default face; the keyframe editor appears when an element has channels.
- Depth-stage and diagram-primitive work inherit the model (cascade is how docu-diagram reveals sequence).
- The corpus needs one new reference deliverable proving multi-step + cascade end-to-end (epic task); existing pieces are untouched by design.
