import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';

const PaperGrainParamsSchema = z.object({
	warmth: z.number().min(0).max(1).default(0.5),
	density: z.number().min(0).max(1).default(0.3)
});

export type PaperGrainParams = z.infer<typeof PaperGrainParamsSchema>;

const PaperGrainEffectSchema = z.object({
	type: z.literal('paper-grain'),
	id: z.string(),
	params: PaperGrainParamsSchema
});

const PaperGrainUniforms = d.struct({
	warmth: d.f32,
	density: d.f32
});

// Two-octave value-noise grain multiplied into the input texture. Multi-scale
// per quality-rubric Q2; the density parameter caps overall strength so the
// grain stays a supporting layer (Q12: ≤2 supports, hero unchanged). Alpha is
// untouched so the transparent-overlay export contract holds (E4).
const fragmentBody = /* wgsl */ `
	let coarsePos = in.uv * vec2f(220.0, 220.0);
	let coarseI = floor(coarsePos);
	let coarseF = fract(coarsePos);
	let coarseS = coarseF * coarseF * (vec2f(3.0) - 2.0 * coarseF);
	let c00 = fract(sin(dot(coarseI, vec2f(127.1, 311.7))) * 43758.5453);
	let c10 = fract(sin(dot(coarseI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let c01 = fract(sin(dot(coarseI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let c11 = fract(sin(dot(coarseI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let coarseN = mix(mix(c00, c10, coarseS.x), mix(c01, c11, coarseS.x), coarseS.y);

	let finePos = in.uv * vec2f(680.0, 680.0);
	let fineI = floor(finePos);
	let fineF = fract(finePos);
	let fineS = fineF * fineF * (vec2f(3.0) - 2.0 * fineF);
	let f00 = fract(sin(dot(fineI, vec2f(269.5, 183.3))) * 43758.5453);
	let f10 = fract(sin(dot(fineI + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
	let f01 = fract(sin(dot(fineI + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
	let f11 = fract(sin(dot(fineI + vec2f(1.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
	let fineN = mix(mix(f00, f10, fineS.x), mix(f01, f11, fineS.x), fineS.y);

	let warmth = layout.$.uniforms.warmth;
	let density = layout.$.uniforms.density;

	// Grain peak is ±(0.06 * density); at density=0.3 that's ±0.018 (subtle,
	// reads as paper fibre). At density=1 it's ±0.06 (visible but never a
	// dominant layer — Q12).
	let grain = (coarseN * 0.55 + fineN * 0.45 - 0.5) * (0.06 * density);
	// Warmth biases the tint towards a warm-paper cream at full strength
	// without crushing channels; range matches what a paper substrate carries.
	let warmthTint = vec3f(1.0, 1.0 - warmth * 0.04, 1.0 - warmth * 0.08);
	let tint = warmthTint + vec3f(grain);

	// Only tint pixels that have content (alpha > 0) so transparent regions
	// stay transparent. Multiplicative blend preserves the substrate.
	let mask = step(0.001, inputSample.a);
	let outRgb = mix(inputSample.rgb, inputSample.rgb * tint, mask);
	return vec4f(outRgb, inputSample.a);
`;

export const paperGrain: EffectRenderer<PaperGrainParams> = {
	type: 'paper-grain',
	label: 'Paper grain',
	schema: PaperGrainEffectSchema,
	defaults: () => ({ params: { warmth: 0.5, density: 0.3 } }),
	pass: {
		paramsStruct: PaperGrainUniforms,
		fragmentBody,
		pack: (params, _ctx) => ({ warmth: params.warmth, density: params.density })
	},
	Editor
};
