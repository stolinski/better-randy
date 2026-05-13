import type { AnimationManifest, AnimationTweenSpec } from '$lib/platform/animation-manager';

import {
	getResearchPaperEaseGsap,
	researchPaperState
} from './research-paper-state.svelte';

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
	const animation = researchPaperState.animation;
	const paper = animation.paper;

	syncMarkProgressLength(animation.marks.length);

	const tweens: AnimationTweenSpec[] = [
		{
			key: 'paper-enter',
			start: paper.enter.start,
			duration: paper.enter.duration,
			ease: getResearchPaperEaseGsap(paper.enter.ease, 'enter'),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				researchPaperAnimState.paperVisibility = value;
			}
		},
		{
			key: 'paper-exit',
			start: paper.exit.start,
			duration: paper.exit.duration,
			ease: getResearchPaperEaseGsap(paper.exit.ease, 'exit'),
			from: 1,
			to: 0,
			onUpdate: (value) => {
				researchPaperAnimState.paperVisibility = value;
			}
		}
	];

	animation.marks.forEach((mark, index) => {
		tweens.push({
			key: `mark-${index}`,
			start: mark.start,
			duration: mark.duration,
			ease: getResearchPaperEaseGsap(mark.ease, 'enter'),
			onUpdate: (value) => {
				researchPaperAnimState.markProgresses[index] = value;
			}
		});
	});

	return { tweens };
}
