# Research Paper Tool

Planned route: `/tools/research-paper`

## Purpose

Create transparent video overlays where a research paper, article, report, or academic-looking document flies into frame and receives animated editorial marks: highlights, circles, cross-outs, underlines, arrows, margin notes, boxes around claims, and annotation labels.

This is the first tool to prove the core Hiviz visual language: dense text, paper layout, precise marks, and exportable transparent motion graphics.

## Inputs

- Pasted Markdown.
- Pasted HTML.
- Optional source URL shown as document metadata.
- Optional title, author/publication, and date fields.
- Optional selected phrases or ranges to emphasize.

## Controls

- Aspect: 4K horizontal or 4K vertical.
- Duration and frame rate.
- Paper scale and entrance position.
- Document density.
- Annotation intensity.
- Highlight color.
- Mark style: clean, rough, academic, frantic.
- Camera motion: static, drift, punch-in, pan across section.
- Sequence pacing: slow review, normal, fast evidence dump.

## Canvas Rendering Model

All final visuals are rendered by canvas. Do not animate the document with CSS and then record the DOM.

Use HTML-in-Canvas as the rendering bridge:

- Place the paper DOM as a direct child of the `layoutsubtree` canvas.
- Use HTML/CSS only to define the document layout and typographic source.
- On every frame, render from an explicit timestamp.
- Draw the paper snapshot into canvas with `drawElementImage`.
- Draw highlights, circles, strike marks, arrows, margin notes, and camera movement as canvas-rendered timeline layers.
- Keep source DOM transforms synchronized only for hit testing/accessibility when needed; visual motion belongs to the canvas frame renderer.

## Animation Beats

1. Paper begins off-frame, slightly scaled or rotated.
2. Paper enters and settles.
3. Camera lands on the first relevant region.
4. Highlights reveal across selected text ranges.
5. Circles and underlines draw on top of claims.
6. Cross-outs and replacement annotations appear where useful.
7. Margin notes slide or write in.
8. Final composition holds long enough for editing.

## Output

- Transparent background.
- 4K horizontal: `3840x2160`.
- 4K vertical: `2160x3840`.
- Primary export target: transparent WebM through Mediabunny.
- The renderer must preserve alpha by clearing every frame and never painting an opaque background unless the user explicitly selects a visible paper/backplate.

## Planning Notes

The document parser should create a simple scene model: title, metadata, sections, paragraphs, quotes, lists, and markable text ranges. The canvas renderer consumes that model plus a timeline. Any generated annotations should be deterministic so stage rendering and export match exactly.
