import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `chapter-card-backdrop` — documentary-style chapter-break substrate.
 *
 * What distinguishes this from the pullquote backdrop:
 *   - **Slow camera push.** UV samples drift horizontally over the full clip,
 *     simulating a slow dolly past the subject. The drift is shallow (~4%
 *     of frame width) so it never reads as movement-for-its-own-sake.
 *   - **Two-layer parallax.** Background gradient drifts at the camera rate;
 *     the noise layer drifts faster, simulating closer atmospheric depth.
 *     Reads as depth without explicit geometry.
 *   - **Off-centre warm corner glow.** Single warm light source from upper-
 *     right, not a radial halo. Implies a key light off-frame, the way
 *     documentary chapter cards use practical lighting cues.
 *   - **Deep cool base.** Slate / desaturated navy rather than amber — avoids
 *     the Hollywood orange-and-teal cliché.
 *   - **No focus-pull blur on text.** Chapter cards typically present the
 *     text in clear focus from frame zero (text-anim provides reveal); the
 *     backdrop motion does the work of feeling cinematic.
 */

export const ChapterCardBackdropUniforms = d.struct({
	seed: d.f32,
	progress: d.f32,
	canvasWidth: d.f32,
	canvasHeight: d.f32
});

export interface ChapterCardBackdropParams {
	seed: number;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
}

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

const wgsl = /* wgsl */ `
	let seed = layout.$.uniforms.seed;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let t = layout.$.uniforms.progress;
	let aspectRatio = canvasW / canvasH;

	// ----- Slow camera push (UV drift + dolly-in scale) -----
	//
	// Two parallax layers: backgroundUv drifts at the camera rate (~10% of
	// frame width over the full clip); noiseUv drifts at ~2.4× that rate so
	// the closer atmospheric layer passes faster. The whole backdrop also
	// gets a subtle scale-in (1.0 → 1.06), reinforcing the camera-push read.
	// Each layer samples through its own UV transform — the text on top is
	// untouched, so only the backdrop appears to move.
	let cameraDriftX = -0.10 * t;
	let dollyScale = 1.0 + 0.06 * t;
	let dollyCentre = vec2f(0.5);
	let dolliedUv = (in.uv - dollyCentre) / dollyScale + dollyCentre;
	let backgroundUv = vec2f(dolliedUv.x + cameraDriftX, dolliedUv.y);
	let noiseUv = vec2f(dolliedUv.x + cameraDriftX * 2.4, dolliedUv.y);

	// ----- Deep cool base with vertical depth gradient -----
	//
	// Slate at the top, slightly warmer charcoal at the bottom. Cool palette
	// avoids the orange-and-teal cliché while still grading the frame.
	let topColor = vec3f(0.040, 0.052, 0.072);
	let bottomColor = vec3f(0.064, 0.054, 0.046);
	let baseColor = mix(topColor, bottomColor, backgroundUv.y);

	// ----- Off-centre warm corner glow -----
	//
	// Single warm key light implied from upper-right. Elliptical falloff,
	// aspect-corrected. Subtle (~14% lift max). The asymmetric placement
	// avoids any reading as a centred halo / Canva sunburst.
	let lightOrigin = vec2f(0.82, 0.18);
	let lightDelta = (backgroundUv - lightOrigin) * vec2f(aspectRatio, 1.0);
	let lightDist = length(lightDelta);
	let lightFalloff = 1.0 - smoothstep(0.08, 0.65, lightDist);
	let lightColor = vec3f(0.94, 0.72, 0.46);
	let lit = baseColor + lightColor * lightFalloff * 0.14;

	// ----- Atmospheric noise layer (parallax) -----
	//
	// Single octave of value noise drifting at the closer parallax rate.
	// Adds depth that the backdrop gradient alone can't.
	let noiseScale = 12.0;
	let nUv = noiseUv * noiseScale + vec2f(seed * 13.0, seed * 19.0);
	let nCell = floor(nUv);
	let nF = fract(nUv);
	let nL = nF * nF * (3.0 - 2.0 * nF);
	let h00 = fract(sin(dot(nCell, vec2f(127.1, 311.7))) * 43758.5453);
	let h10 = fract(sin(dot(nCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let h01 = fract(sin(dot(nCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let h11 = fract(sin(dot(nCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let atmosphericNoise = mix(mix(h00, h10, nL.x), mix(h01, h11, nL.x), nL.y);
	let atmospheric = lit * (1.0 + (atmosphericNoise - 0.5) * 0.10);

	// ----- Heavy vignette -----
	//
	// Pulls attention inward; corners darken ~38%. Stronger than the pullquote
	// because chapter cards usually present a single subject with deep
	// peripheral fade.
	let centred = (in.uv - vec2f(0.5)) * vec2f(aspectRatio, 1.0);
	let centreDist = length(centred);
	let vignette = smoothstep(0.30, 1.05, centreDist) * 0.38;
	let vignetted = atmospheric * (1.0 - vignette);

	// ----- Fine film grain -----
	//
	// Single high-frequency hash noise, time-driven phase. ~2.5% amplitude.
	let grainSeed = floor(in.uv * vec2f(canvasW, canvasH)) + vec2f(seed * 19.0 + t * 7.0, seed * 23.0 + t * 11.0);
	let grain = fract(sin(dot(grainSeed, vec2f(127.1, 311.7))) * 43758.5453) - 0.5;
	let grained = vignetted + vec3f(grain) * 0.025;

	// ----- Composite text over backdrop -----
	//
	// Full-frame bumper (preset declares backgroundFill). Alpha = 1.0 so the
	// engine's backgroundFill composite signals the export lane; the shader does
	// not bake alpha into the channel. Text fades via paperVisibility on element.
	let backdropOpacity = 1.0;
	let finalRgb = mix(grained, inputSample.rgb, inputSample.a);
	let finalAlpha = max(inputSample.a, backdropOpacity);
	return vec4f(finalRgb, finalAlpha);
`;

export function createChapterCardBackdropPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: ChapterCardBackdropUniforms,
		wgsl,
		packUniforms(target, bounds, ctx) {
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			return {
				seed,
				progress: ctx.progress,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT
			} satisfies ChapterCardBackdropParams;
		}
	};
}

export const chapterCardBackdrop = createChapterCardBackdropPass();
