import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

import {
	lowerThirdOverlayDefinition,
	type LowerThirdContent as LowerThirdContentDefinition
} from './definition';

export type LowerThirdContent = LowerThirdContentDefinition;
export const lowerThirdOverlayRenderer: OverlayRenderer<LowerThirdContent> = {
	...lowerThirdOverlayDefinition,
	CanvasSource,
	Editor
};
