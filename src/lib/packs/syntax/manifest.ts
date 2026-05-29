/**
 * Syntax Pack manifest — per ADR-0014. Resolves every Role referenced by a
 * registered Pipeline\'s Identity Spec `viaPack` clause (per ADR-0019).
 * Role keys follow the `<pipeline-type>.<role-id>` convention so the engine\'s
 * boot validator can pair a Pipeline\'s declared viaPack list against the
 * Pack\'s resolution.
 *
 * Hex codes, font stacks, eases, and motion shapes that previously lived
 * inline in the 12 shipped Presets land here. Adding a new Pack means
 * copying this file, renaming the slug, and rewriting every entry to a new
 * channel\'s vocabulary — the Pipelines never change.
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
		// Core / channel-level Roles (Pack vocabulary, not Pipeline-scoped)
		// ---------------------------------------------------------------
		'fill-treatment': {
			kind: 'style',
			value: { dominant: '#fabf47', neutral: { paper: '#ffffff', ink: '#000000' } }
		},
		'edge-treatment': {
			kind: 'style',
			value: { rule: '2px', color: '#000000', torn: true }
		},
		'depth-treatment': {
			kind: 'style',
			value: { hardOffset: { dx: 8, dy: 8, blur: 0, color: 'fg' } }
		},
		'light-treatment': {
			kind: 'style',
			value: { direction: 'upper-left', intensity: 0.45 }
		},

		// ---------------- plain Surface (all via-pack) ----------------
		'plain.fill': { kind: 'style', value: '#ffffff' },
		'plain.edge': { kind: 'style', value: 'sharp' },
		'plain.depth': { kind: 'style', value: { offset: { dx: 8, dy: 8, blur: 0 } } },
		'plain.light': { kind: 'style', value: 'none' },
		'plain.enterMotion': { kind: 'style', value: 'settled-place' },
		'plain.frameRelationship': { kind: 'style', value: 'centred' },

		// ---------------- chapter-card Surface ----------------
		'chapter-card.fill': { kind: 'style', value: '#fabf47' },
		'chapter-card.edge': { kind: 'style', value: 'torn' },
		'chapter-card.depth': { kind: 'style', value: { hardOffset: { dx: 10, dy: 10, blur: 0 } } },
		'chapter-card.light': { kind: 'style', value: 'none' },

		// ---------------- pullquote-on-photo Surface ----------------
		'pullquote-on-photo.inkFill': { kind: 'style', value: '#fdfdfd' },
		'pullquote-on-photo.focalMotion': { kind: 'style', value: 'brightness-reveal' },
		'pullquote-on-photo.attribution': {
			kind: 'style',
			value: { anchor: 'bottom-right', font: 'mono', scale: 0.55 }
		},

		// ---------------- title-sequence Surface ----------------
		'title-sequence.fill': { kind: 'style', value: '#ffffff' },
		'title-sequence.edge': { kind: 'style', value: 'none' },
		'title-sequence.depth': { kind: 'style', value: 'none' },
		'title-sequence.light': { kind: 'style', value: 'none' },

		// ---------------- type-hero Surface ----------------
		'type-hero.inkFill': { kind: 'style', value: '#000000' },
		'type-hero.edge': { kind: 'style', value: 'clean-vector' },
		'type-hero.depth': { kind: 'style', value: 'none' },
		'type-hero.enterMotion': { kind: 'style', value: 'drift' },

		// ---------------- paragraph Block ----------------
		'paragraph.inkFill': { kind: 'style', value: '#000000' },
		'paragraph.glyphEdge': { kind: 'style', value: 'ink-bleed' },
		'paragraph.bodyEnter': { kind: 'style', value: 'fade-through' },
		'paragraph.measure': { kind: 'style', value: { chars: 60 } },

		// ---------------- Annotation tool inks ----------------
		'highlight.fill': { kind: 'style', value: '#fabf47' },
		'underline.fill': { kind: 'style', value: '#00fff5' },
		'strike.fill': { kind: 'style', value: '#ff474e' },
		'circle.fill': { kind: 'style', value: '#ff474e' },
		'box.fill': { kind: 'style', value: '#1f5aff' },

		// ---------------- Annotation focal chrome ----------------
		'magnify.lensEdge': { kind: 'style', value: 'sharp' },
		'magnify.lensDepth': { kind: 'style', value: { hardOffset: { dx: 8, dy: 8 } } },
		'magnify.enterMotion': { kind: 'style', value: 'settled-place' },

		'lift-out.depth': { kind: 'style', value: { hardOffset: { dx: 8, dy: 8 } } },
		'lift-out.edge': { kind: 'style', value: 'sharp' },

		'tear-out.fragmentFill': { kind: 'style', value: '#ffffff' },

		'isolate.dimDepth': { kind: 'style', value: 'flat' },

		'side-note.fill': { kind: 'style', value: '#000000' },
		'side-note.enterMotion': { kind: 'style', value: 'fade-through' },

		'callout.boxFill': { kind: 'style', value: '#fabf47' },
		'callout.boxEdge': { kind: 'style', value: 'sharp' },
		'callout.enterMotion': { kind: 'style', value: 'settled-place' },

		// ---------------- Overlays ----------------
		'lower-third.fill': { kind: 'style', value: '#0e0e10' },
		'lower-third.accent': { kind: 'style', value: '#f4a85e' },
		'lower-third.ink': { kind: 'style', value: '#fff8ec' },
		'lower-third.roleInk': { kind: 'style', value: '#d8c4a0' },
		'lower-third.edge': { kind: 'style', value: { rule: 'vertical-accent', color: '#fabf47' } },
		'lower-third.depth': { kind: 'style', value: 'flat' },
		'lower-third.light': { kind: 'style', value: { standard: 'none', cinematic: 'anamorphic-flare' } },

		'shader-fill.shader': { kind: 'pipeline', pipeline: 'paper-grain' },
		'shader-fill.edge': { kind: 'style', value: 'sharp' },
		'shader-fill.enterMotion': { kind: 'style', value: 'settled-place' },

		'watermark.inkFill': { kind: 'style', value: '#000000' },
		'watermark.enterMotion': { kind: 'style', value: 'fade-through' },

		// ---------------- motion-primitives v1 (Phase 4.2-4.4) ----------------
		'cursor-trail.pointer': { kind: 'style', value: 'mac-pointer' },
		'cursor-trail.trailMaterial': {
			kind: 'style',
			value: { gradient: 'linear-fade-warm', softness: 0.35 }
		},

		'counter.digitFill': { kind: 'style', value: '#000000' },
		'counter.numeralStyle': { kind: 'style', value: 'tabular-lining' },
		'counter.enterMotion': { kind: 'style', value: 'slot-machine-roll' },
		'counter.frameRelationship': { kind: 'style', value: 'baseline-anchored' },

		'instance-stack.fill': { kind: 'style', value: '#000000' },
		'instance-stack.edge': { kind: 'style', value: 'clean-vector' },
		'instance-stack.depth': { kind: 'style', value: 'opacity-recession' },
		'instance-stack.light': { kind: 'style', value: 'none' },
		'instance-stack.frameRelationship': { kind: 'style', value: 'anchored-block' },

		'text-3d.fill': { kind: 'style', value: '#fffaf2' },
		'text-3d.edge': { kind: 'style', value: 'clean-vector' },
		'text-3d.frameRelationship': { kind: 'style', value: 'centred' }
	}
};
