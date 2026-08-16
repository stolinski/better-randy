import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	sourceUrlOverlayDefinition,
	type SourceUrlContent as SourceUrlContentDefinition
} from './definition';

export type SourceUrlContent = SourceUrlContentDefinition;
export const sourceUrlOverlayRenderer: OverlayRenderer<SourceUrlContent> = {
	...sourceUrlOverlayDefinition,
	CanvasSource,
	Editor
};
