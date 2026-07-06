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
		// Name + role lines go cool (syntax's #fff8ec / #d8c4a0 are warm): cool
		// off-white name, muted mono-label role ink.
		'lower-third.ink': { kind: 'style', value: '#eef3f8' },
		'lower-third.roleInk': { kind: 'style', value: '#8aa0b4' },
		// Plate chrome goes cool with the rest of the dress: a graphite-slate
		// standard plate (vs syntax's neutral near-black) and a cool near-black
		// scrim base for the cinematic gradient (matches the Pack's dark-piece
		// backdrops, e.g. pullquote's #080b10 top stop).
		'lower-third.plate': { kind: 'style', value: 'rgba(13, 18, 24, 0.92)' },
		'lower-third.scrim': { kind: 'style', value: { color: '#080b10' } },
		// FORM dress (ADR-0023 appearance): editorial restraint reads through
		// SPACE, not a box — no border, generous padding, and tight typographic
		// tracking (vs the CRT terminal's wide status-line tracking). Same
		// layout, a distinctly quieter, more art-directed object.
		'lower-third.pad': { kind: 'style', value: 'calc(2.6 * var(--cqmin)) calc(3.6 * var(--cqmin))' },
		'lower-third.tracking': { kind: 'style', value: '0.12em' },
		'lower-third.weight': { kind: 'style', value: '600' },
		// The watermark sits on its dark plate, so its handle can't ride the
		// Pack's near-black core ink — cool off-white, matching the Pack's other
		// dark-piece inks.
		'watermark.ink': { kind: 'style', value: '#eef3f8' },
		// These overlays ride the Pack accent for their headline read (syntax
		// runs them at #fabf47). Without an override they fall to the near-black
		// core ink and vanish on a dark composition — so the cool cyan accent,
		// matching the rest of the editorial dress.
		'counter.ink': { kind: 'style', value: '#22d3ee' },
		'instance-stack.ink': { kind: 'style', value: '#22d3ee' },
		'text-3d.ink': { kind: 'style', value: '#22d3ee' },
		// Surface overrides — a cool editorial dress proving Surfaces re-skin
		// under a second Pack (same Presets, different pixels). Only the Roles
		// it wants to change; everything else falls back to the CanvasSource
		// defaults via resolveAppearanceVars (ADR-0024).
		'chapter-card.ink': { kind: 'style', value: '#eef3f8' },
		'chapter-card.base': { kind: 'style', value: '#c4d0dc' },
		'chapter-card.kicker': { kind: 'style', value: '#22d3ee' },
		'chapter-card.rule': { kind: 'style', value: 'rgba(34, 211, 238, 0.55)' },
		// WGSL backdrop — the opaque-piece re-skin (no warm leaks). Where syntax
		// stages a warm practical key over slate-to-charcoal, Editorial Mono is
		// north light in a graphite room: both gradient stops stay cool (the
		// floor deepens toward slate instead of warming), and the upper-right
		// key is a cool daylight wash — art-directed, never amber.
		'chapter-card.backdrop': {
			kind: 'style',
			value: { top: '#0d1319', bottom: '#121820', light: '#c2d2e0' }
		},
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
		// WGSL print physics: halftone ink and edge-occlusion shadow track the
		// Pack's cool near-black ink family (#0f151c) — press-review print, no
		// warm newsprint stock cast in the shadow.
		'newspaper.print': { kind: 'style', value: { ink: '#0a0d11', shadow: '#080b0e' } },
		// WGSL backdrop for the title drop: deep cinema black that deepens into
		// blue at the floor (syntax warms there), with the off-frame glow read
		// as cool north light instead of a tungsten key.
		'title-sequence.backdrop': {
			kind: 'style',
			value: { top: '#04060a', bottom: '#060910', glow: '#8fb2cc' }
		},
		// DOM-side title voices go cool with the backdrop: cool off-white title
		// ink (syntax's #fffaf0 is warm), cyan kicker punctuation (same slot
		// treatment as chapter-card.kicker) — no warm leak on the opaque piece.
		'title-sequence.ink': { kind: 'style', value: '#eef3f8' },
		'title-sequence.kicker': { kind: 'style', value: '#22d3ee' },
		// WGSL backdrop for the pullquote bumper: cool near-black gradient, a
		// cool paper-white directional light, and a cool entrance sweep — the
		// documentary shadow-play survives, the warmth doesn't.
		'pullquote-on-photo.backdrop': {
			kind: 'style',
			value: { top: '#080b10', bottom: '#0c0f14', light: '#b6c6d4', sweep: '#d2e0ec' }
		},
		// Quote ink must be claimed: without it the core ink-treatment fallback
		// (#0f151c) paints near-black type on the near-black backdrop. Cool
		// off-white, matching the Pack's other dark-piece inks.
		'pullquote-on-photo.ink': { kind: 'style', value: '#eef3f8' },
		// Byline rides the muted mono-label ink (aesthetic.md § Palette) instead
		// of syntax's warm off-white.
		'pullquote-on-photo.byline': { kind: 'style', value: '#8aa0b4' },
		'type-hero.ink': { kind: 'style', value: '#eef3f8' },
		'type-hero.accent': { kind: 'style', value: '#22d3ee' },
		'type-hero.byline': { kind: 'style', value: '#8aa0b4' },
		// WGSL backdrop for the hero field: syntax's warm/cool band pair becomes
		// a two-value SLATE pair (soft slate passing a deeper blue slate — the
		// parallax drift reads as tone, not temperature) and the drifting motes
		// go cool paper-white. Near-monochrome cool, one accent stays the type's.
		'type-hero.backdrop': {
			kind: 'style',
			value: {
				top: '#050609',
				bottom: '#070a0e',
				warmBand: '#5c7186',
				coolBand: '#31485e',
				particle: '#c6d4e0'
			}
		},
		// WGSL rim glow on the cinematic lower-third: the implied off-frame key
		// is cool documentary daylight, not the syntax tungsten rim.
		'lower-third.flare': { kind: 'style', value: { rim: '#aac6da' } },
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
		'stat-callout.accent': { kind: 'style', value: '#22d3ee' },

		// ---------------------------------------------------------------
		// FORM dress (ADR-0023 appearance) — editorial restraint reads through
		// SPACE and tight typography, never a box: no borders anywhere, tight
		// label tracking (vs the terminal's wide status tracking), and generous
		// padding on the card/chip surfaces. Type WEIGHT is deliberately left
		// intrinsic — de-weighting the big display heroes to book weight reads
		// anemic; restraint here is the tight tracking, not a lighter cut.
		// (`lower-third.*` form roles live in the Overlays block above.)
		// ---------------------------------------------------------------
		'chapter-card.tracking': { kind: 'style', value: '0.12em' },
		'newspaper.tracking': { kind: 'style', value: '0.12em' },
		'title-sequence.tracking': { kind: 'style', value: '0.12em' },
		'type-hero.tracking': { kind: 'style', value: '0.12em' },
		'pullquote-on-photo.tracking': { kind: 'style', value: '0.12em' },
		'watermark.pad': {
			kind: 'style',
			value: 'calc(2.4 * var(--cqmin)) calc(3 * var(--cqmin)) calc(2.4 * var(--cqmin)) calc(2.7 * var(--cqmin))'
		},
		'watermark.tracking': { kind: 'style', value: '0.12em' }
	}
};
