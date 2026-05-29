import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';
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
 *   - **Deep black backdrop** with subtle off-frame warm glow (upper-left).
 *     Cinema-grade dark zone behind the text.
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
	canvasHeight: d.f32
});

export interface TitleSequenceDropParams {
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

	// ----- Deep black backdrop with subtle off-frame warm glow -----
	let baseColor = vec3f(0.012, 0.014, 0.020);
	let glowOrigin = vec2f(0.15, 0.10);
	let glowDelta = (in.uv - glowOrigin) * vec2f(aspectRatio, 1.0);
	let glowDist = length(glowDelta);
	let glowFalloff = 1.0 - smoothstep(0.05, 0.60, glowDist);
	let glowColor = vec3f(0.86, 0.52, 0.30);
	let lit = baseColor + glowColor * glowFalloff * 0.10;

	// ----- Drop motion (shader-driven text offset + motion blur) -----
	//
	// Drop window: progress 0.00 → 0.20. Ease: cubic ease-out (1 − (1−x)³)
	// so the drop decelerates into the impact frame.
	let dropDuration = 0.20;
	let dropPhase = clamp(t / dropDuration, 0.0, 1.0);
	let dropEase = 1.0 - pow(1.0 - dropPhase, 3.0);
	let dropOffsetY = (1.0 - dropEase) * 0.55; // text starts 55% above resting

	// Settle shake: 5 cycles of decaying sine in the brief window after impact.
	let settlePhase = clamp((t - 0.20) / 0.06, 0.0, 1.0);
	let settleAmplitude = (1.0 - settlePhase) * 0.005;
	let settleOffsetY = sin(settlePhase * 6.28318 * 5.0) * settleAmplitude;

	// Total text-sample offset in UV space.
	let textOffsetUv = vec2f(0.0, dropOffsetY + settleOffsetY);

	// Motion-blur length scales with velocity (1 − dropPhase) during the drop.
	// 12 taps spaced along the vertical velocity direction at decaying weights.
	let blurAmount = (1.0 - dropPhase) * 80.0;
	let blurStepY = (blurAmount / canvasH) / 12.0;

	let t0  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv);
	let t1  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 1.0));
	let t2  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 2.0));
	let t3  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 3.0));
	let t4  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 4.0));
	let t5  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 5.0));
	let t6  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 6.0));
	let t7  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 7.0));
	let t8  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 8.0));
	let t9  = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 9.0));
	let t10 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 10.0));
	let t11 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + textOffsetUv + vec2f(0.0, blurStepY * 11.0));

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
	let flashCentre = 0.21;
	let flashHalfWidth = 0.03;
	let flashEnvelope = max(0.0, 1.0 - abs(t - flashCentre) / flashHalfWidth);
	let flashLift = flashEnvelope * 0.45;
	let flashedRgb = blurredRgb + vec3f(flashLift);

	// ----- Fine film grain -----
	let grainSeed = floor(in.uv * vec2f(canvasW, canvasH)) + vec2f(seed * 19.0 + t * 7.0, seed * 23.0 + t * 11.0);
	let grain = fract(sin(dot(grainSeed, vec2f(127.1, 311.7))) * 43758.5453) - 0.5;
	let backdropGrained = lit + vec3f(grain) * 0.020;

	// ----- Composite text over backdrop -----
	//
	// Output alpha 0.96 — title sequences are usually full-substrate moments,
	// so we run substrate close to opaque while still preserving the
	// transparent-export contract.
	let backdropOpacity = 0.96;
	let finalRgb = mix(backdropGrained, flashedRgb, blurredAlpha);
	let finalAlpha = max(blurredAlpha, backdropOpacity);
	return vec4f(finalRgb, finalAlpha);
`;

export function createTitleSequenceDropPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: TitleSequenceDropUniforms,
		wgsl,
		packUniforms(target, bounds, ctx) {
			const seedSource = target.content.title ?? target.type;
			const seed = hashStringToUnitInterval(seedSource);
			return {
				seed,
				progress: ctx.progress,
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT
			} satisfies TitleSequenceDropParams;
		}
	};
}

export const titleSequenceDrop = createTitleSequenceDropPass();
