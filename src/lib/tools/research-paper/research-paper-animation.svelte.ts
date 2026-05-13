import type { AnimationManifest, AnimationTweenSpec } from '$lib/platform/animation-manager';

import {
	RESEARCH_PAPER_EASES,
	researchPaperState
} from './research-paper-state.svelte';

export interface ResearchPaperAnimState {
	paperEntrance: number;
	markProgresses: number[];
}

export const researchPaperAnimState = $state<ResearchPaperAnimState>({
	paperEntrance: 0,
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

	syncMarkProgressLength(animation.marks.length);

	const tweens: AnimationTweenSpec[] = [
		{
			key: 'paper',
			start: 0,
			duration: animation.paperEntranceDuration,
			ease: RESEARCH_PAPER_EASES[animation.paperEntranceEase].gsap,
			onUpdate: (value) => {
				researchPaperAnimState.paperEntrance = value;
			}
		}
	];

	animation.marks.forEach((mark, index) => {
		tweens.push({
			key: `mark-${index}`,
			start: mark.start,
			duration: mark.duration,
			ease: RESEARCH_PAPER_EASES[mark.ease].gsap,
			onUpdate: (value) => {
				researchPaperAnimState.markProgresses[index] = value;
			}
		});
	});

	return { tweens };
}
