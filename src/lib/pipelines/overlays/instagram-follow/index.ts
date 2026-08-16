import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	instagramFollowOverlayDefinition,
	type InstagramFollowContent as InstagramFollowContentDefinition
} from './definition';

export type InstagramFollowContent = InstagramFollowContentDefinition;
export const instagramFollowOverlayRenderer: OverlayRenderer<InstagramFollowContent> = {
	...instagramFollowOverlayDefinition,
	CanvasSource,
	Editor
};
