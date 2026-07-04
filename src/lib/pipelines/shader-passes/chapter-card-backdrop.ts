import { d } from 'typegpu';

import { animState } from '$lib/platform/anim-state.svelte';
import { packState } from '$lib/platform/engine-state.svelte';
import { getPack } from '$lib/platform/packs/registry';
import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { resolveRoleColorFloat } from '$lib/utils/color';
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
	canvasHeight: d.f32,
	paperVisibility: d.f32,
	// Pack-routed backdrop tints (the `chapter-card.backdrop` Role): gradient
	// top/bottom and the off-frame key-light colour.
	topColor: d.vec3f,
	bottomColor: d.vec3f,
	lightColor: d.vec3f
});

export interface ChapterCardBackdropParams {
	seed: number;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
	paperVisibility: number;
	topColor: ReturnType<typeof d.vec3f>;
	bottomColor: ReturnType<typeof d.vec3f>;
	lightColor: ReturnType<typeof d.vec3f>;
}

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

// Neutral achromatic fallbacks when the active Pack doesn't claim the
// `chapter-card.backdrop` Role (ADR-0024 structural posture: a Pack opts INTO
// a backdrop character; absence never falls back to Syntax warmth). Each is
// the Rec.709 luminance of the original constant with zero chroma, so an
// unclaimed backdrop keeps its depth grading but goes desaturated-neutral.
const NEUTRAL_TOP_COLOR: readonly [number, number, number] = [0.0688, 0.0688, 0.0688];
const NEUTRAL_BOTTOM_COLOR: readonly [number, number, number] = [0.078, 0.078, 0.078];
const NEUTRAL_LIGHT_COLOR: readonly [number, number, number] = [0.748, 0.748, 0.748];

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
	let camT = t * t * (3.0 - 2.0 * t);
	let cameraDriftX = -0.16 * camT;
	let dollyScale = 1.0 + 0.12 * camT;
	let dollyCentre = vec2f(0.5);
	let dolliedUv = (in.uv - dollyCentre) / dollyScale + dollyCentre;
	let backgroundUv = vec2f(dolliedUv.x + cameraDriftX, dolliedUv.y);
	let noiseUv = vec2f(dolliedUv.x + cameraDriftX * 2.4, dolliedUv.y);

	// ----- Deep base with vertical depth gradient -----
	//
	// Gradient tints are Pack-routed (the chapter-card.backdrop Role) —
	// Syntax claims slate-to-charcoal; another Pack claims its own character
	// or gets the neutral achromatic fallback.
	let topColor = layout.$.uniforms.topColor;
	let bottomColor = layout.$.uniforms.bottomColor;
	let baseColor = mix(topColor, bottomColor, backgroundUv.y);

	// ----- Off-centre corner glow -----
	//
	// Single key light implied from upper-right, colour Pack-routed. Elliptical
	// falloff, aspect-corrected. Subtle (~14% lift max). The asymmetric
	// placement avoids any reading as a centred halo / Canva sunburst.
	let lightOrigin = vec2f(0.82, 0.18);
	let lightDelta = (backgroundUv - lightOrigin) * vec2f(aspectRatio, 1.0);
	let lightDist = length(lightDelta);
	let lightFalloff = 1.0 - smoothstep(0.08, 0.65, lightDist);
	let lightColor = layout.$.uniforms.lightColor;
	let lit = baseColor + lightColor * lightFalloff * 0.20;

	// ----- Atmospheric noise layer (parallax) -----
	//
	// Single octave of value noise drifting at the closer parallax rate.
	// Adds depth that the backdrop gradient alone can't.
	// Far octave: fine value noise drifting at the 2.4x noise rate.
	let farUv = noiseUv * 12.0 + vec2f(seed * 13.0, seed * 19.0);
	let farCell = floor(farUv);
	let farF = fract(farUv);
	let farL = farF * farF * (3.0 - 2.0 * farF);
	let f00 = fract(sin(dot(farCell, vec2f(127.1, 311.7))) * 43758.5453);
	let f10 = fract(sin(dot(farCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let f01 = fract(sin(dot(farCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let f11 = fract(sin(dot(farCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let farNoise = mix(mix(f00, f10, farL.x), mix(f01, f11, farL.x), farL.y);
	// Near octave: larger-scale, drifting FASTER (3.6x) — a distinct closer plane
	// the eye can track passing the far plane (real parallax, not one flat haze).
	let nearUv = vec2f(dolliedUv.x + cameraDriftX * 3.6, dolliedUv.y) * 4.0 + vec2f(seed * 7.0, seed * 29.0);
	let nearCell = floor(nearUv);
	let nearF = fract(nearUv);
	let nearL = nearF * nearF * (3.0 - 2.0 * nearF);
	let g00 = fract(sin(dot(nearCell, vec2f(127.1, 311.7))) * 43758.5453);
	let g10 = fract(sin(dot(nearCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let g01 = fract(sin(dot(nearCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let g11 = fract(sin(dot(nearCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let nearNoise = mix(mix(g00, g10, nearL.x), mix(g01, g11, nearL.x), nearL.y);
	let atmosphericNoise = farNoise * 0.45 + nearNoise * 0.55;
	let atmospheric = lit * (1.0 + (atmosphericNoise - 0.5) * 0.16);

	// ----- Heavy vignette -----
	//
	// Pulls attention inward; corners darken ~38%. Stronger than the pullquote
	// because chapter cards usually present a single subject with deep
	// peripheral fade.
	let centred = (in.uv - vec2f(0.5)) * vec2f(aspectRatio, 1.0);
	let centreDist = length(centred);
	let vignette = smoothstep(0.35, 1.15, centreDist) * 0.30;
	let vignetted = atmospheric * (1.0 - vignette);

	// ----- Fine film grain -----
	//
	// Single high-frequency hash noise, time-driven phase. ~2.5% amplitude.
	let grainSeed = floor(in.uv * vec2f(canvasW, canvasH)) + vec2f(seed * 19.0 + t * 7.0, seed * 23.0 + t * 11.0);
	let grain = fract(sin(dot(grainSeed, vec2f(127.1, 311.7))) * 43758.5453) - 0.5;
	let grained = vignetted + vec3f(grain) * 0.025;

	// ----- Filmic toe -----
	//
	// Gentle lift (gamma 0.92) so the graded frame keeps readable midtones in the
	// shadows instead of crushing the field to pure black — gives the scene depth
	// to read rather than "black + a warm smudge."
	let toned = pow(max(grained, vec3f(0.0)), vec3f(0.92));

	// ----- Composite text over backdrop -----
	//
	// Full-frame bumper (preset declares backgroundFill). Alpha = 1.0 so the
	// engine's backgroundFill composite signals the export lane; the shader does
	// not bake alpha into the channel. Text fades via paperVisibility on element.
	// Surface fade on the GPU. copyElementImageToTexture cannot capture a DOM
	// element's CSS opacity<1 (it captures transparent — see F1 in
	// docs/critic-captures/text-fade-bug-investigation.md), so the article stays
	// opaque and we fade the captured surface here by paperVisibility. This gives
	// a true gradual enter/exit instead of the binary snap CSS opacity produced.
	let surfaceAlpha = inputSample.a * layout.$.uniforms.paperVisibility;
	let backdropOpacity = 1.0;
	let finalRgb = mix(toned, inputSample.rgb, surfaceAlpha);
	let finalAlpha = max(surfaceAlpha, backdropOpacity);
	return vec4f(finalRgb, finalAlpha);
`;

export function createChapterCardBackdropPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: ChapterCardBackdropUniforms,
		// Paints the full-frame slate environment behind the type — the depth
		// stage's real backdrop plane at depth supersedes it (ADR-0028).
		environment: true,
		wgsl,
		packUniforms(target, bounds, ctx) {
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			// Uniforms pack per frame, so a Pack switch takes effect without extra
			// reactivity — read the active Pack imperatively here.
			const backdropRole = getPack(packState.slug).roles['chapter-card.backdrop'];
			return {
				seed,
				progress: ctx.progress,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				// Surface fade is applied here (GPU), not via DOM opacity — the capture
				// can't rasterize element opacity<1. Read imperatively during render.
				paperVisibility: animState.paperVisibility,
				topColor: d.vec3f(...resolveRoleColorFloat(backdropRole, 'top', NEUTRAL_TOP_COLOR)),
				bottomColor: d.vec3f(
					...resolveRoleColorFloat(backdropRole, 'bottom', NEUTRAL_BOTTOM_COLOR)
				),
				lightColor: d.vec3f(...resolveRoleColorFloat(backdropRole, 'light', NEUTRAL_LIGHT_COLOR))
			} satisfies ChapterCardBackdropParams;
		}
	};
}

export const chapterCardBackdrop = createChapterCardBackdropPass();
