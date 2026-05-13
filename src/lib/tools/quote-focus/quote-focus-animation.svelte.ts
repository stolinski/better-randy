import type { AnimationManifest, AnimationTweenSpec } from '$lib/platform/animation-manager';
import { ENGINE_EASES } from '$lib/platform/engine-schema';
import { getQuoteFocusSurface } from '$lib/platform/engine-state.svelte';

export interface QuoteFocusAnimState {
	focusProgress: number;
	markProgress: number;
}

export const quoteFocusAnimState = $state<QuoteFocusAnimState>({
	focusProgress: 0,
	markProgress: 0
});

export function buildQuoteFocusAnimationManifest(): AnimationManifest {
	const surface = getQuoteFocusSurface();

	const tweens: AnimationTweenSpec[] = [
		{
			key: 'focus',
			start: surface.focus.start,
			duration: surface.focus.duration,
			ease: ENGINE_EASES[surface.focus.ease].gsap,
			onUpdate: (value) => {
				quoteFocusAnimState.focusProgress = value;
			}
		},
		{
			key: 'mark',
			start: surface.mark.start,
			duration: surface.mark.duration,
			ease: ENGINE_EASES[surface.mark.ease].gsap,
			onUpdate: (value) => {
				quoteFocusAnimState.markProgress = value;
			}
		}
	];

	return { tweens };
}
