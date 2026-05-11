# Quote Focus Tool

Route: `/tools/quote-focus`

## Purpose

Create transparent overlays that isolate and emphasize a quote from a larger block of text. The surrounding text can dim, slide away, blur visually through canvas treatment, or recede while the quote becomes the hero element.

This tool is for commentary videos, documentary-style edits, essays, and social clips where a specific sentence or claim needs to feel pulled out of source material.

## Inputs

- Body text.
- Selected quote.
- Optional speaker/author.
- Optional publication/source.
- Optional date or timestamp.

## Controls

- Aspect: 4K horizontal or 4K vertical.
- Duration and frame rate.
- Quote selection.
- Focus style: highlight, magnify, isolate, lift-out, tear-out.
- Background text visibility.
- Source metadata visibility.
- Emphasis mark style: underline, box, circle, side note.
- Camera motion: none, slow push, snap zoom.

## Canvas Rendering Model

All final visuals are canvas-rendered frames.

Use HTML-in-Canvas for source text layout, not for animation playback:

- Lay out the full source block as a direct child of the `layoutsubtree` canvas.
- Draw the source block into canvas each frame with `drawElementImage`.
- Apply dimming, masking, magnification, quote lift, and annotation marks in canvas from timestamped timeline state.
- Do not rely on CSS transitions or DOM animation for final output.

## Animation Beats

1. Source text appears as a composed block, clipping, excerpt, or document fragment.
2. Selected quote region becomes visually discoverable.
3. Surrounding text recedes.
4. Quote enlarges, lifts, or locks into a focal position.
5. Highlight/underline/circle animation marks the key phrase.
6. Attribution or source label resolves.
7. Final frame holds for editor-friendly timing.

## Output

- Transparent background.
- 4K horizontal: `3840x2160`.
- 4K vertical: `2160x3840`.
- Primary export target: transparent WebM through Mediabunny.

## Planning Notes

The quote should be addressable as a text range in the source scene model. If the selected quote is not found exactly, the tool should fail clearly and keep the previous valid selection rather than silently highlighting the wrong phrase.

