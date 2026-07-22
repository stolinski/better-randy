import type { DiagramLabel } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

// Diagram label Block (ADR-0036): free text annotating a position — the
// diagram's caption voice. Mounted by DiagramMount; shape validated by the
// Preset schema's `surface.diagram[]` union.
export const labelBlockRenderer: BlockRenderer<DiagramLabel> = {
	type: 'label',
	CanvasSource
};
