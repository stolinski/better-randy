import type { PackManifest } from '$lib/platform/packs/types';

/**
 * Minimal second Pack — its job is to *prove the appearance abstraction*: the
 * same Preset, rendered under a different Pack, re-skins (ADR-0023). It
 * overrides only what it needs; unresolved Roles fall back gracefully through
 * `resolveAppearanceVars` to the CanvasSource's `var(--x, <default>)` (ADR-0024),
 * so it doesn't need to enumerate every Role. It grows as pipelines are wired
 * during the pack-wiring rollout. (Not the engine-boot Pack, so it isn't held
 * to the full viaPack-resolution validator — that gates the boot Pack only.)
 */
export const editorialMonoPack: PackManifest = {
	slug: 'editorial-mono',
	label: 'Editorial Mono',
	description:
		'A cool editorial dress — proves the same composition re-skins under a different Pack.',
	roles: {
		'lower-third.accent': { kind: 'style', value: '#22d3ee' }
	}
};
