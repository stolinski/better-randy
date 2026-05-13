import type { AnnotationMarkStyle } from '$lib/annotations/annotation-marks';

import {
	createDefaultEngineState,
	createMarkTiming,
	isQuoteFocusSurface,
	isResearchPaperSurface,
	type EngineState,
	type MarkAppearance,
	type MarkTiming,
	type QuoteFocusSurface,
	type ResearchPaperSurface
} from './engine-schema';

export const engineState = $state<EngineState>(createDefaultEngineState());

export function getResearchPaperSurface(): ResearchPaperSurface {
	if (!isResearchPaperSurface(engineState.surface)) {
		throw new Error(
			`Active surface is "${engineState.surface.type}"; expected "research-paper".`
		);
	}

	return engineState.surface;
}

export function getQuoteFocusSurface(): QuoteFocusSurface {
	if (!isQuoteFocusSurface(engineState.surface)) {
		throw new Error(`Active surface is "${engineState.surface.type}"; expected "quote-focus".`);
	}

	return engineState.surface;
}

export function getQuoteFocusMarkAppearance(): MarkAppearance {
	const surface = getQuoteFocusSurface();

	if (surface.mark.style === 'circle') {
		return engineState.marks.defaults.circle;
	}

	return engineState.marks.defaults.underline;
}

export function ensureMarkTimingAtIndex(index: number): MarkTiming {
	while (engineState.marks.timings.length <= index) {
		engineState.marks.timings.push(createMarkTiming());
	}

	return engineState.marks.timings[index];
}

export const EDITOR_MARK_COLORS = {
	get highlight() {
		return engineState.marks.defaults.highlight.color;
	},
	get underline() {
		return engineState.marks.defaults.underline.color;
	},
	get strike() {
		return engineState.marks.defaults.strike.color;
	},
	get circle() {
		return engineState.marks.defaults.circle.color;
	}
} satisfies Record<AnnotationMarkStyle, string>;
