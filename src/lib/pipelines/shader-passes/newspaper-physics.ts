import { d } from 'typegpu';

import { NEWSPRINT_PRINT_INK_HEX } from '$lib/pipelines/surfaces/newspaper/newsprint-substrate';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { hexToRgbaFloat } from '$lib/utils/color';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `newspaper-physics` — single-pass surface shader carrying the material tells
 * of a broadsheet page photographed up close (ADR-0056) that the paper
 * compositor doesn't supply:
 *
 *   1. **The camera push.** The captured page is resampled through a slow
 *      zoom + drift driven by the timeline's progress. The DOM stays static
 *      (no per-frame CSS transform — a scaling text layer re-rasterizes and
 *      pops, and every mark rect would shift), so the push is a pure texture
 *      resample here, frame-deterministic.
 *   2. **Halftone dot screen at body sizes.** Mid-tones (gray ink) read as a
 *      pattern of dots whose coverage tracks the underlying luminance. Black
 *      ink (headline) stays solid; near-white paper stays clean.
 *   3. **Ink bleed at glyph edges.** A sub-pixel darkening dilation on dark
 *      glyphs simulates the way newsprint ink wicks into porous paper fibres.
 *   4. **Newsprint mottling** and **scan grain** — the sheet's own print
 *      texture. Both, like the halftone, are computed in PAGE space (the
 *      resampled coordinate), so they travel with the page under the push
 *      instead of crawling over it as a screen-fixed pattern.
 *   5. **Lens optics.** Radial defocus and a lens vignette in SCREEN space —
 *      the frame is the photograph, so these apply to every opaque pixel,
 *      highlighter included.
 *
 * Declared via the `SurfaceRenderer.shaderPass` field added in ADR-0008.
 * `Workspace` feeds this pass to the ShaderPassDispatcher between DOM upload
 * and the effect chain (invocation wired per ADR-0010).
 */

export const NewspaperPhysicsUniforms = d.struct({
	/**
	 * Per-instance seed in [0, 1) — derived from the headline so multiple
	 * newspaper compositions in one session don't share the same jitter
	 * pattern. Phase-shifts the halftone grid, the mottling lattice, and the
	 * scan grain.
	 */
	seed: d.f32,
	/**
	 * Halftone cell pitch in screen-space pixels. At 4K, ~8–12 px gives the
	 * "newsprint at arm's length" read; smaller pitches read as photo
	 * dithering, larger as poster halftone.
	 */
	halftonePitchPx: d.f32,
	/** Bleed dilation radius in screen-space pixels. */
	bleedRadiusPx: d.f32,
	/** Composition canvas width / height in pixels, used to map UV to px. */
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	/**
	 * Camera push for this frame: the zoom about the frame centre (≥ 1) and
	 * the sampling drift in UV, both pure functions of timeline progress.
	 */
	pushScale: d.f32,
	driftX: d.f32,
	driftY: d.f32,
	// Intrinsic newsprint print tint: the halftone screen's ink.
	inkColor: d.vec3f
});

export interface NewspaperPhysicsParams {
	seed: number;
	halftonePitchPx: number;
	bleedRadiusPx: number;
	canvasWidth: number;
	canvasHeight: number;
	pushScale: number;
	driftX: number;
	driftY: number;
	inkColor: ReturnType<typeof d.vec3f>;
}

const HALFTONE_PITCH_PX = 10;
// Ink-bleed dilation in screen-space pixels. At 4K, 2 px maps to ~0.3 mm of
// physical wicking if the composition is read as a real newspaper page
// (~60 cm wide → 6400 px/m). Below 1.5 px the effect is imperceptible at
// half-zoom previews; at 3 px and up the body serif reads a weight heavier
// than it was set.
const BLEED_RADIUS_PX = 2;

/**
 * The camera push (identity § camera-push): a continuous 2 % zoom about the
 * frame centre with a hint of leftward drift over the whole piece. Expressed
 * as a resample of the captured page, so the page and everything printed on
 * it — marks included — move together, and the sampled window never leaves
 * the texture (at progress p the far edge sits at 1 − 0.006 p).
 */
const CAMERA_PUSH_SCALE = 0.02;
const CAMERA_PUSH_DRIFT = 0.004;

/**
 * Fallback composition dimensions used only when the dispatcher hands the
 * pack function a zero-sized bounds rect (first-frame race before the
 * compositionElement.getBoundingClientRect() resolves). Steady-state reads
 * the actual canvas rect off `bounds` so the halftone pitch is correct on
 * both 3840×2160 and 2160×3840 transports, and on previews scaled below 4K.
 */
const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

// The print tint is document physics: every pack prints the same cool
// near-black halftone ink. Converted once from the substrate constant.
const [PRINT_INK_R, PRINT_INK_G, PRINT_INK_B] = hexToRgbaFloat(NEWSPRINT_PRINT_INK_HEX);

const wgsl = /* wgsl */ `
	let seed = layout.$.uniforms.seed;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let canvasPx = vec2f(canvasW, canvasH);
	let pxUv = vec2f(1.0 / canvasW, 1.0 / canvasH);
	let bleedPx = max(layout.$.uniforms.bleedRadiusPx, 0.0);

	// ----- Camera push (page space) -----
	//
	// Where on the captured page this screen pixel looks: a zoom about the
	// frame centre plus the drift. Every ink/print term below reads the page
	// through pageUv; the lens terms (defocus, vignette) stay in screen space.
	let pushScale = max(layout.$.uniforms.pushScale, 1.0);
	let drift = vec2f(layout.$.uniforms.driftX, layout.$.uniforms.driftY);
	let pageUv = vec2f(0.5) + (in.uv - vec2f(0.5)) / pushScale + drift;
	let pagePx = pageUv * canvasPx;
	let page = textureSample(layout.$.inputTexture, layout.$.samp, pageUv);

	// ----- Pixel classes -----
	//
	// The page overshoots the frame, so every pixel with alpha is part of the
	// photograph and takes the camera optics (defocus, vignette, scan grain).
	// The ink physics (bleed, halftone) belong only to ink on paper: the
	// desaturated pixels. The marker highlight the annotation layer multiplies
	// onto the page is saturated and is left with its clean marker edge.
	let chMax = max(max(page.r, page.g), page.b);
	let chMin = min(min(page.r, page.g), page.b);
	let centerSaturation = chMax - chMin;
	let isPhotographedPixel = page.a > 0.5;
	let isInkOnPaper = centerSaturation < 0.3 && isPhotographedPixel;

	// ----- Ink bleed at glyph edges -----
	//
	// Ink wicks OUTWARD into the paper: every pixel takes on a share of the
	// darkest ink within the bleed radius (a component-wise min over the
	// centre and four diagonal taps), so paper touching a stroke darkens and
	// the stroke grows by a soft ramp. Never the other way round — averaging
	// the neighbourhood would lighten the stroke from the inside and print a
	// grey rim around every glyph.
	let bleedOffset = bleedPx * pxUv;
	let s1 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f( bleedOffset.x,  bleedOffset.y));
	let s2 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(-bleedOffset.x,  bleedOffset.y));
	let s3 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f( bleedOffset.x, -bleedOffset.y));
	let s4 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(-bleedOffset.x, -bleedOffset.y));
	let darkestRgb = min(min(page.rgb, s1.rgb), min(min(s2.rgb, s3.rgb), s4.rgb));
	let dilatedAlpha = max(max(page.a, s1.a), max(max(s2.a, s3.a), s4.a));

	// Only paper next to ink wicks: a pixel already at ink density has
	// nothing darker to take on, and open paper far from a stroke finds only
	// paper in its taps (the min is a no-op there).
	let bleedStrength = 0.4;
	let bled = vec4f(mix(page.rgb, darkestRgb, bleedStrength), max(page.a, dilatedAlpha * bleedStrength));

	// ----- Halftone dot screen at body sizes -----
	//
	// A small jittered grid in PAGE space; each cell carries a dot whose
	// radius scales with (1 - luminance) so darker source pixels paint a
	// larger dot and near-white paper leaves the cell empty. Seed phase-shifts
	// the grid per-instance.
	let pitch = max(layout.$.uniforms.halftonePitchPx, 1.0);
	let gridPos = pagePx / pitch + vec2f(seed * 13.0, seed * 17.0);
	let cellLocal = fract(gridPos) - vec2f(0.5);
	let cellRadius = length(cellLocal);

	// Use the bled luminance so the screen tracks the ink-bled stage —
	// dilated glyph edges produce slightly larger dots, preserving the
	// "wet ink, slightly bloomed" appearance into the halftone pattern.
	let luma = dot(bled.rgb, vec3f(0.2126, 0.7152, 0.0722));

	// The screen only fires in mid-tones: the anti-aliased ramp at a stroke's
	// edge. Hard blacks (headline interiors) pass through, and so does the
	// open sheet — grey newsprint sits at luma ≈ 0.70–0.76 after the
	// compositor's grain, so the upper band closes well below it.
	let inMidtone = smoothstep(0.05, 0.30, luma) * (1.0 - smoothstep(0.50, 0.64, luma));
	let dotRadius = 0.50 * (1.0 - luma);
	let dotCoverage = smoothstep(dotRadius + 0.02, dotRadius - 0.02, cellRadius);

	// Mid-tone substitution: where the screen fires, replace the pixel with a
	// binary ink-or-paper choice based on the dot mask, mixed in by inMidtone
	// so the screen blends into the surrounding tone ramp. Only ink on paper
	// screens — the marker highlight keeps its clean edge.
	let inkColor = layout.$.uniforms.inkColor;
	let screened = mix(bled.rgb, inkColor, dotCoverage);
	let halftonedRgb = mix(bled.rgb, screened, inMidtone * bled.a * f32(isInkOnPaper));
	let inkedRgb = select(page.rgb, halftonedRgb, isInkOnPaper);
	let inkedAlpha = select(page.a, bled.a, isInkOnPaper);

	// ----- Camera defocus -----
	//
	// Radial DOF: pixels far from the frame centre get a progressively larger
	// 9-tap blur (centre, an axis ring, and a tighter diagonal ring, weighted
	// like a small gaussian). Implies the page was photographed with a real
	// macro aperture, not rasterized to vector edges. Holds the centre sharp
	// (where the headline lives) and softens the corners where the page plane
	// bends out of focus. The ring radius stays small — a few taps spread
	// wide read as a double image, not a blur. Screen-space distance; taps
	// read the page.
	let focalCentre = vec2f(0.5, 0.5);
	let distFromFocal = distance(in.uv, focalCentre);
	let defocusMix = smoothstep(0.32, 0.72, distFromFocal);
	let defocusRadiusPx = defocusMix * 4.5;
	let axisUv = defocusRadiusPx * pxUv;
	let diagUv = axisUv * 0.7;
	let a1 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f( axisUv.x, 0.0));
	let a2 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(-axisUv.x, 0.0));
	let a3 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(0.0,  axisUv.y));
	let a4 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(0.0, -axisUv.y));
	let g1 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f( diagUv.x,  diagUv.y));
	let g2 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(-diagUv.x,  diagUv.y));
	let g3 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f( diagUv.x, -diagUv.y));
	let g4 = textureSample(layout.$.inputTexture, layout.$.samp, pageUv + vec2f(-diagUv.x, -diagUv.y));
	let defocusedRgb = page.rgb * 0.25
		+ (a1.rgb + a2.rgb + a3.rgb + a4.rgb) * 0.125
		+ (g1.rgb + g2.rgb + g3.rgb + g4.rgb) * 0.0625;
	let mixedRgb = mix(inkedRgb, defocusedRgb, defocusMix);

	// ----- Newsprint mottling -----
	//
	// Newsprint stock has uneven ink absorption at the ~5–15 cm scale on the
	// printed page (≈500–1500 px at 4K). The paper Pipeline's grain covers
	// fine + medium + fibre scales, but lacks this coarsest layer — without it
	// the sheet reads as clean stock with grain rather than printed newsprint
	// with ink density variation. Inline 2D value noise in PAGE space: hash
	// four corners of a unit cell, smoothstep-interp between them so the
	// mottling reads as organic patches rather than periodic banding. ±3%
	// multiplicative band; seed phase-shifts the noise grid per-instance.
	let noiseScale = 6.0;
	let noiseUv = pageUv * noiseScale + vec2f(seed * 13.0, seed * 19.0);
	let noiseCell = floor(noiseUv);
	let noiseF = fract(noiseUv);
	let noiseLerp = noiseF * noiseF * (3.0 - 2.0 * noiseF);
	let h00 = fract(sin(dot(noiseCell, vec2f(127.1, 311.7))) * 43758.5453);
	let h10 = fract(sin(dot(noiseCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let h01 = fract(sin(dot(noiseCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let h11 = fract(sin(dot(noiseCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let mottle = mix(mix(h00, h10, noiseLerp.x), mix(h01, h11, noiseLerp.x), noiseLerp.y);
	let mottledRgb = mixedRgb * (1.0 + (mottle - 0.5) * 0.06);

	// ----- Scan grain -----
	//
	// The finest grain octave: a static per-2px-cell hash in PAGE space, ±2.5%
	// luma — the tooth of the sheet as photographed. Static (seeded, not
	// per-frame) and page-anchored, so it rides the push instead of crawling
	// across the text as a screen-fixed pattern.
	let grainCell = floor(pagePx / 2.0) + vec2f(seed * 7.0, seed * 3.0);
	let grainHash = fract(sin(dot(grainCell, vec2f(12.9898, 78.233))) * 43758.5453);
	let grainedRgb = mottledRgb * (1.0 + (grainHash - 0.5) * 0.05);

	// ----- Lens vignette -----
	//
	// Multiplicative corner darkening across the photographed frame — same
	// screen-space UV-distance metric as defocus. Zero at the centre; up to
	// 27% darkening at the far corners, the way the direction plates fall
	// off. Alpha is untouched.
	let vignetteAmount = smoothstep(0.25, 0.85, distFromFocal) * 0.27;
	let opticsRgb = grainedRgb * (1.0 - vignetteAmount);

	let finalRgb = select(page.rgb, opticsRgb, isPhotographedPixel);
	return vec4f(finalRgb, inkedAlpha);
`;

export function createNewspaperPhysicsPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: NewspaperPhysicsUniforms,
		wgsl,
		packUniforms(target, bounds, ctx) {
			// Surface state carries no explicit id slot today; the preset id
			// reaches packUniforms via the SurfaceState's title — a stable
			// per-composition string. This keeps the seed deterministic
			// per-preset per Q6 / G9.
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			// The push is a pure function of the paused-timeline progress the
			// dispatcher forwards — the same value preview and export scrub to.
			const progress = Math.min(1, Math.max(0, ctx.progress));

			return {
				seed,
				halftonePitchPx: HALFTONE_PITCH_PX,
				bleedRadiusPx: BLEED_RADIUS_PX,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				pushScale: 1 + CAMERA_PUSH_SCALE * progress,
				// Sampling further right moves the page left on screen.
				driftX: CAMERA_PUSH_DRIFT * progress,
				driftY: 0,
				inkColor: d.vec3f(PRINT_INK_R, PRINT_INK_G, PRINT_INK_B)
			} satisfies NewspaperPhysicsParams;
		}
	};
}

export const newspaperPhysics = createNewspaperPhysicsPass();
