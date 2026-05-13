import type { AnimationManifest, AnimationTweenSpec } from '$lib/platform/animation-manager';
import { getEaseGsap, resolveMarkForIndex } from '$lib/platform/engine-schema';
import { engineState, getResearchPaperSurface } from '$lib/platform/engine-state.svelte';

export interface ResearchPaperAnimState {
	paperVisibility: number;
	markProgresses: number[];
}

export const researchPaperAnimState = $state<ResearchPaperAnimState>({
	paperVisibility: 0,
	markProgresses: []
});

function syncMarkProgressLength(targetLength: number): void {
	while (researchPaperAnimState.markProgresses.length < targetLength) {
		researchPaperAnimState.markProgresses.push(0);
	}

	while (researchPaperAnimState.markProgresses.length > targetLength) {
		researchPaperAnimState.markProgresses.pop();
	}
}

export function buildResearchPaperAnimationManifest(): AnimationManifest {
	const surface = getResearchPaperSurface();
	const parsedMarks = readResearchPaperMarks();

	syncMarkProgressLength(parsedMarks.length);

	const tweens: AnimationTweenSpec[] = [
		{
			key: 'paper-enter',
			start: surface.enter.start,
			duration: surface.enter.duration,
			ease: getEaseGsap(surface.enter.ease, 'enter'),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				researchPaperAnimState.paperVisibility = value;
			}
		},
		{
			key: 'paper-exit',
			start: surface.exit.start,
			duration: surface.exit.duration,
			ease: getEaseGsap(surface.exit.ease, 'exit'),
			from: 1,
			to: 0,
			onUpdate: (value) => {
				researchPaperAnimState.paperVisibility = value;
			}
		}
	];

	parsedMarks.forEach((mark, index) => {
		const resolved = resolveMarkForIndex(mark.style, index, engineState.marks);

		tweens.push({
			key: `mark-${index}`,
			start: resolved.start,
			duration: resolved.duration,
			ease: getEaseGsap(resolved.ease, 'enter'),
			onUpdate: (value) => {
				researchPaperAnimState.markProgresses[index] = value;
			}
		});
	});

	return { tweens };
}

export interface ParsedResearchPaperMark {
	style: import('$lib/annotations/annotation-marks').AnnotationMarkStyle;
	text: string;
}

export function readResearchPaperMarks(): ParsedResearchPaperMark[] {
	const surface = getResearchPaperSurface();
	const result: ParsedResearchPaperMark[] = [];

	for (const paragraph of surface.content.body) {
		for (const segment of paragraph.segments) {
			if (segment.markStyle) {
				result.push({ style: segment.markStyle, text: segment.text });
			}
		}
	}

	return result;
}
