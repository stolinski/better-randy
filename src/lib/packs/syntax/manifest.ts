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
		'The Syntax.fm house style (github.com/randyrektor/syntax-overlay): flat warm-black fields, bordered cards with chunky stepped shadows, Space Grotesk display + Space Mono chrome, one loud #ffd54a yellow. Substrate ≠ chrome: quoted documents keep their own physics.',
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
		// Brand yellow per the real overlay system (github.com/randyrektor/
		// syntax-overlay, calibration 2026-07-09) — was #fabf47, which belongs to
		// the physical-highlighter mark defaults, not the chrome accent.
		'accent-treatment': { kind: 'style', value: '#ffd54a' },
		// The pack-wide type voice (2026-07-09): every chrome family inherits
		// Grotesk display + Space Mono labels automatically (a pack switch IS the
		// font switch); document substrates hardcode their faces in the
		// CanvasSource and never consume the voice vars.
		'font-treatment': { kind: 'style', value: "'Space Grotesk', 'Inter', sans-serif" },
		'font-label-treatment': { kind: 'style', value: "'Space Mono', ui-monospace, monospace" },
		// Core structural edge vocabulary (five values: clean/soft/irregular/
		// torn/none, resolved by resolveEdgeTreatment → the shared edge-treatment
		// ShaderPass). Brand ruling 2026-07-09: chrome never tears — clean is the
		// default; a quoted-document substrate (newspaper) claims its own torn edge.
		'edge-treatment': {
			kind: 'style',
			value: 'clean'
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
		'chapter-card.edge': { kind: 'style', value: 'clean' },
		'chapter-card.depth': { kind: 'style', value: { hardOffset: { dx: 10, dy: 10, blur: 0 } } },
		'chapter-card.light': { kind: 'style', value: 'none' },
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		// Warm off-white (not pure #fff): agrees with the upper-right warm key and
		// keeps Q17 emphasis headroom — matches the preset's declared inkColor.
		'chapter-card.ink': { kind: 'style', value: '#f7f6f2' },
		'chapter-card.base': { kind: 'style', value: '#f7f6f2' },
		'chapter-card.kicker': { kind: 'style', value: '#ffd54a' },
		'chapter-card.rule': { kind: 'style', value: '#454441' },
		// WGSL backdrop tints — FLAT brand field (2026-07-09): the light is
		// additive so #000000 zeroes it; top == bottom kills the gradient (and
		// makes the baked camera dolly a no-op on the flat field).
		'chapter-card.backdrop': {
			kind: 'style',
			value: { top: '#0e0e0d', bottom: '#0e0e0d', light: '#000000' }
		},

		// ---------------- pullquote-on-photo Surface ----------------
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		'pullquote-on-photo.ink': { kind: 'style', value: '#ffffff' },
		'pullquote-on-photo.byline': { kind: 'style', value: '#f4ecdc' },
		// WGSL backdrop tints (render-is-truth — exact byte conversions of the
		// pullquote-photo-backdrop pass's vec3f constants): near-black gradient,
		// warm-neutral upper-left light, warm entrance sweep band.
		'pullquote-on-photo.backdrop': {
			kind: 'style',
			value: { top: '#0e0e0d', bottom: '#0e0e0d', light: '#000000', sweep: '#000000' }
		},

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
		// CanvasSource chain `var(--edge, var(--ink))` → `newspaper.ink` — same
		// value this Role carried when it was a bare colour.
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
		// WGSL print tints (render-is-truth — exact byte conversions of the
		// newspaper-physics pass's vec3f constants): cool near-black halftone
		// ink, faintly warm edge-occlusion shadow.
		'newspaper.print': { kind: 'style', value: { ink: '#0a0a0d', shadow: '#0d0a0a' } },

		// ---------------- title-sequence Surface ----------------
		'title-sequence.edge': { kind: 'style', value: 'none' },
		'title-sequence.depth': { kind: 'style', value: 'none' },
		'title-sequence.light': { kind: 'style', value: 'none' },
		// Consumed color Roles (render-is-truth — match what CanvasSource paints).
		'title-sequence.ink': { kind: 'style', value: '#f7f6f2' },
		'title-sequence.kicker': { kind: 'style', value: '#ffd54a' },
		// WGSL backdrop tints — FLAT brand field (2026-07-09): additive glow
		// zeroed, gradient flattened; the atmosphere grammar is not the brand.
		'title-sequence.backdrop': {
			kind: 'style',
			value: { top: '#0e0e0d', bottom: '#0e0e0d', glow: '#000000' }
		},

		// ---------------- type-hero Surface ----------------
		'type-hero.edge': { kind: 'style', value: 'clean-vector' },
		'type-hero.depth': { kind: 'style', value: 'none' },
		// The raked-light dimension at full strength (render-is-truth — the
		// identity spec's viaPack seam resolves here; intensity 1 packs the
		// pass's original constants, bit-identical to the pre-routing render).
		'type-hero.light': { kind: 'style', value: { intensity: 1 } },
		// Consumed color Roles — brand tokens (syntax-overlay repo, 2026-07-09):
		// #f7f6f2 text, #ffd54a accent, #c9c6bc byline; the amber/sand warms
		// read as generic template, not Syntax.
		'type-hero.text-base': { kind: 'style', value: '#f7f6f2' },
		'type-hero.ink': { kind: 'style', value: '#f7f6f2' },
		'type-hero.accent': { kind: 'style', value: '#ffd54a' },
		'type-hero.byline': { kind: 'style', value: '#c9c6bc' },
		'type-hero.weight': { kind: 'style', value: '700' },
		'type-hero.stretch': { kind: 'style', value: 'normal' },
		// WGSL backdrop tints. The brand field is FLAT warm black (calibration
		// 2026-07-09: drifting atmosphere bands + particle motes read as another
		// channel's cinematic grammar, not Syntax) — bands/motes are additive in
		// the pass, so pure black zeroes them; top == bottom kills the gradient.
		// The letterform rim/carve grade stays intrinsic to the pass.
		'type-hero.backdrop': {
			kind: 'style',
			value: {
				top: '#0e0e0d',
				bottom: '#0e0e0d',
				warmBand: '#000000',
				coolBand: '#000000',
				particle: '#000000'
			}
		},

		// ---------------- paragraph Block ----------------
		// Glyph material claim (rides the optional `material-treatment` core
		// dimension — 'ink-bleed' is how the ink sits on the paper, not a
		// silhouette edge).
		'paragraph.material': { kind: 'style', value: 'ink-bleed' },

		// ---------------- Diagram Blocks (ADR-0036) ----------------
		// One pen for the whole diagram, in the composition's ink (the 'ink'
		// sentinel resolves to the typography.inkColor override → core
		// ink-treatment, ADR-0038 — so strokes flip with the preset over
		// footage). Arrowheads are solid marker triangles. wobble 0: the docu
		// register wants clean documentary rules — the hand-drawn jitter read as
		// jank on the timeline axis, not charm (calibration verdict 2026-07-09).
		'diagram.stroke': { kind: 'style', value: { color: 'ink', widthPx: 12, wobble: 0 } },
		'diagram.arrowhead': { kind: 'style', value: 'solid-triangle' },
		// Diagram DOM chrome voice — Space Mono (read by DiagramMount ahead of the
		// engine typography voice; NOT a core font-treatment claim, which would
		// override document substrates' own faces).
		'diagram.font': { kind: 'style', value: "'Space Mono', ui-monospace, monospace" },
		// Node forms: white collage-card boxes (the zine cut-out), accent pins
		// and dots; the box shadow rides the core hard-offset depth rig.
		'node.fill': { kind: 'style', value: '#ffffff' },
		'node.accent': { kind: 'style', value: '#ffd54a' },
		// The node's border/stroke/glyphs ride the inherited composition colour
		// (render-is-truth: the CanvasSource paints `var(--ink, currentColor)`);
		// claimed explicitly so the core `ink-treatment` fallback can't repaint it.
		'node.ink': { kind: 'style', value: 'currentColor' },
		'node.depth': { kind: 'style', value: { hardOffset: { dx: 8, dy: 8, blur: 0, color: 'rgba(0, 0, 0, 0.85)' } } },
		// Caption + stat voices ride the composition ink / channel accent.
		'label.ink': { kind: 'style', value: 'currentColor' },
		'stat-callout.accent': { kind: 'style', value: '#ffd54a' },
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
		// The Syntax house card (calibration 2026-07-09, matched to the real
		// live-stream overlays — github.com/randyrektor/syntax-overlay): a FLAT
		// warm-dark card with a visible border, rounded corners, and the signature
		// chunky stepped hard-offset shadow. No gloss, no gradients, no glow —
		// the earlier "cinematic" scrim/flare dress read as generic template.
		// Values are the repo's, scaled ×2 for the 4K frame (repo authored ~1080p).
		'lower-third.accent': { kind: 'style', value: '#ffd54a' },
		'lower-third.ink': { kind: 'style', value: '#f7f6f2' },
		'lower-third.roleInk': { kind: 'style', value: '#c9c6bc' },
		'lower-third.plate': { kind: 'style', value: '#141413' },
		// Chrome scales with the CARD's proportions, not the frame's resolution
		// (first pass converted the repo's 1080p values ×2 and rendered hairline).
		// Repo card ≈ 95px tall: border 2px ≈ 2.1% of card height, radius 8px ≈
		// 8.4%, shadow 10 × 1px steps ≈ 10.5% total, pad 14/20 ≈ 15%/21%. Our
		// card ≈ 480px @4K → the same ratios below.
		'lower-third.border': { kind: 'style', value: '10px solid #454441' },
		'lower-third.radius': { kind: 'style', value: '40px' },
		'lower-third.shadow': {
			kind: 'style',
			value:
				'5px 5px 0 0 #050504, 10px 10px 0 0 #050504, 15px 15px 0 0 #050504, 20px 20px 0 0 #050504, 25px 25px 0 0 #050504, 30px 30px 0 0 #050504, 35px 35px 0 0 #050504, 40px 40px 0 0 #050504, 45px 45px 0 0 #050504, 50px 50px 0 0 #050504'
		},
		'lower-third.pad': { kind: 'style', value: '68px 100px 72px 96px' },
		'lower-third.gap': { kind: 'style', value: '20px' },
		'lower-third.weight': { kind: 'style', value: '700' },
		'lower-third.tracking': { kind: 'style', value: '0.08em' },
		// The cinematic scrim base stays claimed for the variant that uses it.
		'lower-third.scrim': { kind: 'style', value: { color: '#08060a' } },

		// Consumed appearance Roles wired into the overlay CanvasSources
		// (render-is-truth — values match what each CanvasSource paints).
		'watermark.ink': { kind: 'style', value: '#f7f6f2' },
		'watermark.accent': { kind: 'style', value: '#ffd54a' },
		'counter.ink': { kind: 'style', value: '#ffd54a' },
		'instance-stack.ink': { kind: 'style', value: '#ffd54a' },
		'text-3d.ink': { kind: 'style', value: '#ffd54a' },
		// Washi-tape procedural grain — the dark/light fibre stops in the tape's
		// gradient stack (alpha-bound; previously inline literals, now Pack-routed).
		'washi-tape.grain-dark': { kind: 'style', value: 'rgba(0, 0, 0, 0.08)' },
		'washi-tape.grain-light': { kind: 'style', value: 'rgba(255, 255, 255, 0.06)' },
		'lower-third.edge': { kind: 'style', value: { rule: 'vertical-accent', color: '#ffd54a' } },
		'lower-third.depth': { kind: 'style', value: 'flat' },
		// No light pass on either variant (calibration 2026-07-09): the anamorphic
		// flare read as glossy motion-template chrome — the house style is flat.
		'lower-third.light': { kind: 'style', value: { standard: 'none', cinematic: 'none' } },

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
