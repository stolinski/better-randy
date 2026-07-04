import type { DiagramNode } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

// Diagram node Block (ADR-0036): a labeled point in the diagram — pin, box,
// or dot form (content; the author picks), appearance via Pack Roles. Mounted
// by DiagramMount at its explicit composition position; unlike overlay
// contents its shape is validated by the Preset schema itself
// (`surface.diagram[]` discriminated union), so no separate content schema.
export const node: BlockRenderer<DiagramNode> = {
	type: 'node',
	CanvasSource
};
