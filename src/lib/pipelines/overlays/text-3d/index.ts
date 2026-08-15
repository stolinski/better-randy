import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

import {
	text3dOverlayDefinition,
	type Text3dContent as Text3dContentDefinition
} from './definition';

export type Text3dContent = Text3dContentDefinition;
export const text3dOverlayRenderer: OverlayRenderer<Text3dContent> = {
	...text3dOverlayDefinition,
	CanvasSource,
	Editor
};
