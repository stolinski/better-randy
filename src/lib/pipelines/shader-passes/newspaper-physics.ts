import { d } from 'typegpu';

import {
	NEWSPRINT_PRINT_INK_HEX,
	NEWSPRINT_PRINT_SHADOW_HEX
} from '$lib/pipelines/surfaces/newspaper/newsprint-substrate';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { hexToRgbaFloat } from '$lib/utils/color';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `newspaper-physics` — single-pass surface shader carrying the two material
 * tells the `newspaper` Surface needs that the existing paper compositor
 * doesn't supply:
 *
 *   1. **Halftone dot screen at body sizes.** Mid-tones (gray ink) read as a
 *      pattern of dots whose coverage tracks the underlying luminance.
 *      Black ink (titles, byline) stays solid; near-white paper stays clean;
 *      gray mid-tones break into dots. Reference: aesthetic.md § Newspaper
 *      clipping ("halftone dot at body sizes").
 *   2. **Ink bleed at glyph edges.** A sub-pixel dilate + soft blur on dark
 *      glyphs simulates the way newsprint ink wicks into porous paper
 *      fibres. Quantified as one screen-space pixel of dilation followed by
 *      a 2-tap gaussian. Reference: aesthetic.md § Newspaper clipping
 *      ("ink bleed at glyph edges").
 *
 * Declared via the `SurfaceRenderer.shaderPass` field added in ADR-0008
 * (which mirrors ADR-0005's `OverlayRenderer.shaderPass` for the surface
 * layer). `Workspace` feeds this pass to the ShaderPassDispatcher between DOM
 * upload and the effect chain (invocation wired per ADR-0010).
 */

export const NewspaperPhysicsUniforms = d.struct({
	/**
	 * Per-instance seed in [0, 1) — derived from the preset id so multiple
	 * newspaper-surface compositions in one session don't share the same
	 * jitter pattern. Used to phase-shift the halftone grid and to seed the
	 * ink-bleed noise so adjacent glyph edges don't all wick identically.
	 */
	seed: d.f32,
	/**
	 * Halftone cell pitch in screen-space pixels. At 4K, ~8–12 px gives the
	 * "newsprint at arm's length" read; smaller pitches read as photo
	 * dithering, larger as poster halftone.
	 */
	halftonePitchPx: d.f32,
	/**
	 * Bleed dilation radius in screen-space pixels. ~1.0 px at 4K gives the
	 * soft glyph swell of porous-paper printing without losing legibility.
	 */
	bleedRadiusPx: d.f32,
	/** Composition canvas width / height in pixels, used to map UV to px. */
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	// Intrinsic newsprint print tints (partial substrate immunity, ADR-0039 §2
	// retired the Pack-routed `newspaper.print` Role): the halftone screen's
	// ink and the edge-occlusion shadow.
	inkColor: d.vec3f,
	shadowColor: d.vec3f
});

export interface NewspaperPhysicsParams {
	seed: number;
	halftonePitchPx: number;
	bleedRadiusPx: number;
	canvasWidth: number;
	canvasHeight: number;
	inkColor: ReturnType<typeof d.vec3f>;
	shadowColor: ReturnType<typeof d.vec3f>;
}

const HALFTONE_PITCH_PX = 10;
// Ink-bleed dilation in screen-space pixels. At 4K, ~3 px maps to ~0.5 mm
// of physical wicking if the composition is read as a real newspaper page
// (~60 cm wide → 6400 px/m). Below 2 px the effect is imperceptible at
// half-zoom previews; above 5 px glyphs lose legibility.
const BLEED_RADIUS_PX = 3;

/**
 * Fallback composition dimensions used only when the dispatcher hands the
 * pack function a zero-sized bounds rect (first-frame race before the
 * compositionElement.getBoundingClientRect() resolves). Steady-state reads
 * the actual canvas rect off `bounds` so the halftone pitch is correct on
 * both 3840×2160 and 2160×3840 transports, and on previews scaled below 4K.
 */
const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

// The print tints are document physics (ADR-0039 §2): every pack prints the
// same cool near-black ink and faintly warm occlusion shadow. Converted once
// from the substrate constants at module scope.
const [PRINT_INK_R, PRINT_INK_G, PRINT_INK_B] = hexToRgbaFloat(NEWSPRINT_PRINT_INK_HEX);
const [PRINT_SHADOW_R, PRINT_SHADOW_G, PRINT_SHADOW_B] = hexToRgbaFloat(
	NEWSPRINT_PRINT_SHADOW_HEX
);

const wgsl = /* wgsl */ `
	let seed = layout.$.uniforms.seed;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let pxUv = vec2f(1.0 / canvasW, 1.0 / canvasH);
	let bleedPx = max(layout.$.uniforms.bleedRadiusPx, 0.0);

	// ----- Surface-pixel mask -----
	//
	// The shader runs on the full composition texture (surface + any
	// overlays composited on top by HTML-in-canvas), but the halftone +
	// ink-bleed physics only belong on the newspaper substrate. Overlays
	// like washi tape carry high color saturation; the newspaper substrate
	// is desaturated (cream paper, dark ink, AA-grey edges between them).
	// A max-min saturation check separates the two without needing
	// surface-bounds or rotation uniforms. Transparent off-card pixels
	// (alpha < 0.5) are also skipped so the bleed never dilates into the
	// transparent frame.
	let chMax = max(max(inputSample.r, inputSample.g), inputSample.b);
	let chMin = min(min(inputSample.r, inputSample.g), inputSample.b);
	let centerSaturation = chMax - chMin;
	let isNewspaperPixel = centerSaturation < 0.3 && inputSample.a > 0.5;

	// ----- Ink bleed at glyph edges -----
	//
	// Sample the input texture at the centre plus four diagonal pixel
	// offsets; the dilated alpha is the max of the five, the dilated colour
	// is the alpha-weighted blend. Then a 1-tap gaussian softens the new
	// edge so the bleed reads as wicking ink, not as a hard outline.
	let bleedOffset = bleedPx * pxUv;
	let centre = inputSample;
	let s1 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( bleedOffset.x,  bleedOffset.y));
	let s2 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-bleedOffset.x,  bleedOffset.y));
	let s3 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( bleedOffset.x, -bleedOffset.y));
	let s4 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-bleedOffset.x, -bleedOffset.y));

	// Ink bleeds where it's already dark; bias by inverse-luminance so we
	// only dilate ink, not the warm-white substrate. Newsprint paper itself
	// doesn't "wick"; the ink does.
	let lumaCentre = dot(centre.rgb, vec3f(0.2126, 0.7152, 0.0722));
	let inkMask = 1.0 - smoothstep(0.45, 0.85, lumaCentre);

	let dilatedAlpha = max(max(centre.a, s1.a), max(max(s2.a, s3.a), s4.a));
	let dilatedRgb = (centre.rgb * centre.a + s1.rgb * s1.a + s2.rgb * s2.a + s3.rgb * s3.a + s4.rgb * s4.a)
		/ max(centre.a + s1.a + s2.a + s3.a + s4.a, 0.0001);

	let bledRgb = mix(centre.rgb, dilatedRgb, inkMask);
	let bledAlpha = mix(centre.a, dilatedAlpha, inkMask);
	var bled = vec4f(bledRgb, bledAlpha);

	// ----- Halftone dot screen at body sizes -----
	//
	// A small jittered grid; each cell carries a dot whose radius scales
	// with (1 - luminance) so darker source pixels paint a larger dot and
	// near-white paper leaves the cell empty. Seed phase-shifts the grid
	// per-instance.
	let pitch = max(layout.$.uniforms.halftonePitchPx, 1.0);
	let gridPos = vec2f(in.uv.x * canvasW / pitch + seed * 13.0,
	                    in.uv.y * canvasH / pitch + seed * 17.0);
	let cell = floor(gridPos);
	let cellLocal = fract(gridPos) - vec2f(0.5);
	let cellRadius = length(cellLocal);

	// Use the bled luminance so the screen tracks the ink-bled stage —
	// dilated glyph edges produce slightly larger dots, preserving the
	// "wet ink, slightly bloomed" appearance into the halftone pattern.
	let luma = dot(bled.rgb, vec3f(0.2126, 0.7152, 0.0722));

	// The screen only fires in mid-tones. Hard blacks (titles) and near-
	// whites (paper) pass through unmodified.
	let inMidtone = smoothstep(0.05, 0.30, luma) * (1.0 - smoothstep(0.70, 0.92, luma));
	let dotRadius = 0.50 * (1.0 - luma);
	let dotCoverage = smoothstep(dotRadius + 0.02, dotRadius - 0.02, cellRadius);

	// Mid-tone substitution: where the screen fires, replace the pixel
	// with a binary ink-or-paper choice based on the dot mask. Outside
	// mid-tones, keep the bled sample. Mix in by inMidtone so the screen
	// blends gracefully into the surrounding tone ramp. The halftone ink is
	// intrinsic newsprint physics (a cool near-black — newsprint-substrate.ts).
	let inkColor = layout.$.uniforms.inkColor;
	let paperColor = bled.rgb;
	let screened = mix(paperColor, inkColor, dotCoverage);
	let halftonedRgb = mix(bled.rgb, screened, inMidtone * bled.a);

	// ----- Camera defocus -----
	//
	// Subtle radial DOF: pixels far from the implied focal centre get a
	// progressively larger 4-tap box blur. Implies the paper was photographed
	// with a real aperture, not rasterized to vector edges. Holds the centre
	// of the composition sharp (where attention lives) and softens the corners
	// where the paper plane bends out of focus. Future refinement: derive the
	// focal centre from a focal slot rather than UV (0.5, 0.5).
	let focalCentre = vec2f(0.5, 0.5);
	let distFromFocal = distance(in.uv, focalCentre);
	let defocusMix = smoothstep(0.30, 0.70, distFromFocal);
	let defocusRadiusPx = defocusMix * 5.0;
	let defocusOffsetUv = defocusRadiusPx * pxUv;
	let d1 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( defocusOffsetUv.x,  defocusOffsetUv.y));
	let d2 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-defocusOffsetUv.x,  defocusOffsetUv.y));
	let d3 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( defocusOffsetUv.x, -defocusOffsetUv.y));
	let d4 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-defocusOffsetUv.x, -defocusOffsetUv.y));
	let defocusedRgb = (d1.rgb + d2.rgb + d3.rgb + d4.rgb) * 0.25;
	let mixedRgb = mix(halftonedRgb, defocusedRgb, defocusMix);

	// ----- Newsprint mottling -----
	//
	// Newsprint stock has uneven ink absorption at the ~5–15 cm scale on
	// the printed page (≈500–1500 px at 4K). The paper Pipeline's grain
	// covers fine + medium + fibre scales, but lacks this coarsest layer —
	// without it, newspaper paper reads as clean stock with grain rather
	// than as printed newsprint with ink density variation. Inline 2D value
	// noise: hash four corners of a unit cell, smoothstep-interp between
	// them so the mottling reads as organic patches rather than the
	// periodic banding a summed-sin approach produced. ±3% multiplicative
	// band; seed phase-shifts the noise grid per-instance.
	let noiseScale = 6.0;
	let noiseUv = in.uv * noiseScale + vec2f(seed * 13.0, seed * 19.0);
	let noiseCell = floor(noiseUv);
	let noiseF = fract(noiseUv);
	let noiseLerp = noiseF * noiseF * (3.0 - 2.0 * noiseF);
	let h00 = fract(sin(dot(noiseCell, vec2f(127.1, 311.7))) * 43758.5453);
	let h10 = fract(sin(dot(noiseCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let h01 = fract(sin(dot(noiseCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let h11 = fract(sin(dot(noiseCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let mottle = mix(mix(h00, h10, noiseLerp.x), mix(h01, h11, noiseLerp.x), noiseLerp.y);
	let mottledRgb = mixedRgb * (1.0 + (mottle - 0.5) * 0.06);

	// ----- Lens vignette -----
	//
	// Multiplicative corner darkening on newspaper pixels — same UV-distance
	// metric as defocus. Implies a real camera lens, not a flat rasterizer.
	// Zero at the focal centre; up to 18% darkening at the far corners.
	// Vignette never touches transparent or overlay pixels (the final select
	// gates this), so the composited NLE output sees darkening only on the
	// paper itself.
	let vignetteAmount = smoothstep(0.30, 0.85, distFromFocal) * 0.18;
	let outRgb = mottledRgb * (1.0 - vignetteAmount);

	// ----- Edge occlusion shadow -----
	//
	// For pixels outside the paper (alpha < 0.5), sample at progressively
	// larger offsets toward the implied light source (upper-left). If any
	// sample lands on an opaque newspaper pixel, this pixel is in the
	// paper's directional occlusion shadow — strongest near the paper edge,
	// fading with quadratic falloff to the shadow radius. The lit edge of
	// the paper (upper-left) gets no shadow because samples toward the light
	// find no paper there; the shadow side (lower-right) accumulates.
	//
	// Lives alongside (not replacing) the CSS hard offset shadow on the
	// newspaper CanvasSource — the hard offset is Syntax-aesthetic chrome
	// (ADR-0016 / Pack-side), while edge-occlusion is the material physics
	// dimension every Pack inherits.
	let lightDirUv = vec2f(-1.0, -1.0) * pxUv;
	let shadowRadiusPx = 60.0;
	let shadowStrength = 0.45;
	var shadowMask = 0.0;
	for (var i = 1; i <= 8; i = i + 1) {
		let t = f32(i) / 8.0;
		let offUv = lightDirUv * shadowRadiusPx * t;
		let probe = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + offUv);
		let probeMax = max(max(probe.r, probe.g), probe.b);
		let probeMin = min(min(probe.r, probe.g), probe.b);
		let probeSat = probeMax - probeMin;
		if (probe.a > 0.5 && probeSat < 0.3) {
			let strength = (1.0 - t) * (1.0 - t);
			shadowMask = max(shadowMask, strength);
		}
	}
	// Occlusion-shadow tint is intrinsic newsprint physics — faintly warm, the
	// way newsprint shadow picks up stock (newsprint-substrate.ts).
	let shadowColor = layout.$.uniforms.shadowColor;
	let isOutsidePaper = inputSample.a < 0.5;
	let inShadow = isOutsidePaper && shadowMask > 0.0;
	let shadowedAlpha = shadowMask * shadowStrength;

	// ----- Optical misregistration -----
	//
	// Print-plate misalignment on saturated pixels (highlights, marks, washi
	// tape) — sample R and B channels at small opposite offsets so the
	// saturated colour shows a chromatic fringe at its edges, the way real
	// newsprint shows a yellow/red plate offset from the dark ink plate.
	// Newspaper substrate pixels are unaffected (mix factor goes to 0 when
	// centerSaturation < 0.3). Loadbearing per ADR-0016 — chromatic offset
	// is banned as decorative chrome but required when claimed by an
	// Identity Spec dimension on a material-kind Surface.
	let regOffsetR = vec2f( 1.5,  0.5) * pxUv;
	let regOffsetB = vec2f(-1.5, -0.5) * pxUv;
	let rChannel = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + regOffsetR).r;
	let bChannel = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + regOffsetB).b;
	let isSaturatedPixel = centerSaturation > 0.3 && inputSample.a > 0.5;
	let chromaticRgb = vec3f(rChannel, inputSample.g, bChannel);
	let regShiftedRgb = mix(inputSample.rgb, chromaticRgb, f32(isSaturatedPixel));

	// Three-way composite: newspaper pixel takes halftone+bleed; outside-
	// paper-in-shadow takes the directional occlusion; saturated overlays
	// take the chromatic-offset misregistration; everything else passes
	// through unchanged.
	let finalRgb = select(
		select(regShiftedRgb, shadowColor, inShadow),
		outRgb,
		isNewspaperPixel
	);
	let finalAlpha = select(
		select(inputSample.a, shadowedAlpha, inShadow),
		bled.a,
		isNewspaperPixel
	);
	return vec4f(finalRgb, finalAlpha);
`;

export function createNewspaperPhysicsPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: NewspaperPhysicsUniforms,
		wgsl,
		packUniforms(target, bounds) {
			// Surface state carries no explicit id slot today; the preset id
			// reaches packUniforms via the SurfaceState's title — a stable
			// per-composition string. This keeps the seed deterministic
			// per-preset per Q6 / G9.
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);

			return {
				seed,
				halftonePitchPx: HALFTONE_PITCH_PX,
				bleedRadiusPx: BLEED_RADIUS_PX,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				inkColor: d.vec3f(PRINT_INK_R, PRINT_INK_G, PRINT_INK_B),
				shadowColor: d.vec3f(PRINT_SHADOW_R, PRINT_SHADOW_G, PRINT_SHADOW_B)
			} satisfies NewspaperPhysicsParams;
		}
	};
}

export const newspaperPhysics = createNewspaperPhysicsPass();
