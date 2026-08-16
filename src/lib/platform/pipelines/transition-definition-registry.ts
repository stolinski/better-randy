import { maskWipeTransitionEffectDefinition } from '$lib/pipelines/effects/mask-wipe/definition';
import { particleDissolveTransitionEffectDefinition } from '$lib/pipelines/effects/particle-dissolve/definition';
import { seededShatterTransitionEffectDefinition } from '$lib/pipelines/effects/seeded-shatter/definition';
import { sheetPeelTransitionEffectDefinition } from '$lib/pipelines/effects/sheet-peel/definition';
import type { TransitionEffectDefinition } from './definition-types';

export const TRANSITION_EFFECT_DEFINITION_REGISTRY = {
	maskWipe: maskWipeTransitionEffectDefinition,
	particleDissolve: particleDissolveTransitionEffectDefinition,
	sheetPeel: sheetPeelTransitionEffectDefinition,
	seededShatter: seededShatterTransitionEffectDefinition
} satisfies Record<string, TransitionEffectDefinition>;

export function getTransitionEffectDefinition(type: string): TransitionEffectDefinition | null {
	return (
		Object.values(TRANSITION_EFFECT_DEFINITION_REGISTRY).find(
			(definition) => definition.type === type
		) ?? null
	);
}

export function isTransitionEffectType(type: string): boolean {
	return getTransitionEffectDefinition(type) !== null;
}

export function transitionEffectDefinitions(): readonly TransitionEffectDefinition[] {
	return Object.values(TRANSITION_EFFECT_DEFINITION_REGISTRY);
}

export function transitionEffectTypes(): readonly string[] {
	return transitionEffectDefinitions().map((definition) => definition.type);
}
