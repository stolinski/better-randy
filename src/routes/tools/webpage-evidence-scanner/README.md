# Webpage Evidence Scanner Tool

Route: `/tools/webpage-evidence-scanner`

## Purpose

Create transparent overlays that present webpage or article evidence with animated scanning, zoom boxes, highlights, redactions, circles, arrows, and annotation labels.

This tool is useful for videos that need to show "here is the part of the page that matters" without cutting away to a full browser capture.

## Inputs

- Pasted article/page HTML.
- Pasted Markdown or plain text.
- Optional source URL for attribution.
- Optional page title and site name.
- Optional screenshot image as a reference asset.
- Selected snippets or regions to emphasize.

## Controls

- Aspect: 4K horizontal or 4K vertical.
- Duration and frame rate.
- Page style: article, docs, search result, generic webpage, screenshot-backed.
- Scan style: cursor, spotlight, magnifier, review marks.
- Highlight color.
- Redaction style.
- Zoom box size.
- Evidence sequence order.
- Camera motion: pan, punch-in, drift, locked.

## Canvas Rendering Model

The final overlay is rendered by canvas. The tool should not animate a live webpage with DOM/CSS and record that result.

HTML-in-Canvas can render a reconstructed page scene:

- Build a controlled page/document representation from pasted HTML, Markdown, text, or screenshot metadata.
- Place reconstructed page sections as direct children of the `layoutsubtree` canvas.
- Draw page snapshots into canvas with `drawElementImage`.
- Draw scan movement, masks, magnifiers, highlights, redactions, zoom boxes, and annotations in canvas from explicit timestamps.

## Important Constraint

This tool should not promise arbitrary live URL rendering into canvas. Cross-origin pages, authentication, scripts, dynamic layout, third-party embeds, and browser security rules make direct live-page capture a different product problem.

The first version should render content the user provides or content we explicitly fetch and sanitize through a supported app/backend path. Source URLs are metadata unless live fetching is deliberately implemented.

## Animation Beats

1. Page/document enters or settles into frame.
2. Scanner/cursor/spotlight searches across the surface.
3. First evidence region highlights.
4. Camera or magnifier zooms into the region.
5. Annotation appears.
6. Optional redaction or cross-out mark draws.
7. Sequence advances through additional evidence regions.
8. Final evidence frame holds.

## Output

- Transparent background.
- 4K horizontal: `3840x2160`.
- 4K vertical: `2160x3840`.
- Primary export target: transparent WebM through Mediabunny.

## Planning Notes

This is viable with the HTML-in-Canvas plan when the "webpage" is a controlled reconstructed scene. It is not viable as a general-purpose live browser renderer without additional capture infrastructure.

