# Corpus cinematic audit (2026-06)

Parallel art-director critique of every family's deliverable vs a Netflix-grade bar (12 agents, one per family). Strips: `docs/critic-captures/strips/`. None is cinematic yet.

## Scores (worst → best)

| Score | Family | One-line |
|---|---|---|
| 2 | cursor-trail | **Broken**: title clipped off-frame ("BUILD THING"), cursor+trail (the hero) invisible in every frame |
| 3 | paper | Dead-centered white card on checkerboard; marks appear and sit; Figma artboard, not paper-on-a-desk |
| 3 | washi-tape | Postage-stamp card fades in, holds dead-still ~7s, fades out; tape reads as confetti slivers |
| 3 | watermark | Flat kinetic type on a void; hero word clips off-frame |
| 3 | instance-stack | **Bug**: the "vertical" preset is authored 16:9 horizontal; flat coplanar copies |
| 3 | shader-fill | The banned "soft keynote gradient wash" — floating box, off-brand colors |
| 4 | type-hero | Raked rim-light invisible (under-tuned); hero word never moves; no grade |
| 4 | newspaper | Flat tan card, dead-centered; mid-hold frames byte-identical; substrate physics absent |
| 4 | counter | Slot-machine roll never holds the milestone; number renders cream not brand-yellow |
| 4 | text-3d | Opacity-faded letters, not a lit 3D surface; monotone spin, no hero frame |
| 5 | chapter-card | Genuinely filmic backdrop wasted on a dead-centered title that barely moves; black dead tail |
| 5 | title-sequence | Drop is over before it's seen; dead static middle; flat opacity exit; no grade |

## The real finding — it's SYSTEMIC, not 12 separate problems

High-severity findings cluster into ~4 shared deficits (count across corpus):

- **motion : 14** — dead static holds (p50≈p85, nothing moves for ~5s); linear/opacity fades instead of weighted ease/anticipation/follow-through; no continuous drift.
- **color-grade : 11** — flat sRGB "CSS on black": near-black voids (#040408), pure-white ink (Q17 violation), no vignette / S-curve / warm-cool split / black-lift / halo.
- **composition : 9** — everything dead-centered; no off-center tension, focal hierarchy, or shaped negative space.
- **depth : 8** — flat coplanar layers; no light direction, contact shadow, or dimension.
- (type 5, chrome 2, timing 2)

## Re-planned execution (systemic-first = most cinematic per effort)

**Tier A — systemic lifts (fix once, elevate all 12):**
1. **Filmic grade** — a frame-level grade pass/Effect (vignette + S-curve + warm-highlight/cool-shadow split + black-lift + optional brand halo). Kills "CSS on black" everywhere. Biggest single lift.
2. **Kill dead holds** — a subtle always-on push/drift so the ~5s hold breathes (p50 ≠ p85).
3. **Depth/light default** — one light direction + contact shadow (ties to the inert `light`/`material` Pack Roles + the depth stage).

**Tier B — per-deliverable bugs (unambiguous defects):**
- cursor-trail: fit title inside title-safe + make the cursor/trail actually render (hero feature renders to nothing).
- instance-stack-vertical: make it actually vertical (2160×3840).
- watermark: fix "NEW EPISODE" clip.
- type-hero / title-sequence: turn up the under-tuned rake/drop shaders so the effect is visible.

**Tier C — per-preset staging + chrome:** off-center composition, mono kicker chips, hold-the-payoff timing, milestone holds, etc.
