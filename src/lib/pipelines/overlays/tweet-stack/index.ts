import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { type TweetStackContent } from './tweet-stack-content';
import { tweetStackOverlayDefinition } from './definition';
export const tweetStackOverlayRenderer: OverlayRenderer<TweetStackContent> = {
	...tweetStackOverlayDefinition,
	CanvasSource,
	Editor
};
