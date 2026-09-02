import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { EdgeTreatment, EdgeTreatmentMode } from '$lib/platform/packs/resolve';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `edge-treatment` — the shared, Pack-driven edge primitive (dex jhxe2k5w).
 * One fragment pass carries all five edge-treatment values
 * (`clean / soft / irregular / torn / none`) behind a single mode-switched
 * alpha function: the pass reworks the composition's alpha SILHOUETTE (card /
 * clipping against transparency) and never touches interior pixels, because
 * every branch derives from the alpha field — where alpha is locally uniform
 * (deep inside the card, glyph edges over opaque paper, empty frame) each
 * branch degenerates to a passthrough.
 *
 *   - `clean`     — die-cut edge: tightens the capture's AA ramp
 *                   (smoothstep 0.2..0.8 on alpha) without collapsing it below
 *                   fractional coverage, so R4 (no aliasing) holds.
 *   - `soft`      — worn/feathered edge: 9-tap disc blur of the silhouette at
 *                   the treatment's amplitude.
 *   - `irregular` — hand-cut wobble: the alpha field is resampled through a
 *                   seeded low-frequency 2D value-noise displacement.
 *   - `torn`      — the collage tear: same displacement field plus a fine
 *                   second octave, and an interior fiber rim (paper-white
 *                   lightening where the displaced sample sits within a few px
 *                   of the torn void — aesthetic.md § Collage System).
 *   - `none`      — no Pack edge claim; the dispatcher never runs the pass.
 *
 * This is shader-side by requirement, not preference: CSS masks/filters
 * promote the element to its own compositing layer, and promoted layers drop
 * out of the WICG HTML-in-Canvas capture entirely
 * (docs/html-in-canvas-typegpu.md). The single-texture ShaderPass binding is
 * sufficient — the displaced-alpha formulation reads only the composition
 * texture itself, so no second texture / infrastructure change was needed.
 *
 * Which treatment runs is the active Pack's claim: `Workspace` resolves the
 * surface's `<type>.edge` Role → core `edge-treatment` (ADR-0024) via
 * `resolveEdgeTreatment` and dispatches this pass ahead of the surface's own
 * physics pass, so e.g. the newspaper's edge-occlusion shadow hugs the treated
 * silhouette. Deterministic per Q6 / G9: the noise field is seeded from the
 * composition (no wall-clock, no Math.random) and static over time — paper
 * does not re-tear frame to frame.
 */

export const EdgeTreatmentUniforms = d.struct({
	/** Mode code: 0 clean, 1 soft, 2 irregular, 3 torn (`none` never dispatches). */
	mode: d.f32,
	/** Displacement / feather radius in 4K-reference px. */
	amplitudePx: d.f32,
	/** Tear-path noise wavelength in 4K-reference px. */
	wavelengthPx: d.f32,
	/** Torn interior fiber-rim strength, 0..1. */
	fiber: d.f32,
	/** Per-composition seed in [0, 1) — phase-shifts the noise lattice. */
	seed: d.f32,
	/** Composition canvas size in px, for UV↔px mapping. */
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	/**
	 * Depth rig for displaced modes, 4K-reference px + straight colour.
	 * `shadowStrength` 0 disables (the CanvasSource keeps its CSS shadow for
	 * clean/soft/none — see the synthesis note in the WGSL body).
	 * `shadowKind` selects the form: 0 = hard-offset dup (reflective packs),
	 * 1 = centered bloom halo (emissive packs — dex 3x6uyx5h, the glow lane
	 * for intrinsically torn silhouettes). Offset rigs read shadowDx/Dy; glow
	 * rigs read glowRadiusPx/glowIntensity; both share the colour.
	 */
	shadowKind: d.f32,
	shadowDx: d.f32,
	shadowDy: d.f32,
	glowRadiusPx: d.f32,
	glowIntensity: d.f32,
	shadowR: d.f32,
	shadowG: d.f32,
	shadowB: d.f32,
	shadowStrength: d.f32
});

const EDGE_MODE_CODES: Record<Exclude<EdgeTreatmentMode, 'none'>, number> = {
	clean: 0,
	soft: 1,
	irregular: 2,
	torn: 3
};

/**
 * The Pack's depth rig, pre-resolved to numbers for the shader (px fields in
 * 4K-reference px, colour as straight RGB floats). Present only when the
 * surface pairs a displaced edge mode with a depth-treatment rig. Two forms
 * (the same split as `ResolvedDepthTreatment`): the reflective hard-offset
 * dup, and the emissive bloom halo (dex 3x6uyx5h) synthesized around the
 * torn silhouette for glow-depth Packs (crt-terminal).
 */
export type EdgeTreatmentDepthRig =
	| {
			kind: 'offset';
			dx: number;
			dy: number;
			rgb: readonly [number, number, number];
			/** Rig-colour alpha — clean-light's quiet float is rgba at 0.1, not opaque. */
			strength: number;
	  }
	| {
			kind: 'glow';
			radiusPx: number;
			intensity: number;
			rgb: readonly [number, number, number];
		};

/** What the dispatcher hands `packUniforms` per frame (built in `Workspace`). */
export interface EdgeTreatmentTarget {
	treatment: EdgeTreatment;
	/** Stable per-composition string (surface title) seeding the tear path. */
	seedSource: string;
	/** Shader-synthesized depth rig (displaced modes only), or null. */
	shadow: EdgeTreatmentDepthRig | null;
}

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

const wgsl = /* wgsl */ `
	let mode = layout.$.uniforms.mode;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let pxUv = vec2f(1.0 / canvasW, 1.0 / canvasH);
	// 4K-reference px → this composition's px. Both transports share a 2160
	// short side, so the treatment holds physical scale across orientations.
	let refScale = min(canvasW, canvasH) / 2160.0;
	let ampPx = max(layout.$.uniforms.amplitudePx, 0.0) * refScale;
	let wavelengthPx = max(layout.$.uniforms.wavelengthPx * refScale, 1.0);
	let seed = layout.$.uniforms.seed;

	// ----- Displacement field (the shared edgeAlpha core) -----
	//
	// Two independent channels of seeded 2D value noise displace the UV the
	// alpha field is resampled at. Coarse octave carries the tear path;
	// torn adds a fine octave for fibrous detail. Deterministic: lattice is a
	// pure function of pixel position + seed.
	let px = in.uv * vec2f(canvasW, canvasH);
	let k1 = vec2f(127.1, 311.7);
	let k2 = vec2f(269.5, 183.3);

	let np1 = px / wavelengthPx + vec2f(seed * 29.0, seed * 41.0);
	let c1 = floor(np1);
	let f1 = np1 - c1;
	let s1 = f1 * f1 * (3.0 - 2.0 * f1);
	let ax00 = fract(sin(dot(c1, k1)) * 43758.5453);
	let ax10 = fract(sin(dot(c1 + vec2f(1.0, 0.0), k1)) * 43758.5453);
	let ax01 = fract(sin(dot(c1 + vec2f(0.0, 1.0), k1)) * 43758.5453);
	let ax11 = fract(sin(dot(c1 + vec2f(1.0, 1.0), k1)) * 43758.5453);
	let nx1 = mix(mix(ax00, ax10, s1.x), mix(ax01, ax11, s1.x), s1.y);
	let ay00 = fract(sin(dot(c1, k2)) * 43758.5453);
	let ay10 = fract(sin(dot(c1 + vec2f(1.0, 0.0), k2)) * 43758.5453);
	let ay01 = fract(sin(dot(c1 + vec2f(0.0, 1.0), k2)) * 43758.5453);
	let ay11 = fract(sin(dot(c1 + vec2f(1.0, 1.0), k2)) * 43758.5453);
	let ny1 = mix(mix(ay00, ay10, s1.x), mix(ay01, ay11, s1.x), s1.y);

	let np2 = px * 3.4 / wavelengthPx + vec2f(seed * 61.0, seed * 17.0);
	let c2 = floor(np2);
	let f2 = np2 - c2;
	let s2 = f2 * f2 * (3.0 - 2.0 * f2);
	let bx00 = fract(sin(dot(c2, k1)) * 43758.5453);
	let bx10 = fract(sin(dot(c2 + vec2f(1.0, 0.0), k1)) * 43758.5453);
	let bx01 = fract(sin(dot(c2 + vec2f(0.0, 1.0), k1)) * 43758.5453);
	let bx11 = fract(sin(dot(c2 + vec2f(1.0, 1.0), k1)) * 43758.5453);
	let nx2 = mix(mix(bx00, bx10, s2.x), mix(bx01, bx11, s2.x), s2.y);
	let by00 = fract(sin(dot(c2, k2)) * 43758.5453);
	let by10 = fract(sin(dot(c2 + vec2f(1.0, 0.0), k2)) * 43758.5453);
	let by01 = fract(sin(dot(c2 + vec2f(0.0, 1.0), k2)) * 43758.5453);
	let by11 = fract(sin(dot(c2 + vec2f(1.0, 1.0), k2)) * 43758.5453);
	let ny2 = mix(mix(by00, by10, s2.x), mix(by01, by11, s2.x), s2.y);

	// Fine octave only participates in torn (mode 3).
	let fineWeight = select(0.0, 0.45, mode > 2.5);
	let disp = (vec2f(nx1, ny1) - vec2f(0.5)) * 2.0
		+ (vec2f(nx2, ny2) - vec2f(0.5)) * 2.0 * fineWeight;
	let dispUv = in.uv + disp * ampPx * pxUv;
	let edgeSample = textureSample(layout.$.inputTexture, layout.$.samp, dispUv);

	// ----- Soft: 9-tap disc blur of the silhouette -----
	let r = ampPx * pxUv;
	let t1 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( r.x,  0.0));
	let t2 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-r.x,  0.0));
	let t3 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( 0.0,  r.y));
	let t4 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( 0.0, -r.y));
	let t5 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( r.x,  r.y) * 0.7071);
	let t6 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-r.x,  r.y) * 0.7071);
	let t7 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( r.x, -r.y) * 0.7071);
	let t8 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-r.x, -r.y) * 0.7071);
	let blurred = (inputSample + t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8) / 9.0;

	// ----- Torn fiber rim: displaced-space void proximity -----
	//
	// A displaced pixel that is paper (edge alpha high) but within ~3 px of the
	// torn void gets the paper-fiber lightening — the 1–2 px white interior
	// fiber the collage aesthetic requires at a torn boundary.
	let fOff = 3.0 * refScale * pxUv;
	let fa1 = textureSample(layout.$.inputTexture, layout.$.samp, dispUv + vec2f( fOff.x,  0.0)).a;
	let fa2 = textureSample(layout.$.inputTexture, layout.$.samp, dispUv + vec2f(-fOff.x,  0.0)).a;
	let fa3 = textureSample(layout.$.inputTexture, layout.$.samp, dispUv + vec2f( 0.0,  fOff.y)).a;
	let fa4 = textureSample(layout.$.inputTexture, layout.$.samp, dispUv + vec2f( 0.0, -fOff.y)).a;
	// Void = alpha near ZERO, not merely partial — translucent material (washi
	// tape at ~0.65 alpha) is not a torn boundary and must never grow fiber.
	let voidProximity = 1.0 - smoothstep(0.05, 0.3, min(min(fa1, fa2), min(fa3, fa4)));
	let fiberMask = edgeSample.a * voidProximity;

	// ----- Per-mode results (premultiplied-alpha safe) -----
	//
	// The capture texture is PREMULTIPLIED (canvas alphaMode 'premultiplied';
	// AA/translucent pixels carry rgb already scaled by their alpha). Where a
	// branch re-derives a pixel's alpha but keeps its own colour, the colour
	// must be un-premultiplied first and re-premultiplied by the NEW alpha —
	// multiplying the stored rgb again would double-darken every AA pixel
	// (visible as a dark dashed ghost of the untreated silhouette).
	let inputOpaque = f32(inputSample.a > 0.5);
	let inputStraight = inputSample.rgb / max(inputSample.a, 0.0001);

	// clean — tighten the AA ramp; the band is deliberately wide enough that
	// every rotated-edge column keeps fractional coverage (R4: probe-edge-aa
	// coverage_ratio must stay 1.0 on a rotated card silhouette).
	let crispA = smoothstep(0.12, 0.88, inputSample.a);
	let cleanRgb = inputStraight * crispA;

	// soft — feathered alpha; interior keeps its own colour at the new alpha.
	let softA = blurred.a;
	let softRgb = mix(blurred.rgb, inputStraight * softA, inputOpaque);

	// irregular / torn — the displaced silhouette, CARVE-ONLY: the new alpha is
	// min(original, displaced), so the tear removes material inward from the
	// captured silhouette and never bulges past it. This is the physical claim
	// (a clipping is torn OUT of a sheet — the jag goes inward from the die
	// line) and it is also what keeps the pass composable: outward bulges
	// would resample baked composite seams into the paper interior as ghost
	// lines. Interior pixels keep their own colour re-premultiplied by the new
	// alpha — locally uniform alpha (glyphs over opaque paper, deep interior,
	// empty frame) degenerates to passthrough.
	//
	// Saturation gate: the tear belongs to the desaturated SUBSTRATE (cream
	// paper, dark ink), not to saturated overlay material composited into the
	// same flat capture (washi tape, kicker chips) — a thin tape strip is
	// otherwise all boundary-zone and gets eaten alive. Same heuristic family
	// as newspaper-physics' substrate mask, evaluated on the straight colour
	// so translucency doesn't skew it. Physically right too: the taped corner
	// is the part that doesn't tear. (A saturated-substrate Pack would need a
	// real element mask — the two-texture ShaderPass extension — before it can
	// tear; documented limitation, not a default.)
	let satStraight =
		max(max(inputStraight.r, inputStraight.g), inputStraight.b) -
		min(min(inputStraight.r, inputStraight.g), inputStraight.b);
	let carveMask = 1.0 - smoothstep(0.25, 0.4, satStraight);
	let dispA = mix(inputSample.a, min(inputSample.a, edgeSample.a), carveMask);
	var dispRgb = inputStraight * dispA;
	// Exposed inner fibers read WHITER than the printed stock (aesthetic.md:
	// "1–2px white interior fiber visible against the substrate") — near-white,
	// not the paper's own cream, or the rim disappears into the fill.
	let fiberColor = vec3f(0.985, 0.975, 0.945);
	// Fiber only grows on carved substrate (carveMask gates saturated overlay
	// material out of both the tear and the rim).
	dispRgb = mix(dispRgb, fiberColor * dispA, fiberMask * carveMask * layout.$.uniforms.fiber * 0.85);

	// ----- Hard-offset depth shadow (displaced modes) -----
	//
	// When the Pack pairs a displaced edge with a hard-offset depth rig, the
	// CanvasSource drops its CSS box-shadow (a baked box-shadow puts a straight
	// card/shadow seam INSIDE the flattened capture, which no alpha treatment
	// can cross) and this pass synthesizes the shadow instead: the same carve
	// (input ∧ displaced alpha) evaluated at uv − offset, reusing this pixel's
	// displacement vector — a congruent offset duplicate of the torn
	// silhouette, which is exactly what a screen-print offset shadow is.
	let offUv = vec2f(layout.$.uniforms.shadowDx, layout.$.uniforms.shadowDy) * refScale * pxUv;
	let inputOff = textureSample(layout.$.inputTexture, layout.$.samp, in.uv - offUv);
	let edgeOff = textureSample(layout.$.inputTexture, layout.$.samp, dispUv - offUv);
	// Only near-opaque material casts (the paper sheet). Translucent elements
	// (washi tape overhang at ~0.65 alpha) must not self-shadow — their own
	// dark dup would show through them as mud and push their saturation under
	// the newspaper-physics overlay-detection threshold.
	let shadowCaster = smoothstep(0.75, 0.92, min(inputOff.a, edgeOff.a));

	// ----- Bloom halo (glow-form depth, emissive Packs — dex 3x6uyx5h) -----
	//
	// A screen has no object floating above paper, so its depth is a centered
	// bloom, never an offset (resolve.ts § DepthGlow). Synthesized here for the
	// same reason as the offset dup: the CSS box-shadow lane died with the
	// intrinsically torn silhouette. Two 8-tap rings of the RAW silhouette
	// alpha approximate a blurred coverage field: the hot ring at the glow
	// radius, a wider naturally-dimmer skirt at 2.25× — the same two-layer
	// halo the CSS branch composed. Tear detail finer than the radius blurs
	// out of a halo by definition, so raw (undisplaced) alpha is sufficient.
	let gR = layout.$.uniforms.glowRadiusPx * refScale * pxUv;
	let g1 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( gR.x, 0.0)).a;
	let g2 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-gR.x, 0.0)).a;
	let g3 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(0.0,  gR.y)).a;
	let g4 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(0.0, -gR.y)).a;
	let g5 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( gR.x,  gR.y) * 0.7071).a;
	let g6 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-gR.x,  gR.y) * 0.7071).a;
	let g7 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( gR.x, -gR.y) * 0.7071).a;
	let g8 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-gR.x, -gR.y) * 0.7071).a;
	let hotCoverage = (g1 + g2 + g3 + g4 + g5 + g6 + g7 + g8) * 0.125;
	let sR = gR * 2.25;
	let k1s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( sR.x, 0.0)).a;
	let k2s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-sR.x, 0.0)).a;
	let k3s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(0.0,  sR.y)).a;
	let k4s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(0.0, -sR.y)).a;
	let k5s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( sR.x,  sR.y) * 0.7071).a;
	let k6s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-sR.x,  sR.y) * 0.7071).a;
	let k7s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( sR.x, -sR.y) * 0.7071).a;
	let k8s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-sR.x, -sR.y) * 0.7071).a;
	let skirtCoverage = (k1s + k2s + k3s + k4s + k5s + k6s + k7s + k8s) * 0.125;
	let glowIntensity = layout.$.uniforms.glowIntensity;
	let haloA = clamp(hotCoverage * glowIntensity + skirtCoverage * glowIntensity * 0.45, 0.0, 1.0);

	// Depth term under the card: the rig kind picks the form; both share the
	// rig colour and the premultiplied under-composite below.
	let isGlowRig = f32(layout.$.uniforms.shadowKind > 0.5);
	let shadowA = mix(shadowCaster, haloA, isGlowRig) * layout.$.uniforms.shadowStrength;
	let shadowRgb = vec3f(
		layout.$.uniforms.shadowR,
		layout.$.uniforms.shadowG,
		layout.$.uniforms.shadowB
	);

	// Torn card OVER its depth term (premultiplied over-operator).
	let dispOutRgb = dispRgb + shadowRgb * shadowA * (1.0 - dispA);
	let dispOutA = dispA + shadowA * (1.0 - dispA);

	let isClean = f32(mode < 0.5);
	let isSoft = f32(mode >= 0.5 && mode < 1.5);
	let isDisplaced = f32(mode >= 1.5);

	let outA = isClean * crispA + isSoft * softA + isDisplaced * dispOutA;
	let outRgb = isClean * cleanRgb + isSoft * softRgb + isDisplaced * dispOutRgb;
	return vec4f(outRgb, outA);
`;

export function createEdgeTreatmentPass(): ShaderPass<EdgeTreatmentTarget> {
	return {
		uniforms: EdgeTreatmentUniforms,
		wgsl,
		packUniforms(target, _bounds, ctx) {
			const { treatment, seedSource, shadow } = target;
			const canvasWidth = ctx.canvasWidth > 0 ? ctx.canvasWidth : FALLBACK_CANVAS_WIDTH;
			const canvasHeight = ctx.canvasHeight > 0 ? ctx.canvasHeight : FALLBACK_CANVAS_HEIGHT;

			if (treatment.mode === 'none') {
				// The dispatcher skips `none` before packing; this guard keeps the
				// pass total if it is ever driven directly.
				return {
					mode: EDGE_MODE_CODES.clean,
					amplitudePx: 0,
					wavelengthPx: 1,
					fiber: 0,
					seed: 0,
					canvasWidth,
					canvasHeight,
					shadowKind: 0,
					shadowDx: 0,
					shadowDy: 0,
					glowRadiusPx: 0,
					glowIntensity: 0,
					shadowR: 0,
					shadowG: 0,
					shadowB: 0,
					shadowStrength: 0
				};
			}

			return {
				mode: EDGE_MODE_CODES[treatment.mode],
				amplitudePx: treatment.amplitudePx,
				wavelengthPx: treatment.wavelengthPx,
				fiber: treatment.fiber,
				seed: hashStringToUnitInterval(seedSource),
				canvasWidth,
				canvasHeight,
				shadowKind: shadow?.kind === 'glow' ? 1 : 0,
				shadowDx: shadow?.kind === 'offset' ? shadow.dx : 0,
				shadowDy: shadow?.kind === 'offset' ? shadow.dy : 0,
				glowRadiusPx: shadow?.kind === 'glow' ? shadow.radiusPx : 0,
				glowIntensity: shadow?.kind === 'glow' ? shadow.intensity : 0,
				shadowR: shadow?.rgb[0] ?? 0,
				shadowG: shadow?.rgb[1] ?? 0,
				shadowB: shadow?.rgb[2] ?? 0,
				shadowStrength: shadow === null ? 0 : shadow.kind === 'offset' ? shadow.strength : 1
			};
		}
	};
}

export const edgeTreatmentPass = createEdgeTreatmentPass();
