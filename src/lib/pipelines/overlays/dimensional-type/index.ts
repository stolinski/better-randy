import type { OverlayRenderer } from '$lib/platform/pipelines/types';

import { dimensionalTypeStageBody } from './body';
import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import {
	dimensionalTypeOverlayDefinition,
	type DimensionalTypeContent as DimensionalTypeContentDefinition
} from './definition';

export type DimensionalTypeContent = DimensionalTypeContentDefinition;
export const dimensionalTypeOverlayRenderer: OverlayRenderer<DimensionalTypeContent> = {
	...dimensionalTypeOverlayDefinition,
	CanvasSource,
	Editor,
	stageBody: dimensionalTypeStageBody,
	stageBodyDeclared: true
};
