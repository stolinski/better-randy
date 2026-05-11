# Timeline Explainer Tool

Route: `/tools/timeline-explainer`

## Purpose

Create transparent timeline overlays that explain events, steps, product history, incidents, legal sequences, investigations, launches, or narrative progressions.

The output should feel like an editor-ready animated graphic: pins, labels, connectors, date blocks, callouts, and emphasis marks over transparent video.

## Inputs

- Ordered events.
- Event labels.
- Optional dates or timestamps.
- Optional event descriptions.
- Optional source labels or references.
- Optional active/emphasized event.

## Controls

- Aspect: 4K horizontal or 4K vertical.
- Duration and frame rate.
- Timeline orientation: horizontal, vertical, stepped, arc.
- Event density.
- Active event timing.
- Connector style.
- Label style.
- Camera motion: locked, track along line, zoom into active event.
- Emphasis style: pulse, circle, underline, callout.

## Canvas Rendering Model

The timeline is rendered entirely by canvas.

HTML-in-Canvas can provide rich label layout:

- Event labels and callout DOM nodes may be direct children of the `layoutsubtree` canvas.
- Canvas draws label snapshots with `drawElementImage` at deterministic positions.
- Lines, pins, progress strokes, connectors, camera movement, reveals, and emphasis marks are canvas timeline layers.
- CSS animation is not part of final rendering.

## Animation Beats

1. Timeline base draws in.
2. Events reveal in sequence.
3. Current event receives visual emphasis.
4. Connector/progress stroke advances.
5. Callout appears near the active event.
6. Camera tracks to the next event when appropriate.
7. Final full timeline or active endpoint holds.

## Output

- Transparent background.
- 4K horizontal: `3840x2160`.
- 4K vertical: `2160x3840`.
- Primary export target: transparent WebM through Mediabunny.

## Planning Notes

The scene model should separate event data from layout. This allows the same event list to render horizontally for widescreen and vertically for short-form output without changing the user's content.

