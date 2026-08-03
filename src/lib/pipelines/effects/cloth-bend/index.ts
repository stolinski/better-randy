import { d } from 'typegpu';
import { z } from 'zod';

import { SeekableSimulationRuntime } from '$lib/platform/seekable-simulation-runtime';
import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { createBicubicSampleWgsl } from '$lib/utils/bicubic-sampling-wgsl';

import Editor from './Editor.svelte';

const ClothBendParamsSchema = z.object({
	seed: z.number().int().min(0).max(65535).default(512),
	pinnedEdge: z.enum(['top', 'left', 'both']).default('top'),
	gustAtSeconds: z.number().min(0).max(600).default(0.3),
	gust: z.number().min(-1).max(1).default(0.62),
	stiffness: z.number().min(0.5).max(20).default(7),
	damping: z.number().min(0.1).max(10).default(2.8),
	folds: z.number().min(1).max(16).default(5),
	perspective: z.number().min(0).max(0.3).default(0.08),
	shadow: z.number().min(0).max(1).default(0.32)
});

export type ClothBendParams = z.infer<typeof ClothBendParamsSchema>;

interface ClothState {
	bend: number;
	velocity: number;
	phase: number;
}

const ClothBendEffectSchema = z.object({
	type: z.literal('cloth-bend'),
	id: z.string(),
	params: ClothBendParamsSchema
});

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
	type: 'cloth-bend',
	label: 'Cloth bend',
	schema: ClothBendEffectSchema,
	defaults: () => ({
		params: {
			seed: 512,
			pinnedEdge: 'top',
			gustAtSeconds: 0.3,
			gust: 0.62,
			stiffness: 7,
			damping: 2.8,
			folds: 5,
			perspective: 0.08,
			shadow: 0.32
		}
	}),
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
