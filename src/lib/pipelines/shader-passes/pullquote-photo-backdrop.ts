import { d } from 'typegpu';

import { animState } from '$lib/platform/anim-state.svelte';
import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `pullquote-photo-backdrop` — atmospheric substrate for the
 * `pullquote-on-photo` Surface.
 *
 * Design intent (v2 — replaced the warm radial halo aesthetic, which read as
 * Canva-template sunburst):
 *   - **Near-black base with subtle vertical depth gradient.** Top reads
 *     slightly cooler (deep navy), bottom slightly warmer (charcoal). Implies
 *     a sky/floor horizon without explicit elements.
 *   - **Directional implied light from upper-left.** Soft elliptical lift,
 *     ~15% amplitude, falls off well before reaching the centre. Lets shadow
 *     dominate the frame the way film lighting does.
 *   - **Fine isotropic film grain.** Single high-frequency hash noise at ~2.5%
 *     amplitude across the whole frame. Reads as film grain, not the clumpy
 *     multi-octave value noise the v1 used.
 *   - **Gentle corner vignette.** ~20% darkening at corners, no more — the
 *     base is already dark; aggressive vignetting would crush the frame.
 *
 * Text rendered by the Surface's CanvasSource sits on top of the backdrop
 * (composited via `inputSample.alpha`). The Surface's CanvasSource also paints
 * a dark scrim band behind the quote so text contrast holds regardless of
 * where directional light or grain land in any given frame.
 */

export const PullquotePhotoBackdropUniforms = d.struct({
	seed: d.f32,
	progress: d.f32,
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	paperVisibility: d.f32,
	enterStart: d.f32,
	enterDuration: d.f32
});

export interface PullquotePhotoBackdropParams {
	seed: number;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
	paperVisibility: number;
	enterStart: number;
	enterDuration: number;
}

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

const wgsl = /* wgsl */ `
	let seed = layout.$.uniforms.seed;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let t = layout.$.uniforms.progress;
	let aspectRatio = canvasW / canvasH;
	// Entrance window = the surface ENTER descriptor (a draggable timeline clip);
	// the rack-focus + light sweep run over it instead of hardcoded constants.
	let enterStart = layout.$.uniforms.enterStart;
	let enterDuration = max(layout.$.uniforms.enterDuration, 0.0001);
	let enterProg = clamp((t - enterStart) / enterDuration, 0.0, 1.0);

	// ----- Vertical depth gradient -----
	//
	// Near-black base with a small vertical lean: top reads slightly cooler,
	// bottom slightly warmer. Implies a horizon without drawing one.
	let topColor = vec3f(0.030, 0.034, 0.052);
	let bottomColor = vec3f(0.052, 0.044, 0.038);
	let baseColor = mix(topColor, bottomColor, in.uv.y);

	// ----- Directional implied light (upper-left) -----
	//
	// Soft elliptical lift centred at UV (0.18, 0.20). Falls off well before
	// reaching the composition's centre, leaving shadow to dominate the frame.
	// Aspect-corrected so the ellipse holds shape on both orientations.
	let lightOrigin = vec2f(0.18, 0.20);
	let lightDelta = (in.uv - lightOrigin) * vec2f(aspectRatio, 1.0);
	let lightDist = length(lightDelta);
	let lightFalloff = 1.0 - smoothstep(0.05, 0.55, lightDist);
	let lightColor = vec3f(0.78, 0.74, 0.62);
	let lit = baseColor + lightColor * lightFalloff * 0.14;

	// ----- Gentle corner vignette -----
	//
	// Base is already dark; a small additional vignette pulls attention
	// inward without crushing the frame. Aspect-corrected so it holds the
	// same shape on horizontal and vertical compositions.
	let centred = (in.uv - vec2f(0.5)) * vec2f(aspectRatio, 1.0);
	let centreDist = length(centred);
	let vignette = smoothstep(0.40, 1.10, centreDist) * 0.22;
	let vignetted = lit * (1.0 - vignette);

	// ----- Entrance light sweep -----
	//
	// During the first ~30% of progress, a soft vertical light band travels
	// left-to-right across the frame, washing brightness across the text as
	// it crosses. Adds time-driven life to an otherwise static backdrop.
	// Window: progress 0.00–0.30. Band centre x sweeps from -0.15 to 1.15
	// (slightly off-frame on each side so the sweep enters and exits cleanly).
	let sweepWindow = smoothstep(0.0, 0.3, enterProg) * (1.0 - smoothstep(0.85, 1.05, enterProg));
	let sweepCentreX = mix(-0.15, 1.15, enterProg);
	let sweepDist = abs(in.uv.x - sweepCentreX);
	let sweepFalloff = 1.0 - smoothstep(0.0, 0.18, sweepDist);
	let sweepColor = vec3f(0.92, 0.86, 0.74);
	let swept = vignetted + sweepColor * sweepFalloff * sweepWindow * 0.18;

	// ----- Fine film grain -----
	//
	// Single high-frequency hash noise. Period ≈ 1 px at 4K so the noise reads
	// as grain rather than a pattern. Time-driven phase adds subtle live
	// movement so the grain doesn't look frozen.
	let grainSeed = floor(in.uv * vec2f(canvasW, canvasH)) + vec2f(seed * 19.0 + t * 7.0, seed * 23.0 + t * 11.0);
	let grain = fract(sin(dot(grainSeed, vec2f(127.1, 311.7))) * 43758.5453) - 0.5;
	let grained = swept + vec3f(grain) * 0.025;

	// ----- Rack-focus disc-bokeh blur on the text layer -----
	//
	// During the surface's entrance window (progress 0.00 → 0.22), the text
	// resolves from heavily out-of-focus to pin-sharp. Implemented as a
	// 13-tap hexagonal disc blur on the inputSample (the captured DOM text):
	// 1 centre tap + 6 inner-ring (radius 0.5) + 6 outer-ring (radius 1.0).
	// Hexagonal pattern produces hex bokeh shape — cinematic, distinctly
	// not the Gaussian smear a CSS filter:blur would give. Disc radius
	// scales with (1 − sharpProgress) so blur snaps to zero by end of enter.
	// Same envelope drives an opacity / brightness lift so the focused
	// state reads slightly brighter than the unfocused state — matches the
	// way a real focal plane "pops" into clarity.
	let sharpProgress = pow(smoothstep(0.0, 1.0, enterProg), 0.6);
	let focusBlurPx = (1.0 - sharpProgress) * 22.0;
	let focusOpacity = 0.38 + sharpProgress * 0.62;
	let blurUvX = focusBlurPx / canvasW;
	let blurUvY = focusBlurPx / canvasH;

	// 6 hexagon vertices for the inner ring (radius 0.5).
	let inner0 = vec2f( 0.500,  0.000) * vec2f(blurUvX, blurUvY);
	let inner1 = vec2f( 0.250,  0.433) * vec2f(blurUvX, blurUvY);
	let inner2 = vec2f(-0.250,  0.433) * vec2f(blurUvX, blurUvY);
	let inner3 = vec2f(-0.500,  0.000) * vec2f(blurUvX, blurUvY);
	let inner4 = vec2f(-0.250, -0.433) * vec2f(blurUvX, blurUvY);
	let inner5 = vec2f( 0.250, -0.433) * vec2f(blurUvX, blurUvY);
	// 6 hexagon vertices for the outer ring (radius 1.0).
	let outer0 = vec2f( 1.000,  0.000) * vec2f(blurUvX, blurUvY);
	let outer1 = vec2f( 0.500,  0.866) * vec2f(blurUvX, blurUvY);
	let outer2 = vec2f(-0.500,  0.866) * vec2f(blurUvX, blurUvY);
	let outer3 = vec2f(-1.000,  0.000) * vec2f(blurUvX, blurUvY);
	let outer4 = vec2f(-0.500, -0.866) * vec2f(blurUvX, blurUvY);
	let outer5 = vec2f( 0.500, -0.866) * vec2f(blurUvX, blurUvY);

	let s0  = inputSample;
	let s1  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + inner0);
	let s2  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + inner1);
	let s3  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + inner2);
	let s4  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + inner3);
	let s5  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + inner4);
	let s6  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + inner5);
	let s7  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + outer0);
	let s8  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + outer1);
	let s9  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + outer2);
	let s10 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + outer3);
	let s11 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + outer4);
	let s12 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + outer5);

	// Alpha-weighted blend so transparent samples don't dilute opaque text colour.
	let sumAlpha = s0.a + s1.a + s2.a + s3.a + s4.a + s5.a + s6.a
		+ s7.a + s8.a + s9.a + s10.a + s11.a + s12.a;
	let sumWeightedRgb = s0.rgb * s0.a + s1.rgb * s1.a + s2.rgb * s2.a + s3.rgb * s3.a
		+ s4.rgb * s4.a + s5.rgb * s5.a + s6.rgb * s6.a + s7.rgb * s7.a
		+ s8.rgb * s8.a + s9.rgb * s9.a + s10.rgb * s10.a + s11.rgb * s11.a
		+ s12.rgb * s12.a;
	let blurredRgb = sumWeightedRgb / max(sumAlpha, 0.0001);
	let blurredAlpha = sumAlpha / 13.0;

	// During the focus pull the entire text layer dims slightly (lower opacity
	// of the captured DOM); on lock it returns to full strength.
	let textRgb = blurredRgb * focusOpacity;
	// Surface fade on the GPU: copyElementImageToTexture can't rasterize a DOM
	// element's CSS opacity<1 (it captures transparent — see F1 in
	// docs/critic-captures/text-fade-bug-investigation.md), so the article stays
	// opaque and the captured text fades here by paperVisibility — gradual
	// enter/exit instead of the binary snap CSS opacity produced.
	let textAlpha = blurredAlpha * focusOpacity * layout.$.uniforms.paperVisibility;

	// ----- Composite text over backdrop -----
	//
	// Full-frame bumper (preset declares backgroundFill). Alpha = 1.0 so the
	// engine's backgroundFill composite signals the export lane; the shader does
	// not bake alpha into the channel.
	let backdropOpacity = 1.0;
	let finalRgb = mix(grained, textRgb, textAlpha);
	let finalAlpha = max(textAlpha, backdropOpacity);
	return vec4f(finalRgb, finalAlpha);
`;

export function createPullquotePhotoBackdropPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: PullquotePhotoBackdropUniforms,
		wgsl,
		packUniforms(target, bounds, ctx) {
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			return {
				seed,
				progress: ctx.progress,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				// Surface fade is applied here (GPU), not via DOM opacity — the
				// capture can't rasterize element opacity<1. Read imperatively.
				paperVisibility: animState.paperVisibility,
				// Rack-focus + light sweep run over the surface ENTER window (a
				// draggable timeline clip), not hardcoded progress constants.
				enterStart: target.enter?.start ?? 0,
				enterDuration: target.enter?.duration ?? 0.22
			} satisfies PullquotePhotoBackdropParams;
		}
	};
}

export const pullquotePhotoBackdrop = createPullquotePhotoBackdropPass();
