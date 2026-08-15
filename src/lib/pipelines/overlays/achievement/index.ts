import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import { type AchievementContent } from './achievement-content';
import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { achievementOverlayDefinition } from './definition';
export const achievementOverlayRenderer: OverlayRenderer<AchievementContent> = {
	...achievementOverlayDefinition,
	CanvasSource,
	Editor
};
