/**
 * Syntax Pack manifest — per ADR-0014. Resolves every appearance Role
 * referenced by a registered Pipeline's Identity Spec `viaPack` clause (per
 * ADR-0019). Role keys follow the `<pipeline-type>.<role-id>` convention so
 * the engine's boot validator can pair a Pipeline's declared viaPack list
 * against the Pack's resolution.
 *
 * Per ADR-0023 a Pack is appearance only: colour, edge/depth/light treatment,
 * font, material, asset. Motion and frame-relationship are intrinsic to the
 * Pipeline and are NOT Roles here. Hex codes, font stacks, and structural
 * treatments that previously lived inline in the shipped Presets land here.
 * Adding a new Pack means copying this file, renaming the slug, and rewriting
 * every entry to a new channel's vocabulary — the Pipelines never change.
 */

import type { PackManifest } from '$lib/platform/packs/types';
import { syntaxFonts } from './fonts';

export const syntaxPack: PackManifest = {
	slug: 'syntax',
	label: 'Syntax',
	description:
		'Channel-specific aesthetic for the Syntax.fm coding podcast — torn-paper zine collage on photographic substrate, yellow-dominant palette, mono signature thread.',
	fonts: syntaxFonts,
	roles: {
		// ---------------------------------------------------------------
		// Core / channel-level Roles (Pack vocabulary, not Pipeline-scoped).
		// The six mandatory cores (fill/ink/accent/edge/depth/light) are the
		// ADR-0024 fallback floor every Pack must supply; the boot validator
		// (`validatePackCoreVocabulary`) refuses a Pack missing any of them.
		// ---------------------------------------------------------------
		// Colour cores ground in what syntax actually renders: the newspaper
		// clipping is the channel's dominant paper/ink read (render-is-truth —
		// `newspaper.fill` / `newspaper.ink` below carry the same values), and
		// the accent is the canonical channel yellow (aesthetic.md § Palette,
		// the highlighter/kicker yellow).
		'fill-treatment': { kind: 'style', value: '#f0e8d6' },
		'ink-treatment': { kind: 'style', value: '#1a1612' },
		'accent-treatment': { kind: 'style', value: '#fabf47' },
		// Core structural edge vocabulary (five values: clean/soft/irregular/
		// torn/none, resolved by resolveEdgeTreatment → the shared edge-treatment
		// ShaderPass). Syntax is the torn-collage channel — any opted-in card
		// silhouette that doesn't override tears by default (aesthetic.md
		// § Collage System / Cut behavior).
		'edge-treatment': {
			kind: 'style',
			value: { mode: 'torn', amplitudePx: 24, wavelengthPx: 140, fiber: 1 }
		},
		'depth-treatment': {
			kind: 'style',
			value: { hardOffset: { dx: 8, dy: 8, blur: 0, color: 'fg' } }
		},
		'light-treatment': {
			kind: 'style',
			value: { direction: 'upper-left', intensity: 0.45 }
		},

		// ---------------- plain Surface ----------------
		'plain.edge': { kind: 'style', value: 'sharp' },
		'plain.depth': { kind: 'style', value: { offset: { dx: 8, dy: 8, blur: 0 } } },
		'plain.light': { kind: 'style', value: 'none' },

		// ---------------- chapter-card Surface ----------------
		'chapter-card.edge': { kind: 'style', value: 'torn' },
		'chapter-card.depth': { kind: 'style', value: { hardOffset: { dx: 10, dy: 10, blur: 0 } } },
		'chapter-card.light': { kind: 'style', value: 'none' },
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		// Warm off-white (not pure #fff): agrees with the upper-right warm key and
		// keeps Q17 emphasis headroom — matches the preset's declared inkColor.
		'chapter-card.ink': { kind: 'style', value: '#f4ecdc' },
		'chapter-card.base': { kind: 'style', value: '#f4ecdc' },
		'chapter-card.kicker': { kind: 'style', value: '#d8c4a0' },
		'chapter-card.rule': { kind: 'style', value: 'rgba(216, 196, 160, 0.62)' },

		// ---------------- pullquote-on-photo Surface ----------------
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		'pullquote-on-photo.ink': { kind: 'style', value: '#ffffff' },
		'pullquote-on-photo.byline': { kind: 'style', value: '#f4ecdc' },

		// ---------------- newspaper Surface ----------------
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		'newspaper.fill': { kind: 'style', value: '#f0e8d6' },
		'newspaper.ink': { kind: 'style', value: '#1a1612' },
		'newspaper.accent': { kind: 'style', value: '#fabf47' },
		'newspaper.kicker-ink': { kind: 'style', value: '#1a1612' },
		// Structural edge — the clipping is TORN from the paper, never cropped
		// (aesthetic.md § Cut behavior: tear path ~3–8% of the card's smaller
		// dimension; 4K card height ≈ 1339 px → 40 px sits at the band floor,
		// ~4.3% at the fine octave's peak). The footer rule keeps its ink via the
		// CanvasSource fallback `var(--edge, #1a1612)` — same value this Role
		// carried when it was a bare colour.
		'newspaper.edge': {
			kind: 'style',
			value: { mode: 'torn', amplitudePx: 40, wavelengthPx: 150, fiber: 1 }
		},
		// Structural depth — the signature zine hard-offset shadow under the card
		// (aesthetic.md § Collage System / Hard offset shadow). `dx`/`dy` are
		// 4K-reference px; `color:'fg'` resolves to the card's ink so the shadow
		// tracks the Pack's foreground. The newspaper Identity Spec names this the
		// "Pack-side Syntax chrome" that coexists with the intrinsic occlusion.
		'newspaper.depth': {
			kind: 'style',
			value: { hardOffset: { dx: 12, dy: 12, blur: 0, color: 'fg' } }
		},

		// ---------------- title-sequence Surface ----------------
		'title-sequence.edge': { kind: 'style', value: 'none' },
		'title-sequence.depth': { kind: 'style', value: 'none' },
		'title-sequence.light': { kind: 'style', value: 'none' },
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		'title-sequence.ink': { kind: 'style', value: '#fffaf0' },
		'title-sequence.kicker': { kind: 'style', value: '#d8a87a' },

		// ---------------- type-hero Surface ----------------
		'type-hero.edge': { kind: 'style', value: 'clean-vector' },
		'type-hero.depth': { kind: 'style', value: 'none' },
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		'type-hero.text-base': { kind: 'style', value: '#fff8ec' },
		'type-hero.ink': { kind: 'style', value: '#fffaf2' },
		'type-hero.accent': { kind: 'style', value: '#f4a85e' },
		'type-hero.byline': { kind: 'style', value: '#d8c4a0' },

		// ---------------- paragraph Block ----------------
		// Glyph material claim (rides the optional `material-treatment` core
		// dimension — 'ink-bleed' is how the ink sits on the paper, not a
		// silhouette edge).
		'paragraph.material': { kind: 'style', value: 'ink-bleed' },

		// ---------------- Diagram Blocks (ADR-0036) ----------------
		// One pen for the whole diagram: the hand-drawn marker feel (Q6
		// deterministic imperfection — wobble 1) in the composition's ink (the
		// 'ink' sentinel resolves to typography.inkColor, so strokes flip with
		// the preset over footage). Arrowheads are solid marker triangles.
		'diagram.stroke': { kind: 'style', value: { color: 'ink', widthPx: 12, wobble: 1 } },
		'diagram.arrowhead': { kind: 'style', value: 'solid-triangle' },
		// Node forms: white collage-card boxes (the zine cut-out), accent pins
		// and dots; the box shadow rides the core hard-offset depth rig.
		'node.fill': { kind: 'style', value: '#ffffff' },
		'node.accent': { kind: 'style', value: '#fabf47' },
		// The node's border/stroke/glyphs ride the inherited composition colour
		// (render-is-truth: the CanvasSource paints `var(--ink, currentColor)`);
		// claimed explicitly so the core `ink-treatment` fallback can't repaint it.
		'node.ink': { kind: 'style', value: 'currentColor' },
		'node.depth': { kind: 'style', value: { hardOffset: { dx: 8, dy: 8, blur: 0, color: 'rgba(0, 0, 0, 0.85)' } } },
		// Caption + stat voices ride the composition ink / channel accent.
		'label.ink': { kind: 'style', value: 'currentColor' },
		'stat-callout.accent': { kind: 'style', value: '#fabf47' },
		'stat-callout.ink': { kind: 'style', value: 'currentColor' },

		// ---------------- Annotation tool inks ----------------
		'highlight.fill': { kind: 'style', value: '#fabf47' },
		'underline.fill': { kind: 'style', value: '#00fff5' },
		'strike.fill': { kind: 'style', value: '#ff474e' },
		'circle.fill': { kind: 'style', value: '#ff474e' },
		'box.fill': { kind: 'style', value: '#1f5aff' },

		// ---------------- Annotation focal chrome ----------------
		'lift-out.depth': { kind: 'style', value: { hardOffset: { dx: 8, dy: 8 } } },
		'lift-out.edge': { kind: 'style', value: 'sharp' },

		'tear-out.fill': { kind: 'style', value: '#ffffff' },

		'isolate.depth': { kind: 'style', value: 'flat' },

		// ---------------- Overlays ----------------
		'lower-third.accent': { kind: 'style', value: '#f4a85e' },
		'lower-third.ink': { kind: 'style', value: '#fff8ec' },
		'lower-third.roleInk': { kind: 'style', value: '#d8c4a0' },

		// Consumed appearance Roles wired into the overlay CanvasSources
		// (render-is-truth — values match what each CanvasSource paints).
		'watermark.ink': { kind: 'style', value: '#ededed' },
		'watermark.accent': { kind: 'style', value: '#ffd642' },
		'counter.ink': { kind: 'style', value: '#fabf47' },
		'instance-stack.ink': { kind: 'style', value: '#fabf47' },
		'text-3d.ink': { kind: 'style', value: '#fabf47' },
		// Washi-tape procedural grain — the dark/light fibre stops in the tape's
		// gradient stack (alpha-bound; previously inline literals, now Pack-routed).
		'washi-tape.grain-dark': { kind: 'style', value: 'rgba(0, 0, 0, 0.08)' },
		'washi-tape.grain-light': { kind: 'style', value: 'rgba(255, 255, 255, 0.06)' },
		'lower-third.edge': { kind: 'style', value: { rule: 'vertical-accent', color: '#fabf47' } },
		'lower-third.depth': { kind: 'style', value: 'flat' },
		'lower-third.light': { kind: 'style', value: { standard: 'none', cinematic: 'anamorphic-flare' } },

		// ---------------- motion-primitives v1 (Phase 4.2-4.4) ----------------
		'cursor-trail.pointer': { kind: 'style', value: 'mac-pointer' },
		// Trail material — the CanvasSource composes this one colour at several
		// alphas (rgb-channel var, via resolveColorChannels) for the velocity
		// fade; `softness` sets the gradient falloff midpoint. A warm off-white
		// realises the channel's long-declared `linear-fade-warm` intent.
		'cursor-trail.trailMaterial': {
			kind: 'style',
			value: { color: '#ffe9c8', softness: 0.35 }
		},

		'instance-stack.edge': { kind: 'style', value: 'clean-vector' },
		'instance-stack.depth': { kind: 'style', value: 'opacity-recession' },
		'instance-stack.light': { kind: 'style', value: 'none' },

		'text-3d.edge': { kind: 'style', value: 'clean-vector' }
	}
};
