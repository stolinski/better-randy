import { isDarkSurfaceColor } from '$lib/utils/color';
import { resolveDiagramPrimitiveForRender } from '$lib/utils/diagram-geometry';

import type { RenderAnimState } from './anim-state.svelte';
import {
	listMarkInstances,
	resolveMarkForIndex,
	type EngineState,
	type MarkInstance
} from './engine-schema';
import type { PackManifest } from './packs/types';
import { requireCoreColor, resolveDiagramStroke } from './packs/resolve';
import { resolveSurfaceTypographyColors } from './pipelines';
import type { SurfaceRenderInputs } from './pipelines/types';

export interface SurfaceTextAnimationAlphaReader {
	unitAlphaAt(slotKey: string, unitIndex: number): number;
	unitRangeFor(
		slotKey: string,
		startChar: number,
		endChar: number
	): { from: number; to: number } | null;
}

export interface SurfaceRenderInputsBuilderRequest {
	readAnimState(): RenderAnimState;
	readPack(): PackManifest;
	readState(): EngineState;
	readMarkColor(style: MarkInstance['style']): string;
	readTextAnimationAlpha(): SurfaceTextAnimationAlphaReader | null;
}

function markTimingIndex(state: EngineState, mark: MarkInstance, index: number): number {
	return mark.window === undefined ? index : state.marks.timings.length;
}

function buildTextAnimationAlphaByMarkIndex(
	state: EngineState,
	marks: readonly MarkInstance[],
	reader: SurfaceTextAnimationAlphaReader | null
): number[] | undefined {
	if (!reader) return undefined;
	const hasBodyEntry = state.textAnimations.some(
		(entry) => entry.target.kind === 'surface' && entry.target.slot === 'body'
	);
	if (!hasBodyEntry) return undefined;

	const slotKey = 'surface:body';
	const result = new Array<number>(marks.length).fill(1);
	for (let index = 0; index < marks.length; index += 1) {
		const mark = marks[index];
		const range = reader.unitRangeFor(slotKey, mark.startChar, mark.endChar);
		if (!range) continue;
		for (let unitIndex = range.from; unitIndex <= range.to; unitIndex += 1) {
			result[index] = Math.min(result[index], reader.unitAlphaAt(slotKey, unitIndex));
		}
	}
	return result;
}

function buildDiagramInputs(
	state: EngineState,
	animState: RenderAnimState,
	pack: PackManifest
): SurfaceRenderInputs['diagram'] {
	const authoredPrimitives = state.surface.diagram;
	if (!authoredPrimitives || authoredPrimitives.length === 0) return undefined;

	const primitives = authoredPrimitives.map((primitive) =>
		resolveDiagramPrimitiveForRender(primitive, state.transport.orientation)
	);
	const drawProgressById: Record<string, number> = {};
	const alphaById: Record<string, number> = {};
	for (const primitive of primitives) {
		const channels = animState.blockChannels[primitive.id];
		if (channels) {
			drawProgressById[primitive.id] = 1;
			alphaById[primitive.id] = channels.opacity;
		} else {
			drawProgressById[primitive.id] = animState.blockProgresses[primitive.id] ?? 0;
			alphaById[primitive.id] = animState.blockAlphas[primitive.id] ?? 1;
		}
	}

	// Surface-aware (ADR-0039 §2): the 'ink' stroke sentinel rides the same
	// channel the surface's body text prints — intrinsic on an immune document.
	const typography = resolveSurfaceTypographyColors(pack, state.surface.type, state.typography);
	const stroke = resolveDiagramStroke(pack);
	return {
		primitives,
		drawProgressById,
		alphaById,
		stroke: stroke.color === 'ink' ? { ...stroke, color: typography.inkColor } : stroke,
		accentColor: requireCoreColor(pack, 'accent-treatment')
	};
}

/** Builds the complete imperative Surface input snapshot from live state at one timestamp. */
export function buildSurfaceRenderInputs(
	request: SurfaceRenderInputsBuilderRequest,
	timestamp: number
): SurfaceRenderInputs {
	const state = request.readState();
	const animState = request.readAnimState();
	const pack = request.readPack();
	const marks = listMarkInstances(state.surface.content);
	const transportDurationMs = state.transport.durationSeconds * 1000;
	const resolvedMarks = marks.map((mark, index) =>
		resolveMarkForIndex(
			mark.style,
			markTimingIndex(state, mark, index),
			state.marks,
			request.readMarkColor(mark.style)
		)
	);

	return {
		animState: { markProgresses: animState.markProgresses },
		backgroundVisibility: state.surface.backgroundVisibility ?? 0,
		highlightDarkSurface: isDarkSurfaceColor(
			resolveSurfaceTypographyColors(pack, state.surface.type, state.typography).paperColor
		),
		markColorsByIndex: resolvedMarks.map((mark) => mark.color),
		markDurationMsByIndex: marks.map((mark, index) => {
			if (mark.window === 'static') return 1;
			if (mark.window !== undefined) return mark.window.duration * transportDurationMs;
			return resolvedMarks[index].duration * transportDurationMs;
		}),
		markIntensityByIndex: resolvedMarks.map((mark) => mark.intensity),
		textAnimAlphaByMarkIndex: buildTextAnimationAlphaByMarkIndex(
			state,
			marks,
			request.readTextAnimationAlpha()
		),
		markAlpha:
			state.surface.type === 'checklist'
				? Math.max(0, Math.min(1, animState.paperVisibility))
				: undefined,
		timestamp,
		diagram: buildDiagramInputs(state, animState, pack)
	};
}
