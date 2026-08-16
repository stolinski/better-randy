import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	youtubeSubscribeOverlayDefinition,
	type YoutubeSubscribeContent as YoutubeSubscribeContentDefinition
} from './definition';

export type YoutubeSubscribeContent = YoutubeSubscribeContentDefinition;
export const youtubeSubscribeOverlayRenderer: OverlayRenderer<YoutubeSubscribeContent> = {
	...youtubeSubscribeOverlayDefinition,
	CanvasSource,
	Editor
};
