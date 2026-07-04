import { d } from 'typegpu';

import { animState } from '$lib/platform/anim-state.svelte';
import { packState } from '$lib/platform/engine-state.svelte';
import { getPack } from '$lib/platform/packs/registry';
import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
import { resolveRoleColorFloat } from '$lib/utils/color';
import { hashStringToUnitInterval } from '$lib/utils/seeded';

/**
 * `title-sequence-drop` — hero title moment for an episode / chapter opener.
 *
 * The shader does all of the motion. The DOM renders the text at its resting
 * position, statically; the shader animates it via UV sampling so the text
 * appears to drop in from above with a motion-blur trail, hit a clear impact
 * frame with a brief brightness flash, and then settle.
 *
 * What the shader carries:
 *   - **Graded cinema backdrop.** Deep black with a vertical cool->warm lean,
 *     an off-frame warm key glow (upper-right, balancing the lower-left title),
 *     two-octave atmospheric parallax noise, a corner vignette, and a filmic
 *     toe (black-lift) — a graded dark zone with depth, not a flat #000 void.
 *   - **Slow camera push.** The backdrop dollies + drifts over the full clip
 *     while the foreground title holds, so the long hold breathes (parallax)
 *     instead of sitting dead-static after the drop.
 *   - **Shader-driven drop motion.** During progress 0.00 → 0.20 the sampled
 *     text texture is offset downward (text "enters" from above the frame).
 *     The offset uses ease-out, so the drop decelerates into the impact.
 *   - **Directional motion blur.** While dropping, 12 taps sampled along the
 *     vertical velocity direction at decaying weights. Blur radius scales
 *     with (1 − dropProgress) so it's heavy at the start and zero at impact.
 *   - **Impact flash.** A short brightness bloom at progress 0.18 → 0.24,
 *     peaking at 0.21. Reads as the title "landing" with energy.
 *   - **Settle shake.** Faint vertical position oscillation (≤ 4 px) for
 *     ~0.05 progress after the impact, decaying. Sells weight.
 *   - **Fine film grain** over the whole frame, time-driven phase.
 *
 * No surface-level enter/exit fade is needed — the drop motion IS the
 * entrance. Exit uses opacity through the standard surface.exit transition.
 */

export const TitleSequenceDropUniforms = d.struct({
	seed: d.f32,
	progress: d.f32,
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	paperVisibility: d.f32,
	enterStart: d.f32,
	enterDuration: d.f32,
	// Pack-routed backdrop tints (the `title-sequence.backdrop` Role): gradient
	// top/bottom and the off-frame key-glow colour.
	topColor: d.vec3f,
	bottomColor: d.vec3f,
	glowColor: d.vec3f
});

export interface TitleSequenceDropParams {
	seed: number;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
	paperVisibility: number;
	enterStart: number;
	enterDuration: number;
	topColor: ReturnType<typeof d.vec3f>;
	bottomColor: ReturnType<typeof d.vec3f>;
	glowColor: ReturnType<typeof d.vec3f>;
}

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

// Neutral achromatic fallbacks when the active Pack doesn't claim the
// `title-sequence.backdrop` Role (ADR-0024 structural posture: a Pack opts
// INTO a backdrop character; absence never falls back to Syntax warmth).
// Each is the Rec.709 luminance of the original constant with zero chroma.
const NEUTRAL_TOP_COLOR: readonly [number, number, number] = [0.018, 0.018, 0.018];
const NEUTRAL_BOTTOM_COLOR: readonly [number, number, number] = [0.021, 0.021, 0.021];
const NEUTRAL_GLOW_COLOR: readonly [number, number, number] = [0.635, 0.635, 0.635];

const wgsl = /* wgsl */ `
	let seed = layout.$.uniforms.seed;
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let t = layout.$.uniforms.progress;
	let aspectRatio = canvasW / canvasH;

	// ----- Graded cinema backdrop with slow camera push (parallax depth) -----
	//
	// The title drop is animated on in.uv (foreground); the backdrop samples
	// through a slow dolly + horizontal drift so the frame breathes for the full
	// clip — no dead static hold — and reads as a deeper plane behind the title.
	let camT = t * t * (3.0 - 2.0 * t);
	let cameraDriftX = -0.045 * camT;
	let dollyScale = 1.0 + 0.05 * camT;
	let dollyCentre = vec2f(0.5);
	let bgUv = (in.uv - dollyCentre) / dollyScale + dollyCentre + vec2f(cameraDriftX, 0.0);

	// Deep cinema black with a vertical lean (filmic split, not a flat #000
	// void). Tints are Pack-routed (the title-sequence.backdrop Role) —
	// Syntax leans cool-top / warm-floor.
	let topColor = layout.$.uniforms.topColor;
	let bottomColor = layout.$.uniforms.bottomColor;
	let baseColor = mix(topColor, bottomColor, clamp(bgUv.y, 0.0, 1.0));

	// Key glow implied off-frame upper-right (colour Pack-routed), balancing
	// the lower-left title block. Elliptical, aspect-corrected, tracked by the
	// camera push.
	let glowOrigin = vec2f(0.82, 0.16);
	let glowDelta = (bgUv - glowOrigin) * vec2f(aspectRatio, 1.0);
	let glowDist = length(glowDelta);
	let glowFalloff = 1.0 - smoothstep(0.05, 0.64, glowDist);
	let glowColor = layout.$.uniforms.glowColor;
	let lit = baseColor + glowColor * glowFalloff * 0.13;

	// Two-layer atmospheric parallax: far + near value-noise octaves drifting at
	// different rates so the dark field reads as depth, not one flat haze.
	let farUv = vec2f(bgUv.x + cameraDriftX * 1.0, bgUv.y) * 10.0 + vec2f(seed * 13.0, seed * 19.0);
	let farCell = floor(farUv);
	let farF = fract(farUv);
	let farL = farF * farF * (3.0 - 2.0 * farF);
	let f00 = fract(sin(dot(farCell, vec2f(127.1, 311.7))) * 43758.5453);
	let f10 = fract(sin(dot(farCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let f01 = fract(sin(dot(farCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let f11 = fract(sin(dot(farCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let farNoise = mix(mix(f00, f10, farL.x), mix(f01, f11, farL.x), farL.y);
	let nearUv = vec2f(bgUv.x + cameraDriftX * 2.6, bgUv.y) * 3.5 + vec2f(seed * 7.0, seed * 29.0);
	let nearCell = floor(nearUv);
	let nearF = fract(nearUv);
	let nearL = nearF * nearF * (3.0 - 2.0 * nearF);
	let g00 = fract(sin(dot(nearCell, vec2f(127.1, 311.7))) * 43758.5453);
	let g10 = fract(sin(dot(nearCell + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let g01 = fract(sin(dot(nearCell + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let g11 = fract(sin(dot(nearCell + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let nearNoise = mix(mix(g00, g10, nearL.x), mix(g01, g11, nearL.x), nearL.y);
	let atmosphericNoise = farNoise * 0.45 + nearNoise * 0.55;
	let atmospheric = lit * (1.0 + (atmosphericNoise - 0.5) * 0.10);

	// ----- Drop motion (shader-driven text offset + motion blur) -----
	//
	// Drop window: progress 0.00 → 0.20. Ease: cubic ease-out (1 − (1−x)³)
	// so the drop decelerates into the impact frame.
	let enterStart = layout.$.uniforms.enterStart;
	let enterDuration = max(layout.$.uniforms.enterDuration, 0.0001);
	let enterEnd = enterStart + enterDuration;
	let dropPhase = clamp((t - enterStart) / enterDuration, 0.0, 1.0);
	let dropEase = 1.0 - pow(1.0 - dropPhase, 3.0);
	let dropOffsetY = (1.0 - dropEase) * 0.55; // text starts 55% above resting

	// Settle shake: 5 cycles of decaying sine in the brief window after impact.
	let settlePhase = clamp((t - enterEnd) / 0.06, 0.0, 1.0);
	let settleAmplitude = (1.0 - settlePhase) * 0.005;
	let settleOffsetY = sin(settlePhase * 6.28318 * 5.0) * settleAmplitude;

	// Total text-sample offset in UV space.
	let textOffsetUv = vec2f(0.0, dropOffsetY + settleOffsetY);

	// Motion-blur length scales with velocity (1 − dropPhase) during the drop.
	// 12 taps spaced along the vertical velocity direction at decaying weights.
	let blurAmount = (1.0 - dropPhase) * 80.0;
	let blurStepY = (blurAmount / canvasH) / 12.0;

	// Taps trail ABOVE the falling text (negative Y = up in UV/screen space).
	// The text is dropping downward, so its previous positions are above the
	// current position — sampling with -blurStepY produces the correct
	// velocity-direction smear behind the motion.
	let t0  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv);
	let t1  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 1.0));
	let t2  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 2.0));
	let t3  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 3.0));
	let t4  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 4.0));
	let t5  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 5.0));
	let t6  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 6.0));
	let t7  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 7.0));
	let t8  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 8.0));
	let t9  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 9.0));
	let t10 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 10.0));
	let t11 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv - vec2f(0.0, blurStepY * 11.0));

	// Weights decay along the trail so the head of the motion is brightest
	// and the tail fades — reads as a velocity smear, not a uniform blur.
	let w0  = 1.00;
	let w1  = 0.90;
	let w2  = 0.80;
	let w3  = 0.70;
	let w4  = 0.60;
	let w5  = 0.50;
	let w6  = 0.40;
	let w7  = 0.32;
	let w8  = 0.24;
	let w9  = 0.18;
	let w10 = 0.13;
	let w11 = 0.08;
	let wSum = w0+w1+w2+w3+w4+w5+w6+w7+w8+w9+w10+w11;

	// Alpha-weighted RGB blend (avoid contamination from transparent samples).
	let sumWeightedAlpha = t0.a*w0 + t1.a*w1 + t2.a*w2 + t3.a*w3 + t4.a*w4
		+ t5.a*w5 + t6.a*w6 + t7.a*w7 + t8.a*w8 + t9.a*w9 + t10.a*w10 + t11.a*w11;
	let sumWeightedRgb = t0.rgb*t0.a*w0 + t1.rgb*t1.a*w1 + t2.rgb*t2.a*w2
		+ t3.rgb*t3.a*w3 + t4.rgb*t4.a*w4 + t5.rgb*t5.a*w5 + t6.rgb*t6.a*w6
		+ t7.rgb*t7.a*w7 + t8.rgb*t8.a*w8 + t9.rgb*t9.a*w9 + t10.rgb*t10.a*w10
		+ t11.rgb*t11.a*w11;
	let blurredRgb = sumWeightedRgb / max(sumWeightedAlpha, 0.0001);
	let blurredAlpha = sumWeightedAlpha / wSum;

	// ----- Impact flash -----
	//
	// Short brightness lift centred on progress 0.21, lasting 0.18 → 0.24.
	// Triangle envelope so the peak is single-frame-feeling.
	let flashCentre = enterEnd;
	let flashHalfWidth = 0.03;
	let flashEnvelope = max(0.0, 1.0 - abs(t - flashCentre) / flashHalfWidth);
	let flashLift = flashEnvelope * 0.45;
	let flashedRgb = blurredRgb + vec3f(flashLift);

	// ----- Vignette (pull attention inward, off the dark corners) -----
	let centred = (in.uv - vec2f(0.5)) * vec2f(aspectRatio, 1.0);
	let centreDist = length(centred);
	let vignette = smoothstep(0.40, 1.20, centreDist) * 0.34;
	let vignetted = atmospheric * (1.0 - vignette);

	// ----- Fine film grain -----
	let grainSeed = floor(in.uv * vec2f(canvasW, canvasH)) + vec2f(seed * 19.0 + t * 7.0, seed * 23.0 + t * 11.0);
	let grain = fract(sin(dot(grainSeed, vec2f(127.1, 311.7))) * 43758.5453) - 0.5;
	let grained = vignetted + vec3f(grain) * 0.022;

	// ----- Filmic toe (black-lift) -----
	//
	// Lift crushed shadows (gamma 0.94) so the dark field reads as graded depth
	// rather than a flat void — keeps the parallax + gradient visible in the
	// lower stops instead of clipping them to pure black.
	let backdropGrained = pow(max(grained, vec3f(0.0)), vec3f(0.94));

	// ----- Composite text over backdrop -----
	//
	// Full-frame bumper output (preset carries backgroundFill). Alpha = 1.0 so
	// the engine's backgroundFill composite is the signal for the export lane,
	// not a shader alpha floor.
	//
	// Surface fade on the GPU: copyElementImageToTexture can't rasterize a DOM
	// element's CSS opacity<1 (it captures transparent — see F1 in
	// docs/critic-captures/text-fade-bug-investigation.md), so the article stays
	// opaque and we fade the captured text here by paperVisibility. Gradual
	// enter/exit instead of the binary snap CSS opacity produced.
	let fadedAlpha = blurredAlpha * layout.$.uniforms.paperVisibility;
	let backdropOpacity = 1.0;
	let finalRgb = mix(backdropGrained, flashedRgb, fadedAlpha);
	let finalAlpha = max(fadedAlpha, backdropOpacity);
	return vec4f(finalRgb, finalAlpha);
`;

export function createTitleSequenceDropPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: TitleSequenceDropUniforms,
		// Paints an opaque full-frame environment (graded backdrop) under the
		// type — the depth stage's real backdrop plane at depth supersedes it
		// (ADR-0028); stage pieces choreograph the type via textAnimations.
		environment: true,
		wgsl,
		packUniforms(target, bounds, ctx) {
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			// Uniforms pack per frame, so a Pack switch takes effect without extra
			// reactivity — read the active Pack imperatively here.
			const backdropRole = getPack(packState.slug).roles['title-sequence.backdrop'];
			return {
				seed,
				progress: ctx.progress,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				// Surface fade is applied here (GPU), not via DOM opacity — the
				// capture can't rasterize element opacity<1. Read imperatively.
				paperVisibility: animState.paperVisibility,
				// The drop / impact / settle run over the surface ENTER window — a
				// draggable timeline clip — instead of hardcoded progress constants.
				enterStart: target.enter?.start ?? 0,
				enterDuration: target.enter?.duration ?? 0.2,
				topColor: d.vec3f(...resolveRoleColorFloat(backdropRole, 'top', NEUTRAL_TOP_COLOR)),
				bottomColor: d.vec3f(
					...resolveRoleColorFloat(backdropRole, 'bottom', NEUTRAL_BOTTOM_COLOR)
				),
				glowColor: d.vec3f(...resolveRoleColorFloat(backdropRole, 'glow', NEUTRAL_GLOW_COLOR))
			} satisfies TitleSequenceDropParams;
		}
	};
}

export const titleSequenceDrop = createTitleSequenceDropPass();
