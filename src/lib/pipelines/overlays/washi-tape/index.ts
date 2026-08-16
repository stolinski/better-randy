import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	washiTapeOverlayDefinition,
	type WashiTapeContent as WashiTapeContentDefinition
} from './definition';

export type WashiTapeContent = WashiTapeContentDefinition;
export const washiTapeOverlayRenderer: OverlayRenderer<WashiTapeContent> = {
	...washiTapeOverlayDefinition,
	CanvasSource,
	Editor
};
