import type { z } from 'zod';

import type { AnnotationBodyBlockType } from '$lib/annotations/annotation-marks';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import type { OverlayPosition, SurfaceState, Transition } from '$lib/platform/engine-schema';
import type { PackManifest } from '$lib/platform/packs/types';
import type { EdgeTreatment } from '$lib/platform/packs/resolve';
import type {
	AnnotationKind,
	OverlayDefaults,
	RendererReadableTextContext,
	RendererReadableTextContract,
	SurfaceControlsMetadata
} from './types';

export interface SurfacePipelineDefinition {
	type: string;
	label: string;
	controls: SurfaceControlsMetadata;
	variantIds?: readonly string[];
	defaults(): SurfaceState;
	edgeTreatment?: boolean;
	intrinsicEdgeTreatment?: EdgeTreatment;
	substrateColors?: { paperHex: string; inkHex: string };
	disablePackMaterial?: boolean;
	/**
	 * The CanvasSource renders `content.title` through the bracket-tag mark
	 * parser as `data-annotation-mark` spans, so a headline can carry a
	 * highlighter. `listSurfaceMarkInstances` then enumerates the title's marks
	 * BEFORE the body's (document order) and `marks.timings[]` indexes them the
	 * same way. Absent: the title prints plain and mark syntax in it is a lint
	 * error (rubric A3).
	 */
	titleMarks?: boolean;
}

export interface PipelineSchemaDefinition {
	safeParse(
		value: unknown
	): { success: true; data: unknown } | { success: false; error: z.ZodError };
}

export interface BlockPipelineDefinition<TType extends string = string> {
	type: TType;
	schema?: PipelineSchemaDefinition;
}

export interface AnnotationPipelineDefinition {
	style: AnnotationMarkStyle;
	kind: AnnotationKind;
	appliesTo: readonly (AnnotationBodyBlockType | 'block')[];
}

export interface OverlayPipelineDefinition<TContent = unknown> {
	type: string;
	label: string;
	schema: PipelineSchemaDefinition;
	defaults(): OverlayDefaults<TContent>;
	readableText?: (
		content: TContent,
		context: RendererReadableTextContext
	) => readonly RendererReadableTextContract[];
	fieldInkOnBackground?: boolean;
	disableEntryOffset?: boolean;
	disableOpacityTransition?: boolean;
	edgeTransition?: 'right';
}

export interface EffectPipelineDefinition<TParams = unknown> {
	type: string;
	label: string;
	schema: PipelineSchemaDefinition;
	defaults(): { params: TParams };
	isPackInert?(pack: PackManifest): boolean;
}

export interface TransitionEffectDefinition<TParams = unknown> {
	type: string;
	label: string;
	paramsSchema: PipelineSchemaDefinition;
	defaults(): { params: TParams };
}

export interface OverlayDefinitionDefaults<TContent = unknown> {
	content: TContent;
	position: OverlayPosition;
	enter?: Transition;
	exit?: Transition;
}
