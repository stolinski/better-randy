# Paper Surface enter / exit motion via `transform`, not `top`

## Status

**Canon.**

The paper Surface's article DOM (`article.paper-source` in
`src/lib/pipelines/surfaces/paper/CanvasSource.svelte`) was animated by writing
to its CSS `top` property as `animState.paperVisibility` ramped from 0 to 1,
backed by `will-change: top`. The Critic of the in-flight text-animations
Brief observed that the article DOM laid out at the correct rect with
`opacity: 1` and `visibility: visible`, but its pixels did not enter the
WebGPU swap chain. A one-shot CPU-readback dump of the `domTexture` populated
by `device.queue.copyElementImageToTexture(article, …)` confirmed **case (a)
from `docs/briefs/paper-surface-paint-bug.md`** on the verification preset
`text-anim-showcase-generic`: the texture contained only the lower-third
overlay rect at the bottom-left, with the entire article rect dropped. We
remediated the suspected trigger on the paper Surface by replacing the `top`
interpolation with a compositor-only `transform: translate3d(0, translateY,
0)` interpolation driven by the same `animState.paperVisibility` value, and
removed the `will-change: top` declaration on `.paper-source`. The visual
behavior is identical (vertical slide-in / slide-out across the same start
and end positions); only the CSS property animated has changed from a
layout-property to a compositor-only property, so Chrome no longer needs to
promote the article into its own paint layer.

`research-paper-attention` — the Brief's declared verification preset — was
never observed in the broken state during this investigation: the
`domTexture` dump produced from `uploadDom()` already contained the fully
rendered article (3.4M opaque pixels, title / kicker / byline / body all
present) at progress 0.5 prior to applying the fix. The fix lands here as
defensive hygiene against the same trigger reappearing under future Chrome
versions or under text-animation orchestration that subsequently mutates
the article subtree.

The text-animations splitter (`src/lib/text-animations/split-text.ts`)
applies `will-change: transform, opacity, filter` to each split unit on
the body / title slots. Investigation showed that this is what actually
trips the WICG capture path on `text-anim-showcase-generic`, not the
article's own `will-change: top`. Removing the article-level trigger does
not fix `text-anim-showcase-generic`; that work lands in a separate text-
animations Brief Critic loop.

## Considered options

- **Pre-promote every WICG-captured element with `transform: translate3d(0,
  0, 0)` so they always live in their own paint layer** (rejected: cargo-
  cult layer promotion — fights the diagnosis instead of removing the
  trigger. The diagnosis is that layer promotion is the bug, not the cure.
  Layer promotion may also vary between Chrome versions in ways the
  layoutsubtree capture handles differently; the fix that holds across
  versions is the one that doesn't promote the element in the first
  place).
- **Disable the article's enter / exit motion** (rejected: the surface
  enter is part of the canonical motion vocabulary established by
  `docs/aesthetic.md` § Motion Vocabulary, not optional. Every paper-
  Surface Preset depends on the article sliding in from below the title-
  safe area).
- **Wrap the article in a non-promoted parent and animate the parent's
  `top`** (rejected: would still promote the parent in the same way;
  Chrome's layer-promotion heuristic is driven by the *animated property*,
  not the layer's role. Restructures the DOM for no gain).
- **Keep `top` animation but animate it without `will-change`** (rejected:
  Chrome will still promote a `top`-animated element to its own paint
  layer once the animation is active, with or without `will-change`. The
  hint speeds promotion up but the promotion happens regardless. Removing
  the hint alone is not the fix).
- **Fold this into ADR-0011** (rejected: the bug pre-dates the text-
  animation work and affects every paper-Surface Preset whose article
  ever moved. The ADR-0011 Critic loop on `text-anim-showcase-generic`
  surfaced this paint bug as a side observation but did not cause it.
  ADR-0011 is about how text animations are modeled as engine-state
  orchestration; this ADR is about which CSS properties the Surface's
  CanvasSource is allowed to animate. Different scope, separate record).

## Consequences

The paper Surface's `CanvasSource.svelte` now animates the article via
`transform: translate3d(0, Y, 0)` where `Y` is computed inline in the
`layout` `$derived.by` block from `animState.paperVisibility`. `top` is
still set on the article, but it is set to the *settled* vertical
position only (`frame.height * TITLE_SAFE_MARGIN`); it never changes
across the timeline. The article's static `top` plus its dynamic
`transform` together produce the same world-space rect at every progress
that the prior `top` interpolation produced.

The `will-change: top` declaration is removed from `.paper-source`. No
new `will-change` is added — `transform` animations don't need the hint
to run smoothly in Chrome, and adding `will-change: transform` would
promote the article into its own layer for an entirely different reason
(the documented purpose of `will-change`) and re-introduce the original
bug.

The Brief at `docs/briefs/paper-surface-paint-bug.md` remains until
`/critic research-paper-attention` returns `ACCEPT`, per the lifecycle
in `docs/briefs/README.md`. The follow-up Brief noted in the Brief's
"Follow-ups" section — documenting WICG paint-layer-promotion behavior
in `docs/html-in-canvas-typegpu.md` — remains a pending lightweight
documentation task that the next Pipeline author should pick up before
adding `will-change` (or any other layer-promoting CSS) to any element
inside a captured layoutsubtree.

Future Pipeline authors writing CanvasSource components should treat
`will-change` on captured-DOM elements as defective and prefer
`transform` for enter / exit motion. The text-animations splitter sets
`will-change` on per-unit spans for legitimate per-glyph compositor
performance reasons; resolving the resulting capture failure for paper-
hosted Presets with text animations is the scope of the separate text-
animations Brief Critic loop.
