import type { AnimationManifest, AnimationTweenSpec } from '$lib/platform/animation-manager';

import { QUOTE_FOCUS_EASES, quoteFocusState } from './quote-focus-state.svelte';

export interface QuoteFocusAnimState {
	focusProgress: number;
	markProgress: number;
}

export const quoteFocusAnimState = $state<QuoteFocusAnimState>({
	focusProgress: 0,
	markProgress: 0
});

export function buildQuoteFocusAnimationManifest(): AnimationManifest {
	const animation = quoteFocusState.animation;

	const tweens: AnimationTweenSpec[] = [
		{
			key: 'focus',
			start: animation.focusStart,
			duration: animation.focusDuration,
			ease: QUOTE_FOCUS_EASES[animation.focusEase].gsap,
			onUpdate: (value) => {
				quoteFocusAnimState.focusProgress = value;
			}
		},
		{
			key: 'mark',
			start: animation.markStart,
			duration: animation.markDuration,
			ease: QUOTE_FOCUS_EASES[animation.markEase].gsap,
			onUpdate: (value) => {
				quoteFocusAnimState.markProgress = value;
			}
		}
	];

	return { tweens };
}
