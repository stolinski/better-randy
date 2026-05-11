# Tweet Highlighter Tool

Route: `/tools/tweet-highlighter`

## Purpose

Create transparent overlays featuring an X/Twitter-style post card with animated highlights, circles, underlines, strike marks, arrows, and annotations.

The goal is an editor-ready social post visual that resembles the current X post presentation closely enough for viewer recognition while remaining a controllable mock composition for video production.

## Inputs

- Post text.
- Display name.
- Handle.
- Avatar image.
- Optional verification state.
- Optional timestamp.
- Optional reply, repost, like, bookmark, and view counts.
- Optional media attachment placeholder or uploaded image.
- Optional quoted post.
- Selected text ranges to emphasize.

## Controls

- Aspect: 4K horizontal or 4K vertical.
- Duration and frame rate.
- Theme: light, dark.
- Card scale and position.
- Highlight color.
- Annotation style: circle, underline, marker, arrow, margin note.
- Engagement row visibility.
- Media/quote visibility.
- Entrance motion: slide, scale, pop, settle.
- Camera motion: none, punch-in, drift.

## Current X-Style Layout Notes

Use current X display conventions as a visual reference:

- Avatar positioned to the left of display name and handle for left-to-right posts.
- Display name, handle, and timestamp appear in the header row.
- Post text is the primary body content.
- Media, link card, or quoted post content appears below text when provided.
- Action row can include reply, repost, like, view/bookmark/share-style actions.
- Avoid using live X embeds for rendering; this tool needs deterministic canvas frames.

The X developer display requirements are useful reference material for recognizable post structure, but this tool should render a mock composition, not depend on X widget scripts.

## Canvas Rendering Model

All final visuals are rendered by canvas.

Use HTML-in-Canvas for the post card's layout source:

- Build the post card DOM as a direct child of the `layoutsubtree` canvas.
- Use HTML/CSS only to define the static post layout and text wrapping.
- Draw the post snapshot into canvas with `drawElementImage` each frame.
- Draw highlights, annotations, camera movement, card entrance, masks, and emphasis marks as canvas timeline layers.
- Do not rely on CSS transitions, X embeds, or live DOM animation for final video output.

## Animation Beats

1. Post card enters frame.
2. Card settles into the selected composition position.
3. Key text range highlights.
4. Circle, underline, arrow, or note draws over the highlighted claim.
5. Optional engagement row or quoted post receives emphasis.
6. Camera punches in or drifts to the marked section.
7. Final highlighted card holds.

## Output

- Transparent background.
- 4K horizontal: `3840x2160`.
- 4K vertical: `2160x3840`.
- Primary export target: transparent WebM through Mediabunny.

## Planning Notes

Keep the card renderer data-driven. A post with only text should look finished; posts with media or quoted content should add those regions without changing the basic animation model.

