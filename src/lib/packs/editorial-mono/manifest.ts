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
		// Overlay (proven 2026-05-29)
		'lower-third.accent': { kind: 'style', value: '#22d3ee' },
		// Surface overrides — a cool editorial dress proving Surfaces re-skin
		// under a second Pack (same Presets, different pixels). Only the Roles
		// it wants to change; everything else falls back to the CanvasSource
		// defaults via resolveAppearanceVars (ADR-0024).
		'chapter-card.ink': { kind: 'style', value: '#eef3f8' },
		'chapter-card.base': { kind: 'style', value: '#c4d0dc' },
		'chapter-card.kicker': { kind: 'style', value: '#22d3ee' },
		'chapter-card.rule': { kind: 'style', value: 'rgba(34, 211, 238, 0.55)' },
		'newspaper.fill': { kind: 'style', value: '#e9eef3' },
		'newspaper.ink': { kind: 'style', value: '#0f151c' },
		'newspaper.accent': { kind: 'style', value: '#22d3ee' },
		'newspaper.kicker-ink': { kind: 'style', value: '#0f151c' },
		// Structural re-skin: this cool editorial dress drops the zine hard-offset
		// shadow entirely — the card sits flat, carried only by the newspaper
		// substrate's intrinsic edge-occlusion. Proves a structural depth Role
		// reaches pixels (syntax: 12px offset chrome → editorial-mono: none).
		'newspaper.depth': { kind: 'style', value: 'none' },
		'type-hero.ink': { kind: 'style', value: '#eef3f8' },
		'type-hero.accent': { kind: 'style', value: '#22d3ee' },
		'type-hero.byline': { kind: 'style', value: '#8aa0b4' },
		// Skipped-color re-skins — prove the rgb-channel + grain Roles reach
		// pixels: a cool trail fade (vs syntax's warm) and a cool-cast tape grain.
		'cursor-trail.trailMaterial': { kind: 'style', value: { color: '#bfe4ff', softness: 0.5 } },
		'washi-tape.grain-dark': { kind: 'style', value: 'rgba(8, 24, 40, 0.1)' },
		'washi-tape.grain-light': { kind: 'style', value: 'rgba(220, 240, 255, 0.07)' }
	}
};
