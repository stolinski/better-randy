import type { EngineState, Preset } from '$lib/platform/engine-schema';

interface ResolvedPresetTransition {
	from: Preset;
	to: Preset;
}

export function isEngineStateOpaque(state: Pick<EngineState, 'backgroundFill' | 'stage'>): boolean {
	return state.backgroundFill !== undefined || state.stage?.type === 'depth';
}

export function isPresetOpaque(preset: Preset): boolean {
	return isEngineStateOpaque(preset.state);
}

export function isTransitionOpaque(transition: ResolvedPresetTransition): boolean {
	return isPresetOpaque(transition.from) && isPresetOpaque(transition.to);
}
