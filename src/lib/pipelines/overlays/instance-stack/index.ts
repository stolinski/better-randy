import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

import {
	instanceStackOverlayDefinition,
	type InstanceStackContent as InstanceStackContentDefinition
} from './definition';

export type InstanceStackContent = InstanceStackContentDefinition;
export const instanceStackOverlayRenderer: OverlayRenderer<InstanceStackContent> = {
	...instanceStackOverlayDefinition,
	CanvasSource,
	Editor
};
