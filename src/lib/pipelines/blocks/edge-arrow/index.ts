import type { DiagramEdgeArrow } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

// Diagram edge-arrow Block (ADR-0036): a directed connection with an AUTHORED
// route (endpoints + one optional control point → straight / elbow / arc).
// Stroke-drawn, not DOM-mounted: the surface pipelines draw it into their
// marks canvas via `drawDiagramStrokes` (src/lib/annotations/
// diagram-strokes.ts), the arrowhead riding the drawing tip; appearance is the
// Pack's `diagram.stroke` / `diagram.arrowhead` Roles.
export const edgeArrowBlockRenderer: BlockRenderer<DiagramEdgeArrow> = {
	type: 'edge-arrow'
};
