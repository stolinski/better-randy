import { d } from 'typegpu';

import type { TransitionEffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';
import {
	particleDissolveTransitionEffectDefinition,
	type ParticleDissolveParams as ParticleDissolveParamsDefinition
} from './definition';

export type ParticleDissolveParams = ParticleDissolveParamsDefinition;
const ParticleDissolveUniforms = d.struct({
	progress: d.f32,
	resolution: d.vec2f,
	seed: d.f32,
	density: d.f32,
	spread: d.f32,
	direction: d.f32,
	softness: d.f32,
	luminanceBias: d.f32
});

export const particleDissolveTransitionEffectRenderer: TransitionEffectRenderer<ParticleDissolveParams> =
	{
		...particleDissolveTransitionEffectDefinition,
		Editor,
		pass: {
			paramsStruct: ParticleDissolveUniforms,
			fragmentBody: /* wgsl */ `
			let aspect = layout.$.uniforms.resolution.x / layout.$.uniforms.resolution.y;
			let direction = vec2f(
				cos(layout.$.uniforms.direction) / aspect,
				sin(layout.$.uniforms.direction)
			);
			let travel = layout.$.uniforms.spread * transitionProgress * transitionProgress;
			let particleUv = in.uv - direction * travel;
			let gridUv = particleUv * vec2f(aspect, 1.0) * layout.$.uniforms.density;
			let cell = floor(gridUv);
			let seed = layout.$.uniforms.seed;
			let random = fract(sin(dot(cell + vec2f(seed, seed * 0.37), vec2f(12.9898, 78.233))) * 43758.5453);
			let random2 = fract(sin(dot(cell + vec2f(seed * 0.11, seed), vec2f(39.346, 11.135))) * 24634.6345);
			let random3 = fract(sin(dot(cell + vec2f(seed * 0.73, seed * 0.19), vec2f(23.168, 68.973))) * 19573.1217);
			let centerJitter = vec2f(random2 - 0.5, random3 - 0.5) * 0.9;
			let local = fract(gridUv) - vec2f(0.5) - centerJitter;

			let secondaryGridUv = particleUv * vec2f(aspect, 1.0) * layout.$.uniforms.density * 0.61;
			let secondaryCell = floor(secondaryGridUv);
			let secondaryRandom = fract(sin(dot(secondaryCell + vec2f(seed * 0.41, seed), vec2f(17.713, 91.913))) * 32517.451);
			let secondaryRandom2 = fract(sin(dot(secondaryCell + vec2f(seed, seed * 0.83), vec2f(63.726, 10.873))) * 12831.751);
			let secondaryRandom3 = fract(sin(dot(secondaryCell + vec2f(seed * 0.29, seed * 0.61), vec2f(31.167, 47.853))) * 52741.193);
			let secondaryJitter = vec2f(secondaryRandom2 - 0.5, secondaryRandom3 - 0.5) * 0.9;
			let secondaryLocal = fract(secondaryGridUv) - vec2f(0.5) - secondaryJitter;

			let luma = dot(fromSample.rgb, vec3f(0.2126, 0.7152, 0.0722));
			let noiseUv = in.uv * vec2f(aspect, 1.0) * layout.$.uniforms.density * 0.16;
			let noiseCell = floor(noiseUv);
			let noiseLocal = fract(noiseUv);
			let noiseEase = noiseLocal * noiseLocal * (vec2f(3.0) - 2.0 * noiseLocal);
			let noise00 = fract(sin(dot(noiseCell + vec2f(seed, seed * 0.37), vec2f(12.9898, 78.233))) * 43758.5453);
			let noise10 = fract(sin(dot(noiseCell + vec2f(1.0, 0.0) + vec2f(seed, seed * 0.37), vec2f(12.9898, 78.233))) * 43758.5453);
			let noise01 = fract(sin(dot(noiseCell + vec2f(0.0, 1.0) + vec2f(seed, seed * 0.37), vec2f(12.9898, 78.233))) * 43758.5453);
			let noise11 = fract(sin(dot(noiseCell + vec2f(1.0, 1.0) + vec2f(seed, seed * 0.37), vec2f(12.9898, 78.233))) * 43758.5453);
			let organicNoise = mix(
				mix(noise00, noise10, noiseEase.x),
				mix(noise01, noise11, noiseEase.x),
				noiseEase.y
			);
			let threshold = clamp(organicNoise + (luma - 0.5) * layout.$.uniforms.luminanceBias, 0.0, 1.0);
			let reveal = smoothstep(
				threshold - layout.$.uniforms.softness,
				threshold + layout.$.uniforms.softness,
				transitionProgress
			);
			let particle = textureSample(layout.$.fromTexture, layout.$.samp, particleUv);
			let radius = mix(0.08, 0.27, random3);
			let primaryParticle = (1.0 - smoothstep(
				radius - layout.$.uniforms.softness,
				radius + layout.$.uniforms.softness,
				length(local)
			)) * step(0.32, random);
			let secondaryRadius = mix(0.06, 0.22, secondaryRandom3);
			let secondaryParticle = (1.0 - smoothstep(
				secondaryRadius - layout.$.uniforms.softness,
				secondaryRadius + layout.$.uniforms.softness,
				length(secondaryLocal)
			)) * step(0.44, secondaryRandom);
			let particulate = max(primaryParticle, secondaryParticle);
			let endpointEnvelope = smoothstep(0.0, 0.16, transitionProgress) *
				(1.0 - smoothstep(0.84, 1.0, transitionProgress));
			let particleOpacity = particulate * reveal * endpointEnvelope;
			let departing = particle * particleOpacity;
			let base = mix(fromSample, toSample, reveal);
			return departing + base * (1.0 - departing.a);
		`,
			pack: (params, ctx) => ({
				progress: ctx.progress,
				resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
				seed: params.seed,
				density: params.density,
				spread: params.spread,
				direction: (params.direction * Math.PI) / 180,
				softness: params.softness,
				luminanceBias: params.luminanceBias
			})
		}
	};
