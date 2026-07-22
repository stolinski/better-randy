import type { DiagramStatCallout } from '$lib/platform/engine-schema';
import type { BlockRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';

// Diagram stat-callout Block (ADR-0036): a number that builds — counter-roll
// semantics over its [rollStart, rollStart + rollWindow] window, holding the
// landed value. Mounted by DiagramMount; shape validated by the Preset
// schema's `surface.diagram[]` union.
export const statCalloutBlockRenderer: BlockRenderer<DiagramStatCallout> = {
	type: 'stat-callout',
	CanvasSource
};
