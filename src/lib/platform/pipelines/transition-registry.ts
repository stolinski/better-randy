/**
 * Transition-Effect name registry (ADR-0022).
 *
 * Transition Effects are a distinct lane from composition-owned and ordinary
 * post-process Effects: their fragment shader takes two cached snapshot colour
 * textures and a local wipe `progress` (0 = `from`, 1 = `to`) rather than a
 * single colour target. The engine refuses to wire a transition Effect as an
 * `effects[]` entry, and vice versa.
 *
 * This module holds only the set of registered transition-Effect TYPE names —
 * the minimal surface the Preset validator (`preset.ts`) needs to check that a
 * `transition.effect` resolves to a real transition Effect and that no ordinary
 * `effects[]` entry uses a transition-only type. The shipped runtime binds the
 * two settled endpoint snapshots in `transition-pass.ts`; transition Effect
 * Pipelines register their type here as they ship.
 */

const registry = new Set<string>();

/** The first transition Effect — a left-to-right per-pixel wipe (ADR-0026).
 *  Implemented by `compileTransitionWipe` in `transition-pass.ts`. */
export const MASK_WIPE_EFFECT = 'mask-wipe';

/** Register a transition-Effect type name. Called by each transition Effect
 *  Pipeline's module at registration time (alongside its runtime binding). */
export function registerTransitionEffect(type: string): void {
	registry.add(type);
}

/** True when `type` names a registered transition Effect. */
export function isTransitionEffectType(type: string): boolean {
	return registry.has(type);
}

/** Snapshot of the registered transition-Effect type names (for diagnostics). */
export function transitionEffectTypes(): readonly string[] {
	return [...registry];
}

// Register the shipped transition Effects. Kept here (not in transition-pass.ts)
// so the Preset validator can check `transition.effect` without importing the
// GPU/TypeGPU pass implementation.
registerTransitionEffect(MASK_WIPE_EFFECT);
