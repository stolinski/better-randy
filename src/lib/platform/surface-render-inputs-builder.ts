import { resolveChartBarColumnGeometry } from '$lib/utils/chart-bar-column-geometry';
import { resolveChartFrameLayout } from '$lib/utils/chart-layout';
import { resolveChartNormalizedGeometry } from '$lib/utils/chart-normalized-geometry';
import { chartRenderTextMeasurer } from '$lib/utils/chart-text-measurement';
import { resolveVisibleChartBlock } from '$lib/utils/chart-visibility';
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
import {
	requireCoreColor,
	resolveChartMarkFillTreatment,
	resolveDiagramStroke,
	resolveFieldInkColor
} from './packs/resolve';
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
	const surfaceInk = resolveSurfaceTypographyColors(
		pack,
		state.surface.type,
		state.typography
	).inkColor;
	const diagramInk =
		state.surface.type === 'plain' && state.backgroundFill !== undefined
			? resolveFieldInkColor(pack, state.typography.inkColor)
			: surfaceInk;
	const stroke = resolveDiagramStroke(pack);
	return {
		primitives,
		drawProgressById,
		alphaById,
		stroke: stroke.color === 'ink' ? { ...stroke, color: diagramInk } : stroke,
		accentColor: requireCoreColor(pack, 'accent-treatment')
	};
}

function buildChartInputs(
	state: EngineState,
	pack: PackManifest,
	timestamp: number
): SurfaceRenderInputs['chart'] {
	const progress = timestamp / state.transport.durationSeconds;
	const block = resolveVisibleChartBlock(state.surface.chart, progress);
	if (!block) return undefined;
	const layout = resolveChartFrameLayout({
		block,
		orientation: state.transport.orientation,
		measureText: chartRenderTextMeasurer
	});
	const geometry =
		block.type === 'bar-chart' || block.type === 'column-chart'
			? resolveChartBarColumnGeometry({
					block,
					layout,
					orientation: state.transport.orientation,
					measureText: chartRenderTextMeasurer
				})
			: resolveChartNormalizedGeometry({
					block,
					layout,
					orientation: state.transport.orientation,
					measureText: chartRenderTextMeasurer
				});
	if (layout.overflow.length > 0 || geometry.overflow.length > 0) return undefined;
	const voiceCount =
		block.type === 'bar-chart' || block.type === 'column-chart'
			? block.data.series.length
			: block.data.categories.length;
	const insideLabelByMarkId = new Map(
		geometry.valueLabels
			.filter((label) => label.anchor === 'inside')
			.map((label) => [label.markId, label] as const)
	);
	return {
		block,
		marks: geometry.marks.map((mark) => {
			const label = insideLabelByMarkId.get(mark.id);
			return {
				bounds: mark.bounds,
				cornerRadius: mark.cornerRadius,
				fillVoiceIndex: mark.fillVoiceIndex,
				isHighlighted: mark.isHighlighted,
				labelPlateBounds: label
					? {
							x: label.origin.x - 10,
							y: label.origin.y - 6,
							width: label.measurement.width + 20,
							height: label.measurement.height + 12
						}
					: null
			};
		}),
		swatches: geometry.legendSwatches.map((swatch) => ({
			bounds: swatch.bounds,
			cornerRadius: swatch.cornerRadius,
			fillVoiceIndex: swatch.fillVoiceIndex
		})),
		baseFillByVoice: Array.from({ length: voiceCount }, (_, fillVoiceIndex) =>
			resolveChartMarkFillTreatment(pack, block.fill.role, fillVoiceIndex)
		),
		emphasisFillByVoice: Array.from({ length: voiceCount }, (_, fillVoiceIndex) =>
			resolveChartMarkFillTreatment(pack, 'emphasis', fillVoiceIndex)
		),
		// Choreography owns phase alpha later; this renderer task ships the terminal factual state.
		alpha: 1
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
		diagram: buildDiagramInputs(state, animState, pack),
		chart: buildChartInputs(state, pack, timestamp)
	};
}
