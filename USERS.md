---
name: GFX
description: Author broadcast-quality, frame-deterministic motion pieces (transparent overlays + full-frame segments/bumpers) as JSON Presets dressed by swappable Packs, reflowing across horizontal and vertical targets.
users:
  - id: repo-agent
    label: "Dev-time repo agent"
    priority: primary
    share: "effectively all authoring today — the corpus is agent-built"
    proficiency:
      tech: expert
      domain: novice
    context:
      device: "coding agent (Claude Code) in this repo — terminal/CLI, editing JSON + TS/WGSL"
      environment: "autonomous, epic-by-epic from dex; reads AGENTS.md/CLAUDE.md, briefs, aesthetic docs, CONTEXT.md; verified by a separate Critic sub-agent it never controls"
      frequency: "continuous within an epic"
      stakes: high
    goals:
      - "author a Preset the Critic ACCEPTs — zero pipeline-bug / default-too-permissive — at the quality bar"
      - "land engine/pipeline work that registers cleanly (no Identity Spec dimension unimplemented or unprobed)"
    cares_about:
      - "unambiguous declarative schema — everything expressible as JSON it can read and set"
      - "GUI↔agent parity — no capability locked behind a GUI it can't drive"
      - "frame-determinism — preview and export produce the same pixels at the same time"
      - "discoverable registry vocabulary — knowing what Surfaces/Blocks/Annotations/Overlays/Effects exist"
      - "unfakeable failure signals — Critic probes + named observations, not prose"
      - "opinionated defaults that refuse to collapse to an 'animated div'"
    frustrations:
      - "parity violations — a capability reachable only via the GUI (or only via the schema)"
      - "silent default collapse — a permissive default that degrades output without forcing intent (default-too-permissive)"
      - "ambiguous or undiscoverable schema that forces it to guess values"
      - "a measurable rule with no probe — nothing to quote"
      - "being asked to self-verify — it structurally cannot; that's the Critic's job"
      - "TODOs, stubs, hardcoded-not-schema-first values"
    success: "dex complete with a Critic ACCEPT + commit SHA; a Preset indistinguishable in format from a human-authored one"
    resonance_cue: "everything is a declarative field it can read and set; the engine's constraints supply the taste it lacks; failures come back as numbers, not vibes; nothing is locked behind a GUI"
  - id: gui-author
    label: "GUI author"
    priority: secondary
    share: "near-term human audience; dogfooding still deferred"
    proficiency:
      tech: intermediate
      domain: intermediate
    context:
      device: "desktop browser — the shipped SvelteKit GUI (localhost:7263 in dev)"
      environment: "focused, project-based composing; their own eye is the live critic (no Critic agent runs on their work)"
      frequency: "occasional / per-video"
      stakes: medium
    goals:
      - "produce a broadcast-grade motion piece for a real topic, reflowed to the target orientation, that reads as intentional — without touching JSON"
      - "fork a Starter template into a User composition and vary it, never mutating the corpus"
    cares_about:
      - "precise, direct control (inspector panels + DaVinci-style keyframe timeline)"
      - "preview == export fidelity"
      - "true parity — nothing the agent can author that they can't"
      - "speed to a good-looking result from a Starter template"
      - "no hand-holding — auto-save, no save/refresh buttons, no explanatory UI text"
    frustrations:
      - "GUI-only vs agent-only capability gaps"
      - "clunky or imprecise controls that feel 'functional but off'"
      - "boxes-within-boxes, gratuitous chrome, text explaining the UI"
      - "having to hand-sync sound or hand-re-time motion the engine should cascade"
      - "output that reads as a generic house look rather than intentional"
    success: "a User composition that reads as intentional and ships to their channel, authored entirely in the GUI"
    resonance_cue: "dense, precise, DaVinci-inspired-but-more-intentional tool chrome; no marketing gloss; the tool respects that they have taste and gets out of the way"
anti_users:
  - "node-compositor power users — anyone wanting a general node graph / After Effects replacement (GFX is a constrained, opinionated vocabulary; After Effects is the quality ceiling, not the architecture)"
  - "generic-good-enough acceptors — anyone happy with 'animated div' output (the Identity Spec refuses div-shaped approximations; the Critic rejects default-too-permissive)"
---

## Overview

GFX is an opinionated, Netflix-grade **motion-graphics engine**. It produces
broadcast-quality motion pieces — transparent overlays composited over footage,
and full-frame segments/bumpers — authored as JSON **Presets**, dressed by a
swappable **Pack**, reflowing across horizontal (YouTube) and vertical
(TikTok/Reels) targets.

Its defining architectural bet is **full parity between a GUI and agents**:
anything one authoring surface can do, the other can, alone or collaborating.
That bet decides who the users are. Today the authoring that matters is done by
an **AI agent** in this repo, building the reference corpus that proves the engine
hits the bar — so the **dev-time repo agent is the primary user**. The
design-literate **human in the GUI** is the near-term secondary author; broader,
less-technical content creators are the audience being built toward (explicitly
*not* anti-users — production dogfooding and content-scale tooling are simply
deferred, not disowned).

The two active user types differ not in job title but in how they author and what
they can lean on: the agent authors declarative JSON and cannot judge its own
taste, so the engine's constraints and a separate Critic must; the GUI author
brings the eye the agent lacks and acts as their own live critic. When their
needs conflict, **parity is the tie-breaker** — a capability must serve both, and
the agent (primary) wins if it can only serve one.

## Dev-time repo agent

The agent is who must succeed, because right now it does essentially all the
authoring. It works the dex loop (`dex list --ready`), reads the binding docs, and
either authors a Preset (declarative JSON against `supers@1`) or lands engine work
(a pipeline, an ADR). It is a **technical expert and an aesthetic novice** — and
the whole architecture is designed around that split. The opinionated engine, the
appearance **Packs**, the per-Pipeline **Identity Spec** (which refuses to register
a renderer that would collapse to a defaulted, div-shaped approximation), and the
adversarial **Critic** all exist to supply the taste the agent doesn't have. The
agent is explicitly forbidden from self-verifying; a Producer never grades its own
Preset.

Because it can't see pixels the way a human does, the agent lives or dies on
**legibility of the system to a reader that only reads**. Every capability must be
a field it can discover and set. Frame-determinism must hold so preview and export
agree. Failures must arrive as **unfakeable numbers** — Critic probes and named
observations at pixel coordinates — not as vibes it can't act on. Its bail
conditions are the inverse: a parity violation (something only the GUI can do), a
permissive default that lets its output silently degrade, an ambiguous schema that
forces a guess, or a measurable rule with no probe to quote. "Done" is a
`dex complete` carrying a Critic ACCEPT and a commit SHA — and a Preset whose
format is indistinguishable from one a human authored.

## GUI author

The GUI author is the design-literate human working in the shipped SvelteKit
interface — the person the parity bet ultimately serves, and today effectively the
project's own eye. They **are the live critic**: no Critic agent runs on their
work, so the tool must let their judgment operate directly and fast. They fork a
corpus Preset opened read-only as a **Starter template** into a **User
composition** in a separate, user-writable store — so they can never pollute the
git-tracked proof corpus.

They come with the taste the agent lacks, so they want **control and precision**,
not hand-holding: inspector panels, a DaVinci-style keyframe timeline (per-property
playhead value with prev/◆/next, never raw keyframe lists), auto-save (no save
buttons), always-fresh data (no refresh buttons), and no explanatory copy telling
them what to do — the right path should be obvious from the UI itself. They bail on
the things that betray craft: clunky or imprecise controls, boxes-within-boxes,
gratuitous chrome, having to hand-sync sound or hand-re-time motion that a Cascade
should re-time as one unit, and — above all — output that reads as a generic house
look instead of something intentional. Success is a composition that ships to their
channel and reads as deliberate, authored entirely in the GUI, with the confidence
that the agent can't reach past them into capabilities they can't.

## Who This Is Not For

**Node-compositor power users.** GFX is deliberately a tasteful, constrained
vocabulary with smart defaults — not a general node graph. *After Effects is the
quality ceiling, not the architecture.* Anyone reaching for a blank-canvas
compositor is reaching for the wrong tool, and serving them would dissolve the
opinionation that makes the output good.

**Generic-good-enough acceptors.** The product actively fights "good enough." The
Identity Spec refuses div-shaped approximations at registration time and the Critic
rejects `default-too-permissive` findings. A user content with "animated div"
output is not underserved by GFX — they are working against its entire premise.

Notably *not* excluded: non-technical creators and users who want fast, low-effort
results. They aren't the audience today, but they are who the tool is being built
toward — the deferred pull, not a disowned one.
