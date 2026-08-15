import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

import {
	counterOverlayDefinition,
	type CounterContent as CounterContentDefinition
} from './definition';

export type CounterContent = CounterContentDefinition;
export const counterOverlayRenderer: OverlayRenderer<CounterContent> = {
	...counterOverlayDefinition,
	CanvasSource,
	Editor
};
