import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	cursorTrailOverlayDefinition,
	type CursorPath as CursorPathDefinition,
	type CursorTrailContent as CursorTrailContentDefinition
} from './definition';

export type CursorPath = CursorPathDefinition;
export type CursorTrailContent = CursorTrailContentDefinition;
export const cursorTrailOverlayRenderer: OverlayRenderer<CursorTrailContent> = {
	...cursorTrailOverlayDefinition,
	CanvasSource,
	Editor
};
