/**
 * CRT Terminal Pack manifest — the third Pack, per
 * `docs/packs/crt-terminal/aesthetic.md` (binding). The emissive point of the
 * pack triangle: where syntax is warm reflective paper and editorial-mono is
 * cool reflective print, every CRT element is a small green-glowing screen —
 * light, not pigment. This Pack exists to stress the roles a colour swap never
 * touched:
 *
 *   - **Depth is glow.** `depth-treatment` resolves to a `{ glow }` rig
 *     (phosphor bloom halo, `resolveDepthTreatment` kind:'glow'), never a
 *     hard offset — a drop shadow under this Pack is a pipeline bug by
 *     definition.
 *   - **Edges are hard.** `edge-treatment: 'none'` — pixel-crisp boundaries;
 *     no torn fiber, no feather. The character grid is the only edge texture.
 *   - **Grain is scanline.** `material-treatment` claims the scanline recipe,
 *     applied per element pixel by the shared crt-scanline ShaderPass
 *     (alpha-masked — footage under transparent overlays is never treated).
 *   - **Chrome (opaque pieces only).** The `chrome` Role appends the
 *     `crt-screen` effect (full-frame scanline + bloom + vignette) AFTER a
 *     preset's own effects whenever the composition declares a
 *     `backgroundFill`. It is the Pack's dress, so it never appears in the
 *     preset's `effects[]` — swap the Pack and the chrome goes with it.
 *
 * ONE hue. Hierarchy is intensity (how hard the phosphor is driven), never a
 * second colour: glass #070b08 → ghost #0f3a1c → dim #1e8f3d → phosphor
 * #45ff6e → hot core #d9ffe0. No amber, no cyan, no warm anything — alerts
 * are brighter phosphor.
 */

import type { PackManifest } from '$lib/platform/packs/types';
import { crtTerminalFonts } from './fonts';

export const crtTerminalPack: PackManifest = {
	slug: 'crt-terminal',
	label: 'CRT Terminal',
	description:
		'80s phosphor terminal — one green phosphor at several excitations on near-black glass; depth is bloom, grain is scanline, edges are hard pixels. Mission console, not arcade.',
	fonts: crtTerminalFonts,
	roles: {
		// ---------------------------------------------------------------
		// Mandatory core vocabulary (ADR-0024 fallback floor).
		// ---------------------------------------------------------------
		// Near-black screen glass with a faint green cast; the driven phosphor is
		// the ink (the brightest thing in frame — emissive, the inversion of both
		// reflective Packs); the accent is the hot, overdriven white-green core,
		// NOT another hue.
		'fill-treatment': { kind: 'style', value: '#070b08' },
		'ink-treatment': { kind: 'style', value: '#45ff6e' },
		'accent-treatment': { kind: 'style', value: '#d9ffe0' },
		// Hard pixel edges: a screen silhouette is exactly as rasterized — no
		// torn fiber, no soft feather.
		'edge-treatment': { kind: 'style', value: 'none' },
		// THE structural inversion: depth is a phosphor bloom halo, never a drop
		// shadow (a shadow implies an object above paper; a screen has neither).
		// 22px @4K hot radius in the element's own foreground; consumers compose
		// the wider dim skirt. Intensity scales with excitation — hotter Roles
		// override wider/brighter, UI furniture narrower/dimmer.
		'depth-treatment': { kind: 'style', value: { glow: { radius: 22, color: 'fg', intensity: 0.85 } } },
		// Screens emit; nothing lights them. 'none' is a real claim, not an
		// omission — the ADR-0028 stage gets no key light under this Pack.
		'light-treatment': { kind: 'style', value: 'none' },
		// Optional cores. The scanline is the Pack's material signature: subtle
		// raster + faint shimmer inside element pixels (visible at pause,
		// invisible in motion; deterministic). Font: one modern mono voice —
		// JetBrains Mono ahead of the engine mono stack; the period feel is the
		// phosphor material, never a bitmap face.
		'material-treatment': { kind: 'style', value: { scanline: { pitchPx: 6, strength: 0.2, shimmer: 0.05 } } },
		'font-treatment': {
			kind: 'style',
			value: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace'
		},

		// ---------------------------------------------------------------
		// Chrome (kind:'chrome') — opaque segments/bumpers only: the whole
		// frame IS the terminal. Restrained full-frame scanline + bloom +
		// vignette; appended by the Workspace after the preset's own effects
		// when `backgroundFill` is declared. Transparent overlays never get it.
		// ---------------------------------------------------------------
		chrome: {
			kind: 'chrome',
			effects: [
				{
					type: 'crt-screen',
					params: {
						// The per-element material pass (strength 0.2) already rasters
						// element pixels and shares this pitch/phase (both are pure
						// functions of canvas y), so the two superpose coherently — the
						// chrome runs lighter to keep the combined raster low-contrast
						// while still texturing the backdrop between elements.
						scanlinePitchPx: 6,
						scanlineStrength: 0.12,
						bloomThreshold: 0.5,
						bloomStrength: 0.34,
						vignette: 0.3
					}
				}
			]
		},

		// ---------------- chapter-card Surface ----------------
		// Title moments run hot-core; body/general ink stays driven phosphor;
		// the kicker is the terminal's dim status-line voice; the rule is a
		// dim-phosphor hairline at persistence alpha.
		'chapter-card.ink': { kind: 'style', value: '#45ff6e' },
		'chapter-card.base': { kind: 'style', value: '#d9ffe0' },
		'chapter-card.kicker': { kind: 'style', value: '#2fb352' },
		'chapter-card.rule': { kind: 'style', value: 'rgba(30, 143, 61, 0.62)' },
		// WGSL backdrop: near-black glass with a green cast top and floor (one
		// hue — no warm charcoal), and the "key light" tint is phosphor emission
		// leaking into the room, not a lamp.
		'chapter-card.backdrop': {
			kind: 'style',
			value: { top: '#040906', bottom: '#060d08', light: '#39e763' }
		},

		// ---------------- pullquote-on-photo Surface ----------------
		// The quote is the hottest thing in frame (hot core); the byline is the
		// dim status voice. Backdrop gradient stays glass-black-green; the
		// directional light and entrance sweep are brighter phosphor, never warm.
		'pullquote-on-photo.ink': { kind: 'style', value: '#d9ffe0' },
		'pullquote-on-photo.byline': { kind: 'style', value: '#2fb352' },
		'pullquote-on-photo.backdrop': {
			kind: 'style',
			value: { top: '#030704', bottom: '#050b07', light: '#67f58b', sweep: '#a9ffbe' }
		},

		// ---------------- newspaper Surface ----------------
		// The clipping re-skins as a terminal readout panel: near-black glass
		// fill, phosphor body ink, hot-core accent, dim kicker. The silhouette is
		// die-cut hard ('none' — a screen is not torn from anything); depth rides
		// the core glow rig (no per-Pipeline shadow to override away).
		'newspaper.fill': { kind: 'style', value: '#070b08' },
		'newspaper.ink': { kind: 'style', value: '#45ff6e' },
		'newspaper.accent': { kind: 'style', value: '#d9ffe0' },
		'newspaper.kicker-ink': { kind: 'style', value: '#2fb352' },
		'newspaper.edge': { kind: 'style', value: 'none' },
		// WGSL print physics tinted ghost-green-black: halftone "ink" and the
		// edge-occlusion tone both sit between ghost and glass — no warm
		// newsprint cast anywhere.
		'newspaper.print': { kind: 'style', value: { ink: '#0c2e17', shadow: '#08170e' } },

		// ---------------- title-sequence Surface ----------------
		// The drop title is the overdriven moment: hot core over the deepest
		// glass. The off-frame glow is pure phosphor — the tube lighting its own
		// room.
		'title-sequence.ink': { kind: 'style', value: '#d9ffe0' },
		// Driven phosphor, not mid-excitation: the kicker sits in the vignette's
		// bite under the 0.88 pipeline opacity + scanline stack (~0.68 combined),
		// so #2fb352 lands ~3.7:1 (measured) — full phosphor clears G5 with the
		// ladder intact (title stays hot-core above it; the status-line voice is
		// carried by size/caps/tracking, not dimness).
		'title-sequence.kicker': { kind: 'style', value: '#45ff6e' },
		'title-sequence.backdrop': {
			kind: 'style',
			value: { top: '#020503', bottom: '#040a06', glow: '#45ff6e' }
		},

		// ---------------- type-hero Surface ----------------
		// Letterforms in driven phosphor with hot-core emphasis; byline dim. The
		// backdrop's drifting band PAIR collapses to two phosphor intensities
		// (dim passing ghost — the parallax reads as excitation, never
		// temperature; the role must not leak warm) and the motes are faint hot
		// phosphor specks.
		'type-hero.text-base': { kind: 'style', value: '#45ff6e' },
		'type-hero.ink': { kind: 'style', value: '#d9ffe0' },
		'type-hero.accent': { kind: 'style', value: '#d9ffe0' },
		'type-hero.byline': { kind: 'style', value: '#2fb352' },
		'type-hero.backdrop': {
			kind: 'style',
			value: {
				top: '#020503',
				bottom: '#040906',
				warmBand: '#1e8f3d',
				coolBand: '#0f3a1c',
				particle: '#a9ffbe'
			}
		},

		// ---------------- Diagram Blocks (ADR-0036) ----------------
		// A machine does not wobble: dead-straight plotter lines (wobble 0) in
		// the composition's resolved ink, thinner than syntax's marker (6px @4K —
		// a plotter pen, not a felt tip). Open-chevron arrowheads — plotter
		// strokes, not filled marker triangles.
		'diagram.stroke': { kind: 'style', value: { color: 'ink', widthPx: 6, wobble: 0 } },
		'diagram.arrowhead': { kind: 'style', value: 'open-chevron' },
		// Nodes are small screens themselves: glass fill, phosphor border/glyphs,
		// hot-core pins. Node depth is a narrower, dimmer bloom than the core rig
		// — UI furniture is driven softer than title moments.
		'node.fill': { kind: 'style', value: '#070b08' },
		'node.ink': { kind: 'style', value: '#45ff6e' },
		'node.accent': { kind: 'style', value: '#d9ffe0' },
		'node.depth': { kind: 'style', value: { glow: { radius: 14, color: '#45ff6e', intensity: 0.6 } } },
		'stat-callout.accent': { kind: 'style', value: '#d9ffe0' },

		// ---------------- Annotation tool inks ----------------
		// One phosphor at several excitations — the annotation "colours" are an
		// intensity ladder: highlight bands dim (a selection block behind text),
		// underlines at driven phosphor, alert marks (strike/circle) at hot core
		// — an alert is BRIGHTER phosphor, never red.
		'highlight.fill': { kind: 'style', value: '#1e8f3d' },
		'underline.fill': { kind: 'style', value: '#45ff6e' },
		'strike.fill': { kind: 'style', value: '#d9ffe0' },
		'circle.fill': { kind: 'style', value: '#d9ffe0' },
		'box.fill': { kind: 'style', value: '#45ff6e' },

		// ---------------- Overlays ----------------
		// Intensity ladder on the lower third: the guest NAME is the title
		// moment (hot core), the accent rule + kicker chip run driven phosphor,
		// the role line is the dim status voice. One hue, three excitations.
		'lower-third.accent': { kind: 'style', value: '#45ff6e' },
		'lower-third.ink': { kind: 'style', value: '#d9ffe0' },
		// Role line: a mid excitation between dim and driven phosphor — dim
		// (#1e8f3d) fails the G5 4.5:1 floor at subtitle size against the
		// glass plate (Critic 2026-07-04); #2fb352 clears it (~7:1) while
		// staying visibly below the driven-phosphor kicker in the ladder.
		'lower-third.roleInk': { kind: 'style', value: '#2fb352' },
		// Plate chrome: the plate is a small powered-off screen (near-opaque
		// glass with the green cast), the cinematic scrim composes the same glass
		// at several alphas.
		'lower-third.plate': { kind: 'style', value: 'rgba(4, 9, 6, 0.92)' },
		'lower-third.scrim': { kind: 'style', value: { color: '#030704' } },
		'lower-third.edge': { kind: 'style', value: { rule: 'vertical-accent', color: '#45ff6e' } },
		// WGSL rim tint on the cinematic variant: the implied off-frame source is
		// the terminal's own phosphor spill — one hue, not a tungsten key.
		'lower-third.flare': { kind: 'style', value: { rim: '#45ff6e' } },

		'watermark.ink': { kind: 'style', value: '#45ff6e' },
		'watermark.accent': { kind: 'style', value: '#d9ffe0' },
		'counter.ink': { kind: 'style', value: '#45ff6e' },
		'instance-stack.ink': { kind: 'style', value: '#45ff6e' },
		'text-3d.ink': { kind: 'style', value: '#45ff6e' },

		// Washi tape is a PAPER artifact the aesthetic doc forbids (no tape, no
		// collage) — these values are defensive so the Role can never leak warm
		// fibre tones if a re-skinned Preset carries tape anyway: glass-dark and
		// hot-phosphor-light grain stops at the same alphas syntax uses.
		'washi-tape.grain-dark': { kind: 'style', value: 'rgba(3, 12, 6, 0.08)' },
		'washi-tape.grain-light': { kind: 'style', value: 'rgba(217, 255, 224, 0.05)' },

		// ---------------- motion primitives ----------------
		// The pointer is the terminal block cursor (▮), hard-edged, in phosphor;
		// the trail is phosphor persistence — decay residue, so it hugs the hot
		// end (low softness = the fade drops to ghost quickly, like P1 decay).
		'cursor-trail.pointer': { kind: 'style', value: 'block-cursor' },
		'cursor-trail.trailMaterial': { kind: 'style', value: { color: '#45ff6e', softness: 0.2 } },

		'instance-stack.edge': { kind: 'style', value: 'clean-vector' },
		'instance-stack.depth': { kind: 'style', value: 'opacity-recession' },
		'instance-stack.light': { kind: 'style', value: 'none' },
		'text-3d.edge': { kind: 'style', value: 'clean-vector' }
	}
};
