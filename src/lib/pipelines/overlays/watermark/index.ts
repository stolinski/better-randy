import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	watermarkOverlayDefinition,
	type WatermarkContent as WatermarkContentDefinition
} from './definition';

export type WatermarkContent = WatermarkContentDefinition;
export const watermarkOverlayRenderer: OverlayRenderer<WatermarkContent> = {
	...watermarkOverlayDefinition,
	CanvasSource,
	Editor
};
