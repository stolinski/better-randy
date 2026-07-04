import type { PackManifest } from '$lib/platform/packs/types';

/**
 * Minimal second Pack — its job is to *prove the appearance abstraction*: the
 * same Preset, rendered under a different Pack, re-skins (ADR-0023). It
 * supplies the six mandatory core Roles (fill/ink/accent/edge/depth/light —
 * the ADR-0024 fallback floor, enforced for EVERY registered Pack by
 * `validatePackCoreVocabulary` at engine boot) and overrides per-Pipeline
 * Roles only where it wants divergence; everything else falls back
 * specific → core through `resolveAppearanceVars`. It grows as pipelines are
 * wired during the pack-wiring rollout. (It is still not the
 * completeness-reference Pack — the full viaPack-resolution gate remains
 * reference-pack-only — but the core vocabulary is mandatory here too.)
 */
export const editorialMonoPack: PackManifest = {
	slug: 'editorial-mono',
	label: 'Editorial Mono',
	description:
		'A cool editorial dress — proves the same composition re-skins under a different Pack.',
	roles: {
		// ---------------------------------------------------------------
		// Mandatory core vocabulary (ADR-0024 fallback floor).
		// Cool-neutral taste decisions per docs/packs/editorial-mono/aesthetic.md:
		// the press-review paper and near-black cool ink the newspaper re-skin
		// already renders, cyan as the single punctuation accent, clean printed
		// edges, and the defining structural inversion — no collage shadow, no
		// staged key light. The flat card is the point.
		// ---------------------------------------------------------------
		'fill-treatment': { kind: 'style', value: '#e9eef3' },
		'ink-treatment': { kind: 'style', value: '#0f151c' },
		'accent-treatment': { kind: 'style', value: '#22d3ee' },
		'edge-treatment': { kind: 'style', value: 'clean' },
		'depth-treatment': { kind: 'style', value: 'none' },
		'light-treatment': { kind: 'style', value: 'none' },

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
		// Structural edge re-skin: a clean die-cut clipping (server-renders-again
		// claims "clean printed clipping") where syntax tears — the same Preset's
		// silhouette changes character with the Pack (resolveEdgeTreatment).
		'newspaper.edge': { kind: 'style', value: 'clean' },
		'type-hero.ink': { kind: 'style', value: '#eef3f8' },
		'type-hero.accent': { kind: 'style', value: '#22d3ee' },
		'type-hero.byline': { kind: 'style', value: '#8aa0b4' },
		// Skipped-color re-skins — prove the rgb-channel + grain Roles reach
		// pixels: a cool trail fade (vs syntax's warm) and a cool-cast tape grain.
		'cursor-trail.trailMaterial': { kind: 'style', value: { color: '#bfe4ff', softness: 0.5 } },
		'washi-tape.grain-dark': { kind: 'style', value: 'rgba(8, 24, 40, 0.1)' },
		'washi-tape.grain-light': { kind: 'style', value: 'rgba(220, 240, 255, 0.07)' },
		// Diagram Blocks (ADR-0036): the clean printed rule where syntax hand-
		// wobbles — same authored route, a different pen (the stroke re-skin the
		// ADR names as the reason stroke can't live in the primitive).
		'diagram.stroke': { kind: 'style', value: { color: 'ink', widthPx: 6, wobble: 0 } },
		'diagram.arrowhead': { kind: 'style', value: 'open-chevron' },
		'node.fill': { kind: 'style', value: '#e9eef3' },
		'node.accent': { kind: 'style', value: '#22d3ee' },
		'node.depth': { kind: 'style', value: 'none' },
		'stat-callout.accent': { kind: 'style', value: '#22d3ee' }
	}
};
