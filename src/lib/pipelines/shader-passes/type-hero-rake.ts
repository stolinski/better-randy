import { d } from 'typegpu';

import { animState } from '$lib/platform/anim-state.svelte';
import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `type-hero-rake` — type-aware raked-light shader pass for the `type-hero`
 * Surface.
 *
 * Type-aware: samples the captured text's alpha at four small offsets,
 * computes the 2D alpha gradient (Sobel-style), and uses the gradient's
 * direction to apply directional rim light to letter edges facing the
 * implied light source (upper-left) plus slight shadow to edges facing
 * away. The lit and shadowed edges create the appearance of dimension on
 * the letterforms — display type as if catching raked theatrical light.
 *
 * Different from anything else in the engine: existing shader passes
 * (newspaper-physics, pullquote-photo-backdrop, chapter-card-backdrop,
 * title-sequence-drop, cinematic-lower-third-flare) operate on whole-pixel
 * samples without considering letterform geometry. This pass uses the
 * inputSample.alpha gradient as a letterform-edge proxy and lights it.
 *
 * Backdrop is restrained but graded: near-black vertical lean + drifting
 * warm/cool atmosphere bands + a particle field, finished with a corner
 * vignette and a filmic toe so the field reads as depth, not a flat void.
 * Type is the work; the graded backdrop stays behind it (the type composites
 * over the graded field at full strength, so grading never dims the hero).
 */

export const TypeHeroRakeUniforms = d.struct({
	seed: d.f32,
	progress: d.f32,
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	paperVisibility: d.f32
});

export interface TypeHeroRakeParams {
	seed: number;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
	paperVisibility: number;
}

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

const wgsl = /* wgsl */ `
	let seed = layout.$.uniforms.seed;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let t = layout.$.uniforms.progress;
	let pxUv = vec2f(1.0 / canvasW, 1.0 / canvasH);

	let aspectRatio = canvasW / canvasH;

	// ----- Backdrop -----
	//
	// Near-black base with a small vertical depth lean (top slightly cooler,
	// bottom slightly warmer). Backdrop stays out of the type's way; the
	// drift motion goes ON TOP of this base in the next stages.
	let topColor = vec3f(0.018, 0.020, 0.028);
	let bottomColor = vec3f(0.028, 0.022, 0.018);
	let baseColor = mix(topColor, bottomColor, in.uv.y);

	// ----- Drifting atmospheric bands -----
	//
	// Two soft elliptical glows (one warm, one cool) traverse the frame at
	// different rates. Creates the sense of light moving through atmospheric
	// haze BEHIND the type. The type stays anchored; the atmosphere drifts.
	let warmBandX = fract(t * 0.35) * 1.3 - 0.15;
	let warmBandDx = (in.uv.x - warmBandX);
	let warmBandDy = (in.uv.y - 0.55) * 0.6;
	let warmBandDist = sqrt(warmBandDx * warmBandDx + warmBandDy * warmBandDy) / 0.28;
	let warmBandStrength = max(0.0, 1.0 - warmBandDist);
	let warmBandColor = vec3f(0.72, 0.46, 0.24);
	let withWarmBand = baseColor + warmBandColor * warmBandStrength * 0.13;

	let coolBandX = fract(t * 0.22 + 0.5) * 1.3 - 0.15;
	let coolBandDx = (in.uv.x - coolBandX);
	let coolBandDy = (in.uv.y - 0.40) * 0.6;
	let coolBandDist = sqrt(coolBandDx * coolBandDx + coolBandDy * coolBandDy) / 0.32;
	let coolBandStrength = max(0.0, 1.0 - coolBandDist);
	let coolBandColor = vec3f(0.30, 0.42, 0.58);
	let withBothBands = withWarmBand + coolBandColor * coolBandStrength * 0.09;

	// ----- Drifting particle field -----
	//
	// 12 small bright specks at hash-derived starting positions, each
	// traversing the frame horizontally at its own seeded rate. Reads as
	// dust or motes drifting past the camera — film texture, not a pattern.
	// Edge-fade envelope hides the fract() wrap: particles fade to 0 near
	// the left and right frame borders so the hard wrap discontinuity is
	// invisible.
	var particles = 0.0;
	let edgeFadeW = 0.08;
	for (var pi = 0; pi < 12; pi = pi + 1) {
		let fp = f32(pi);
		let particleSeedY = fract(sin(fp * 17.3 + seed * 41.0) * 43758.5453);
		let particleSpeed = 0.06 + fract(sin(fp * 23.7 + seed * 11.0) * 43758.5453) * 0.16;
		let particlePhase = fract(sin(fp * 13.1 + seed * 29.0) * 43758.5453);
		let particleX = fract(t * particleSpeed + particlePhase);
		let particleFade = min(particleX / edgeFadeW, 1.0) * min((1.0 - particleX) / edgeFadeW, 1.0);
		let particleSize = 0.0028 + fract(sin(fp * 31.5) * 43758.5453) * 0.0024;
		let pdx = (in.uv.x - particleX) * aspectRatio;
		let pdy = in.uv.y - particleSeedY;
		let pd = sqrt(pdx * pdx + pdy * pdy);
		particles = particles + max(0.0, 1.0 - pd / particleSize) * particleFade;
	}
	let particleColor = vec3f(0.88, 0.80, 0.62);
	let withParticles = withBothBands + particleColor * particles * 0.55;

	let driftedBackdrop = withParticles;

	// ----- Anchored hero -----
	//
	// The type stays put. Drift motion belongs to the atmosphere, not the
	// subject — sliding the hero across the frame reads as amateur title
	// chrome, not as cinema. Sample the captured text texture at the
	// rendered pixel's own UV, no offset.
	let centreSample = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);

	// ----- Type-aware edge detection (Sobel-style on alpha) -----
	//
	// 4-sample alpha gradient via central differences. Offset 3 px so the
	// gradient captures the letterform's anti-aliased edge transition
	// (typically 1–2 px wide on rasterized text). Magnitude tells us we're
	// on an edge; direction tells us which way the edge faces.
	let edgeOffsetPx = 6.0;
	let edgeUv = edgeOffsetPx * pxUv;
	let aL = textureSample(layout.$.inputTexture, layout.$.samp, in.uv - vec2f(edgeUv.x, 0.0)).a;
	let aR = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(edgeUv.x, 0.0)).a;
	let aU = textureSample(layout.$.inputTexture, layout.$.samp, in.uv - vec2f(0.0, edgeUv.y)).a;
	let aD = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(0.0, edgeUv.y)).a;
	let alphaGradient = vec2f(aR - aL, aD - aU);
	let edgeMagnitude = length(alphaGradient);

	// ----- Raked directional light (gently oscillating key) -----
	//
	// Light angle oscillates ~30° across the upper-left quadrant over the
	// clip. As it shifts, different letterform edges catch the rim and the
	// counter-shadow side changes subtly. Pairs with the atmospheric drift
	// behind the type so the type itself appears statically lit by a slowly
	// moving key, not by a sweeping spotlight.
	let lightAngleBase = 3.92699; // atan2(-1, -1) — upper-left
	let lightAngleSwing = 0.25; // ~15° each side, ~30° total
	let lightAngle = lightAngleBase + sin(t * 6.28318 * 0.35) * lightAngleSwing;
	let lightDir = vec2f(cos(lightAngle), sin(lightAngle));
	// The alpha gradient points INTO the glyph (low alpha outside -> high inside),
	// i.e. it is the INWARD edge normal. The outward letterform-edge normal is its
	// negation; using it here puts the warm rim on the edges facing the key
	// (upper-left) and the carve on the away (lower-right) edges — a true raked
	// key, not the inverted emboss the un-negated gradient produced.
	let edgeNormal = select(vec2f(0.0), -alphaGradient / max(edgeMagnitude, 0.0001), edgeMagnitude > 0.0);
	let lightAlignment = dot(edgeNormal, lightDir);

	// On near-white display type a warm rim barely reads (white + warm clips
	// back to white), so the dimension is carried by a WARM rim on the lit edges
	// + a COOL multiplicative CARVE on the away edges — the warm-key / cool-
	// counter split that reads as theatrical raked light rather than a flat
	// neutral letterpress bevel. The pow() on the facing terms CONCENTRATES rim
	// and carve on the edges most squarely facing / away from the key (diagonal
	// strokes catch more than the obliquely-lit horizontals), so the band isn't
	// a uniform-width emboss outline. Turned up from the original (rim 1.6 /
	// shadow 0.55 of a 0.02 constant) which rendered to nothing — the rake is
	// this Surface's signature feature.
	let litFacing = max(0.0, lightAlignment);
	let awayFacing = max(0.0, -lightAlignment);
	let rimStrength = clamp(pow(litFacing, 1.3) * edgeMagnitude * 1.5, 0.0, 0.85);
	let carveStrength = clamp(pow(awayFacing, 1.45) * edgeMagnitude * 1.25, 0.0, 0.42);
	let rimTint = vec3f(0.17, 0.05, -0.12);    // warm amber on the lit edge
	let coolShadow = vec3f(-0.05, -0.02, 0.09); // cool counter-tone on the away edge

	// For fully-interior pixels (alpha = 1, gradient = 0) neither rim nor carve
	// fires — the fill stays clean; the dimension lives at the letterform edges.
	let textCore = centreSample.rgb;
	let textWithRim = textCore + rimTint * rimStrength;
	let textWithDimension = textWithRim * (1.0 - carveStrength) + coolShadow * carveStrength;
	// Surface fade on the GPU (DOM stays opaque; copyElementImageToTexture can't
	// rasterize CSS opacity<1 — see text-fade-bug-investigation.md F1). This also
	// makes the declared surface.exit actually fade the hero (was inert before).
	let textAlphaForComposite = centreSample.a * layout.$.uniforms.paperVisibility;

	// ----- Vignette + grain + filmic toe (backdrop grade; type composites on top) -----
	//
	// Vignette + toe apply to the backdrop only — the type is composited over
	// backdropGrained at full strength, so grading the field doesn't dim the hero.
	let centred = (in.uv - vec2f(0.5)) * vec2f(aspectRatio, 1.0);
	let vignette = smoothstep(0.42, 1.20, length(centred)) * 0.32;
	let vignetted = driftedBackdrop * (1.0 - vignette);
	let grainSeed = floor(in.uv * vec2f(canvasW, canvasH)) + vec2f(seed * 19.0 + t * 7.0, seed * 23.0 + t * 11.0);
	let grain = fract(sin(dot(grainSeed, vec2f(127.1, 311.7))) * 43758.5453) - 0.5;
	let grained = vignetted + vec3f(grain) * 0.022;
	// Filmic toe (black-lift): lift crushed shadows so the field reads as graded
	// depth rather than a flat void.
	let backdropGrained = pow(max(grained, vec3f(0.0)), vec3f(0.94));

	// ----- Composite text-with-dimension over backdrop -----
	//
	// Full-frame output: this composition always occupies the entire substrate
	// (preset carries backgroundFill to declare it as a bumper). Alpha = 1.0
	// keeps the transparent-export contract: the engine's backgroundFill
	// composite is the signal for the export lane, not a shader alpha floor.
	let backdropOpacity = 1.0;
	let finalRgb = mix(backdropGrained, textWithDimension, textAlphaForComposite);
	let finalAlpha = max(textAlphaForComposite, backdropOpacity);
	return vec4f(finalRgb, finalAlpha);
`;

export function createTypeHeroRakePass(): ShaderPass<SurfaceState> {
	return {
		uniforms: TypeHeroRakeUniforms,
		wgsl,
		packUniforms(target, bounds, ctx) {
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			return {
				seed,
				progress: ctx.progress,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				// Surface fade applied on the GPU (capture can't rasterize element
				// opacity<1). Read imperatively during render.
				paperVisibility: animState.paperVisibility
			} satisfies TypeHeroRakeParams;
		}
	};
}

export const typeHeroRake = createTypeHeroRakePass();
