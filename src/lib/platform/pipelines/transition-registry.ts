import type { TransitionEffectRenderer } from './types';

import { maskWipeTransitionEffectRenderer } from '$lib/pipelines/effects/mask-wipe';
import { particleDissolveTransitionEffectRenderer } from '$lib/pipelines/effects/particle-dissolve';
import { seededShatterTransitionEffectRenderer } from '$lib/pipelines/effects/seeded-shatter';
import { sheetPeelTransitionEffectRenderer } from '$lib/pipelines/effects/sheet-peel';

export const TRANSITION_EFFECT_REGISTRY = {
	maskWipe: maskWipeTransitionEffectRenderer,
	particleDissolve: particleDissolveTransitionEffectRenderer,
	sheetPeel: sheetPeelTransitionEffectRenderer,
	seededShatter: seededShatterTransitionEffectRenderer
};

const renderers = Object.values(TRANSITION_EFFECT_REGISTRY) as TransitionEffectRenderer<unknown>[];

export function getTransitionEffectRenderer(type: string): TransitionEffectRenderer<unknown> | null {
	return renderers.find((renderer) => renderer.type === type) ?? null;
}

export function isTransitionEffectType(type: string): boolean {
	return getTransitionEffectRenderer(type) !== null;
}

export function transitionEffectRenderers(): readonly TransitionEffectRenderer<unknown>[] {
	return renderers;
}

export function transitionEffectTypes(): readonly string[] {
	return renderers.map((renderer) => renderer.type);
}
