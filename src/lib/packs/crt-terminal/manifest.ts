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
		// Strength 0.12: the element raster is texture, and it stacks with the
		// crt-tube chrome's beam raster on opaque pieces — 0.2 pushed the
		// combined small-stroke luminance cost past the G5 ceiling
		// (Critic 2026-07-10).
		'material-treatment': { kind: 'style', value: { scanline: { pitchPx: 6, strength: 0.12, shimmer: 0.05 } } },
		'font-treatment': {
			kind: 'style',
			value: '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace'
		},

		// ---------------------------------------------------------------
		// Chrome (kind:'chrome') — opaque segments/bumpers only: the whole
		// frame IS the terminal. The physical tube (`crt-tube`): gaussian-beam
		// raster, subtle shadow-mask texture, flat glass with a rounded bezel,
		// phosphor halation. Appended by the Workspace after the preset's own
		// effects when `backgroundFill` is declared. Transparent overlays
		// never get it.
		//
		// Deliberately NO `ntsc-signal` stage: a terminal is direct-drive —
		// composite artifacts (rainbow cross-color, chroma bleed) would shred
		// mono text, and text legibility is this Pack's core value. Curvature
		// is 0: the aesthetic doc's flat-glass law binds the dial even though
		// the general effect supports it. The dial is G5-bounded — mask
		// strength / beam focus / vignette are set so small dim-phosphor text
		// keeps its measured contrast floor (Critic re-review 2026-07-10);
		// retune against the show-open-in-focus-crt dim voices before
		// darkening any of them.
		// ---------------------------------------------------------------
		chrome: {
			kind: 'chrome',
			effects: [
				{
					type: 'crt-tube',
					params: {
						mask: 'shadow',
						maskPitchPx: 7,
						// 0.12 (with focus 0.88 below): maximum G5 headroom the dial can
						// give. Measured limit (Critic round-5 phase map, 2026-07-10):
						// a depth-stage camera push still decays 33px-caps avg-ink
						// ~9% across the hold (4.7 → 4.28 on show-open's SEASON TWO)
						// — that residue is push-magnification sliding sub-pixel
						// strokes across the fixed screen-space rasters, not a dial
						// term; the engine-side lane is scanline scale-compensation
						// (dex h02eht8j).
						maskStrength: 0.12,
						// 2160 / 360 = 6px line pitch @4K — the same pitch as the
						// per-element material scanline (pitchPx 6), so the element
						// raster and the tube raster superpose coherently.
						lines: 360,
						// Soft beam: shallow gaps preserve the average luminance of
						// 3px mono strokes (avg-ink G5); the raster texture on
						// elements is carried by the material-treatment scanline.
						focus: 0.88,
						curvature: 0,
						bezel: 0.3,
						halation: 0.4,
						vignette: 0.08,
						interlace: false
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
		// Hot core: under the crt-tube chrome (beam gaps + element scanline +
		// the pipeline's kicker dim), even full driven phosphor measures
		// ~3.8:1 avg-ink at 32px caps (Critic 2026-07-10) — below the 4.5:1
		// floor, with no dial slack left. The 32px-vs-268px size gap carries
		// the kicker/title hierarchy; the status-line voice is
		// size/caps/tracking, never dimness. The status voice also runs at
		// FULL DRIVE (kickerDim 1, kickerWeight 600): the tube chrome +
		// element scanline already cost ~25% of small-stroke avg luminance,
		// and G5's black-ground ceiling proves a dimmed 32px voice can never
		// clear the floor under them.
		'title-sequence.kicker': { kind: 'style', value: '#d9ffe0' },
		'title-sequence.kickerDim': { kind: 'style', value: '1' },
		'title-sequence.kickerWeight': { kind: 'style', value: '600' },
		// No shadows of any kind — the pipelines' baked glyph-legibility
		// text-shadows are reflective-pack dress; this Pack claims them off
		// (also stops the black rim eating small-text avg-ink, G5).
		'title-sequence.textShadow': { kind: 'style', value: 'none' },
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
		// Role line: driven phosphor. The mid excitation (#2fb352) cleared G5
		// under the flat crt-screen chrome (~7:1 raw, Critic 2026-07-04), but
		// the crt-tube chrome's mask lattice + beam gaps drag small-mono
		// avg-ink below the floor (2.11:1 measured, Critic 2026-07-10) — so
		// the secondary voice lifts one excitation step (the h02eht8j lane).
		// The status-line voice is carried by size/caps/tracking, not dimness.
		'lower-third.roleInk': { kind: 'style', value: '#45ff6e' },
		// Full drive on the LT status voices (same G5 reasoning as the
		// title-sequence kicker above — the pipelines' baked dims are var()
		// defaults this Pack overrides). The kicker also lifts to hot core:
		// its ink is otherwise welded to the accent Role, and driven phosphor
		// at 27px caps under the tube chrome measures 4.1–4.4:1 (Critic
		// 2026-07-10) — below the G5 floor with every dim lane already maxed.
		'lower-third.kickerInk': { kind: 'style', value: '#d9ffe0' },
		'lower-third.kickerDim': { kind: 'style', value: '1' },
		'lower-third.subtitleDim': { kind: 'style', value: '1' },
		'lower-third.textShadow': { kind: 'style', value: 'none' },
		// Plate chrome: the plate is a small powered-off screen (near-opaque
		// glass with the green cast), the cinematic scrim composes the same glass
		// at several alphas.
		'lower-third.plate': { kind: 'style', value: 'rgba(4, 9, 6, 0.92)' },
		'lower-third.scrim': { kind: 'style', value: { color: '#030704' } },
		// FORM dress (ADR-0023 appearance): the terminal reads as a bezelled
		// readout panel, not a floating title — a hard dim-phosphor screen
		// border (hard pixels, radius 0), tight console padding, and wide
		// status-line tracking on the mono labels. Widths ride `--cqmin` so
		// they scale with the 4K frame. This is what makes the CRT lower-third
		// a different OBJECT from the syntax one, not a recolour.
		// Border weight spans ≥1 tube raster pitch (0.3cqmin ≈ 6.5px @4K vs the
		// chrome's 6px lines) — a sub-pitch hairline crawls in and out of beam
		// phase and reads as broken dashes (Critic 2026-07-10). Same weight on
		// every bezelled panel below.
		'lower-third.border': { kind: 'style', value: 'calc(0.3 * var(--cqmin)) solid #1e8f3d' },
		'lower-third.radius': { kind: 'style', value: '0' },
		'lower-third.pad': { kind: 'style', value: 'calc(1.5 * var(--cqmin)) calc(2.2 * var(--cqmin))' },
		'lower-third.tracking': { kind: 'style', value: '0.34em' },
		'lower-third.weight': { kind: 'style', value: '600' },
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
		'text-3d.edge': { kind: 'style', value: 'clean-vector' },

		// ---------------------------------------------------------------
		// FORM dress (ADR-0023 appearance) — the machine-console vocabulary
		// applied across the corpus so every piece reads as the SAME terminal,
		// not one green pipeline. Cards/panels get a hard dim-phosphor bezel
		// (radius 0, tight console padding); labels run wide status-line
		// tracking, uppercased; type holds one uniform weight (uniformity IS
		// the terminal personality — no weight hierarchy). Border widths ride
		// `--cqmin` so they scale with the 4K frame. (`lower-third.*` form roles
		// live in the Overlays block above.)
		// ---------------------------------------------------------------
		'chapter-card.border': { kind: 'style', value: 'calc(0.3 * var(--cqmin)) solid #1e8f3d' },
		'chapter-card.radius': { kind: 'style', value: '0' },
		'chapter-card.tracking': { kind: 'style', value: '0.34em' },
		'chapter-card.case': { kind: 'style', value: 'uppercase' },
		'chapter-card.weight': { kind: 'style', value: '600' },

		'newspaper.border': { kind: 'style', value: 'calc(0.3 * var(--cqmin)) solid #1e8f3d' },
		'newspaper.radius': { kind: 'style', value: '0' },
		'newspaper.tracking': { kind: 'style', value: '0.34em' },
		'newspaper.case': { kind: 'style', value: 'uppercase' },
		'newspaper.weight': { kind: 'style', value: '600' },

		'title-sequence.tracking': { kind: 'style', value: '0.34em' },
		'title-sequence.case': { kind: 'style', value: 'uppercase' },
		'title-sequence.weight': { kind: 'style', value: '600' },

		'type-hero.tracking': { kind: 'style', value: '0.34em' },
		'type-hero.case': { kind: 'style', value: 'uppercase' },
		'type-hero.weight': { kind: 'style', value: '600' },

		'pullquote-on-photo.tracking': { kind: 'style', value: '0.34em' },
		'pullquote-on-photo.case': { kind: 'style', value: 'uppercase' },
		'pullquote-on-photo.weight': { kind: 'style', value: '600' },

		// Standard lower-third subtitle is mixed-case intrinsically; the terminal
		// uppercases it to the status-line voice (cinematic labels are already caps).
		'lower-third.case': { kind: 'style', value: 'uppercase' },

		// The odometer becomes a bezelled phosphor readout window.
		'counter.border': { kind: 'style', value: 'calc(0.3 * var(--cqmin)) solid #1e8f3d' },
		'counter.radius': { kind: 'style', value: '0' },
		'counter.pad': { kind: 'style', value: 'calc(1.2 * var(--cqmin)) calc(1.6 * var(--cqmin))' },
		'counter.weight': { kind: 'style', value: '600' },

		// The corner watermark becomes a bezelled terminal status tag.
		'watermark.border': { kind: 'style', value: 'calc(0.3 * var(--cqmin)) solid #1e8f3d' },
		'watermark.radius': { kind: 'style', value: '0' },
		'watermark.pad': {
			kind: 'style',
			value: 'calc(1.5 * var(--cqmin)) calc(1.9 * var(--cqmin)) calc(1.5 * var(--cqmin)) calc(1.7 * var(--cqmin))'
		},
		'watermark.tracking': { kind: 'style', value: '0.34em' },
		'watermark.case': { kind: 'style', value: 'uppercase' },

		// Plate-less display echoes — the only fitting lever is the uniform weight.
		'instance-stack.weight': { kind: 'style', value: '600' },
		'text-3d.weight': { kind: 'style', value: '600' }
	}
};
