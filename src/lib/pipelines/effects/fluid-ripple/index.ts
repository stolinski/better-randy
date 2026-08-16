import { d } from 'typegpu';

import { SeekableSimulationRuntime } from '$lib/platform/seekable-simulation-runtime';
import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';
import {
	fluidRippleEffectDefinition,
	type FluidRippleParams as FluidRippleParamsDefinition
} from './definition';

export type FluidRippleParams = FluidRippleParamsDefinition;
interface FluidState {
	amplitude: number;
	phase: number;
	velocity: number;
	x: number;
	y: number;
}

const FLUID_NATURAL_FREQUENCY = 6;
const FluidRippleUniforms = d.struct({
	resolution: d.vec2f,
	center: d.vec2f,
	amplitude: d.f32,
	phase: d.f32,
	radius: d.f32,
	refraction: d.f32,
	highlights: d.f32
});

function resolveFluidState(params: FluidRippleParams, timestamp: number): FluidState {
	const runtime = new SeekableSimulationRuntime<
		FluidState,
		{ x: number; y: number; strength: number }
	>(
		{ num: 60, den: 1 },
		{
			reset: (seed) => ({
				amplitude: 0,
				phase: (seed % 1024) / 1024,
				velocity: 0,
				x: 0.5,
				y: 0.5
			}),
			step: (state, input) => {
				let amplitude = state.amplitude;
				let velocity = state.velocity;
				let x = state.x;
				let y = state.y;
				for (const event of input.events) {
					velocity += event.value.strength * FLUID_NATURAL_FREQUENCY;
					x = event.value.x;
					y = event.value.y;
				}
				velocity -=
					amplitude * FLUID_NATURAL_FREQUENCY * FLUID_NATURAL_FREQUENCY * input.deltaSeconds;
				velocity *= Math.exp(-params.damping * input.deltaSeconds);
				amplitude += velocity * input.deltaSeconds;
				return {
					amplitude,
					phase: state.phase + params.waveSpeed * input.deltaSeconds,
					velocity,
					x,
					y
				};
			},
			clone: (state) => ({ ...state })
		}
	);
	const targetStep = Math.max(0, Math.floor(timestamp * 60));
	const state = runtime.seek(targetStep, params.seed, [
		{
			id: 'primary-impulse',
			step: Math.floor(params.impulseAtSeconds * 60),
			value: { x: params.impulseX, y: params.impulseY, strength: params.impulseStrength }
		}
	]);
	runtime.dispose();
	return state;
}

export const fluidRippleEffectRenderer: EffectRenderer<FluidRippleParams> = {
	...fluidRippleEffectDefinition,
	pass: {
		paramsStruct: FluidRippleUniforms,
		fragmentBody: /* wgsl */ `
			let aspect = layout.$.uniforms.resolution.x / layout.$.uniforms.resolution.y;
			let delta = (in.uv - layout.$.uniforms.center) * vec2f(aspect, 1.0);
			let distance = length(delta);
			let radius = layout.$.uniforms.radius;
			let envelope = exp(-distance * distance / max(0.001, radius * radius));
			let wave = sin(distance * 72.0 - layout.$.uniforms.phase * 9.0);
			let amplitude = layout.$.uniforms.amplitude * envelope;
			let normal = normalize(delta + vec2f(0.0001));
			let displacedUv = in.uv + normal * wave * amplitude * layout.$.uniforms.refraction;
			let displaced = textureSample(layout.$.inputTexture, layout.$.samp, displacedUv);
			let glint = max(0.0, wave) * abs(amplitude) * layout.$.uniforms.highlights * displaced.a;
			return vec4f(displaced.rgb + vec3f(glint), displaced.a);
		`,
		pack: (params, ctx) => {
			const state = resolveFluidState(params, ctx.timestamp);
			return {
				resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
				center: d.vec2f(state.x, state.y),
				amplitude: state.amplitude,
				phase: state.phase,
				radius: params.radius,
				refraction: params.refraction,
				highlights: params.highlights
			};
		}
	},
	Editor
};
