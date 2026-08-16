import type { DiagramTimelineSegment } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';
import { timelineSegmentBlockDefinition } from './definition';

// Diagram timeline-segment Block (ADR-0036): a spanned interval with explicit
// endpoints — the H↔V reflow stress case. The rule + end ticks are
// stroke-drawn into the marks canvas via `drawDiagramStrokes`; the caption is
// DOM, mounted by DiagramMount above the span's midpoint.
export const timelineSegmentBlockRenderer: BlockRenderer<DiagramTimelineSegment> = {
	...timelineSegmentBlockDefinition
};
