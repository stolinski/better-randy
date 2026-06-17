/**
 * Transition-Effect name registry (ADR-0022).
 *
 * Transition Effects are a DISTINCT lane from the per-Layer / post-process
 * Effects in `EffectChainSchema`: their fragment shader takes two colour + two
 * depth input textures and a local wipe `progress` (0 = `from`, 1 = `to`),
 * rather than a single colour target. The engine refuses to wire a transition
 * Effect as an ordinary post-process Effect, and vice versa.
 *
 * This module holds only the set of registered transition-Effect TYPE names —
 * the minimal surface the Preset validator (`preset.ts`) needs to check that a
 * `transition.effect` resolves to a real transition Effect and that no ordinary
 * `effects[]` entry uses a transition-only type. The runtime binding lane (the
 * two-target-pair input plumbing) lands with the dual-tree render scheduler in
 * the same epic; transition Effect Pipelines register their type here as they
 * ship. The set is legitimately empty until `mask-wipe` is the first to register
 * — until then, no Preset can declare a `transition`.
 */

const registry = new Set<string>();

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
