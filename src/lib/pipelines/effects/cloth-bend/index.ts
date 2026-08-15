import { d } from 'typegpu';

import { SeekableSimulationRuntime } from '$lib/platform/seekable-simulation-runtime';
import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { createBicubicSampleWgsl } from '$lib/utils/bicubic-sampling-wgsl';

import Editor from './Editor.svelte';
import {
	clothBendEffectDefinition,
	type ClothBendParams as ClothBendParamsDefinition
} from './definition';

export type ClothBendParams = ClothBendParamsDefinition;
interface ClothState {
	bend: number;
	velocity: number;
	phase: number;
}
const ClothBendUniforms = d.struct({
	bend: d.f32,
	phase: d.f32,
	pinnedEdge: d.f32,
	folds: d.f32,
	perspective: d.f32,
	shadow: d.f32
});

const PIN_CODES: Record<ClothBendParams['pinnedEdge'], number> = { top: 0, left: 1, both: 2 };

function resolveClothState(params: ClothBendParams, timestamp: number): ClothState {
	const runtime = new SeekableSimulationRuntime<ClothState, number>(
		{ num: 60, den: 1 },
		{
			reset: (seed) => ({ bend: 0, velocity: 0, phase: (seed % 2048) / 2048 }),
			step: (state, input) => {
				let velocity = state.velocity;
				for (const event of input.events) velocity += event.value;
				velocity +=
					(-params.stiffness * state.bend - params.damping * velocity) * input.deltaSeconds;
				return {
					bend: state.bend + velocity * input.deltaSeconds,
					velocity,
					phase: state.phase + input.deltaSeconds
				};
			},
			clone: (state) => ({ ...state })
		}
	);
	const state = runtime.seek(Math.max(0, Math.floor(timestamp * 60)), params.seed, [
		{ id: 'authored-gust', step: Math.floor(params.gustAtSeconds * 60), value: params.gust }
	]);
	runtime.dispose();
	return state;
}

export const clothBendEffectRenderer: EffectRenderer<ClothBendParams> = {
	...clothBendEffectDefinition,
	pass: {
		paramsStruct: ClothBendUniforms,
		fragmentBody: /* wgsl */ `
			let pin = layout.$.uniforms.pinnedEdge;
			let topWeight = in.uv.y;
			let leftWeight = in.uv.x;
			var freeWeight = topWeight;
			if (pin > 0.5 && pin < 1.5) { freeWeight = leftWeight; }
			if (pin > 1.5) { freeWeight = topWeight * leftWeight; }
			let fold = sin((in.uv.x * layout.$.uniforms.folds + layout.$.uniforms.phase) * 6.2831853);
			let bend = layout.$.uniforms.bend * freeWeight;
			let displacedUv = in.uv + vec2f(
				bend * layout.$.uniforms.perspective * freeWeight,
				fold * bend * 0.018 * freeWeight
			);
			${createBicubicSampleWgsl({
				prefix: 'cloth',
				result: 'clothSample',
				sampler: 'layout.$.samp',
				texture: 'layout.$.inputTexture',
				uv: 'displacedUv'
			})}
			let light = 1.0 + fold * bend * 0.18 - abs(fold) * abs(bend) * layout.$.uniforms.shadow * 0.22;
			let straightRgb = select(
				vec3f(0.0),
				clothSample.rgb / max(clothSample.a, 0.0001),
				clothSample.a > 0.0001
			);
			return vec4f(straightRgb * max(0.4, light) * clothSample.a, clothSample.a);
		`,
		pack: (params, ctx) => {
			const state = resolveClothState(params, ctx.timestamp);
			return {
				bend: state.bend,
				phase: state.phase,
				pinnedEdge: PIN_CODES[params.pinnedEdge],
				folds: params.folds,
				perspective: params.perspective,
				shadow: params.shadow
			};
		}
	},
	Editor
};
