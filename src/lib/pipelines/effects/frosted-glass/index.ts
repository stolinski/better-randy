import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';
import {
	DEFAULT_FROSTED_GLASS_REGION,
	NormalizedOpticalRegionSchema,
	packNormalizedOpticalRegion
} from '$lib/utils/optical-geometry';

import Editor from './Editor.svelte';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const FrostMeltSchema = z
	.object({
		center: z
			.object({
				x: z.number().min(0).max(1).default(0.5),
				y: z.number().min(0).max(1).default(0.5)
			})
			.default({ x: 0.5, y: 0.5 }),
		radius: z.number().min(0.01).max(1.5).default(0.28),
		softness: z.number().min(0.001).max(0.5).default(0.08),
		from: z.number().min(0).max(1).default(0.42),
		to: z.number().min(0).max(1).default(0.68)
	})
	.refine((melt) => melt.to > melt.from, {
		message: 'Frost melt `to` must be greater than `from`.'
	});

const FrostedGlassParamsSchema = z.object({
	region: NormalizedOpticalRegionSchema.default(DEFAULT_FROSTED_GLASS_REGION),
	coverage: z.number().min(0).max(1).default(0.72),
	contrast: z.number().min(0.05).max(1).default(0.42),
	roughness: z.number().min(0).max(1).default(0.62),
	haze: z.number().min(0).max(1).default(0.68),
	refraction: z.number().min(0).max(1).default(0.26),
	detailScale: z.number().min(0.25).max(4).default(1.15),
	tint: z.string().regex(HEX_COLOR_PATTERN).default('#e8f1f5'),
	tintStrength: z.number().min(0).max(1).default(0.18),
	highlight: z.number().min(0).max(1).default(0.22),
	seed: z.number().int().min(0).max(65535).default(4107),
	melt: FrostMeltSchema.optional()
});

export type FrostedGlassParams = z.infer<typeof FrostedGlassParamsSchema>;

const FrostedGlassEffectSchema = z.object({
	type: z.literal('frosted-glass'),
	id: z.string(),
	params: FrostedGlassParamsSchema
});

const FrostedGlassUniforms = d.struct({
	region: d.vec4f,
	tint: d.vec4f,
	melt: d.vec4f,
	meltTiming: d.vec4f,
	resolution: d.vec2f,
	progress: d.f32,
	coverage: d.f32,
	contrast: d.f32,
	roughness: d.f32,
	haze: d.f32,
	refraction: d.f32,
	detailScale: d.f32,
	tintStrength: d.f32,
	highlight: d.f32,
	seed: d.f32
});

// Deterministic pane frost built from three independently-scaled value fields,
// transmission blur, derivative relief, and sparse surface highlights. The
// frost front and optional melt are pure functions of composition progress;
// output alpha always remains the local input alpha.
const fragmentBody = /* wgsl */ `
	let region = layout.$.uniforms.region;
	let resolution = layout.$.uniforms.resolution;
	let localUv = (in.uv - region.xy) / max(region.zw, vec2f(0.0001));
	let regionPixels = max(region.zw * resolution, vec2f(1.0));
	let edgePixels = min(
		min(localUv.x, 1.0 - localUv.x) * regionPixels.x,
		min(localUv.y, 1.0 - localUv.y) * regionPixels.y
	);
	let paneAa = max(fwidth(edgePixels), 0.75);
	let paneMask = smoothstep(-paneAa, paneAa, edgePixels);

	if (paneMask <= 0.0) {
		return inputSample;
	}

	let detailScale = layout.$.uniforms.detailScale;
	let seed = layout.$.uniforms.seed;
	let noiseUvA = localUv * (9.0 * detailScale) + vec2f(seed * 0.013, seed * 0.021);
	let noiseUvB = localUv * (23.0 * detailScale) + vec2f(seed * 0.037, seed * 0.011);
	let noiseUvC = localUv * (57.0 * detailScale) + vec2f(seed * 0.007, seed * 0.043);

	let cellA = floor(noiseUvA);
	let fracA = fract(noiseUvA);
	let smoothA = fracA * fracA * (3.0 - 2.0 * fracA);
	let hashA00 = fract(sin(dot(cellA, vec2f(127.1, 311.7))) * 43758.5453);
	let hashA10 = fract(sin(dot(cellA + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let hashA01 = fract(sin(dot(cellA + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let hashA11 = fract(sin(dot(cellA + vec2f(1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let noiseA = mix(mix(hashA00, hashA10, smoothA.x), mix(hashA01, hashA11, smoothA.x), smoothA.y);

	let cellB = floor(noiseUvB);
	let fracB = fract(noiseUvB);
	let smoothB = fracB * fracB * (3.0 - 2.0 * fracB);
	let hashB00 = fract(sin(dot(cellB, vec2f(269.5, 183.3))) * 43758.5453);
	let hashB10 = fract(sin(dot(cellB + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
	let hashB01 = fract(sin(dot(cellB + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
	let hashB11 = fract(sin(dot(cellB + vec2f(1.0), vec2f(269.5, 183.3))) * 43758.5453);
	let noiseB = mix(mix(hashB00, hashB10, smoothB.x), mix(hashB01, hashB11, smoothB.x), smoothB.y);

	let cellC = floor(noiseUvC);
	let fracC = fract(noiseUvC);
	let smoothC = fracC * fracC * (3.0 - 2.0 * fracC);
	let hashC00 = fract(sin(dot(cellC, vec2f(419.2, 371.9))) * 43758.5453);
	let hashC10 = fract(sin(dot(cellC + vec2f(1.0, 0.0), vec2f(419.2, 371.9))) * 43758.5453);
	let hashC01 = fract(sin(dot(cellC + vec2f(0.0, 1.0), vec2f(419.2, 371.9))) * 43758.5453);
	let hashC11 = fract(sin(dot(cellC + vec2f(1.0), vec2f(419.2, 371.9))) * 43758.5453);
	let noiseC = mix(mix(hashC00, hashC10, smoothC.x), mix(hashC01, hashC11, smoothC.x), smoothC.y);

	let frostField = noiseA * 0.56 + noiseB * 0.3 + noiseC * 0.14;
	let threshold = 1.0 - layout.$.uniforms.coverage;
	let contrastWidth = mix(0.28, 0.025, layout.$.uniforms.contrast);
	var frostMask = smoothstep(threshold - contrastWidth, threshold + contrastWidth, frostField);

	let growth = smoothstep(0.0, 0.24, layout.$.uniforms.progress);
	let growthFront = 1.0 - smoothstep(growth - 0.08, growth + 0.015, localUv.x);
	frostMask = frostMask * growthFront;

	let melt = layout.$.uniforms.melt;
	let meltTiming = layout.$.uniforms.meltTiming;
	let meltProgress = smoothstep(meltTiming.x, max(meltTiming.y, meltTiming.x + 0.0001), layout.$.uniforms.progress)
		* meltTiming.z;
	let meltDistance = length((localUv - melt.xy) * vec2f(regionPixels.x / regionPixels.y, 1.0));
	let meltHole = 1.0 - smoothstep(melt.z - melt.w, melt.z + melt.w, meltDistance);
	frostMask = frostMask * (1.0 - meltHole * meltProgress) * paneMask;

	let relief = normalize(vec2f(dpdx(frostField), dpdy(frostField)) + vec2f(0.00001));
	let refractedUv = in.uv + relief / resolution
		* layout.$.uniforms.refraction * frostMask * 22.0;
	let blurPixels = 1.0 + layout.$.uniforms.roughness * 13.0 + layout.$.uniforms.haze * 8.0;
	let blurStep = vec2f(blurPixels) / resolution;
	let centerSample = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv, 0.0);
	let north = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv + vec2f(0.0, blurStep.y), 0.0);
	let south = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv - vec2f(0.0, blurStep.y), 0.0);
	let east = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv + vec2f(blurStep.x, 0.0), 0.0);
	let west = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv - vec2f(blurStep.x, 0.0), 0.0);
	let northEast = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv + blurStep, 0.0);
	let northWest = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv + vec2f(-blurStep.x, blurStep.y), 0.0);
	let southEast = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv + vec2f(blurStep.x, -blurStep.y), 0.0);
	let southWest = textureSampleLevel(layout.$.inputTexture, layout.$.samp, refractedUv - blurStep, 0.0);
	let transmission = (centerSample * 4.0 + (north + south + east + west) * 2.0
		+ northEast + northWest + southEast + southWest) / 16.0;

	let localAlpha = inputSample.a;
	let straightRgb = select(vec3f(0.0), transmission.rgb / max(transmission.a, 0.0001), transmission.a > 0.0001);
	let tint = layout.$.uniforms.tint;
	let thickness = clamp(frostMask * (0.58 + 0.42 * noiseA), 0.0, 1.0);
	let tintMix = layout.$.uniforms.tintStrength * mix(0.35, 1.0, thickness) * tint.a;
	straightRgb = mix(straightRgb, tint.rgb, tintMix);
	let sparseHighlight = pow(noiseC, 14.0) * layout.$.uniforms.highlight * frostMask;
	let rimHighlight = exp(-pow(max(edgePixels, 0.0) / max(2.0 + 8.0 * layout.$.uniforms.roughness, 0.001), 2.0))
		* layout.$.uniforms.highlight * paneMask;
	straightRgb = clamp(straightRgb + vec3f(sparseHighlight + rimHighlight), vec3f(0.0), vec3f(1.0));

	let frosted = vec4f(straightRgb * localAlpha, localAlpha);
	return mix(inputSample, frosted, frostMask);
`;

export const frostedGlassEffectRenderer: EffectRenderer<FrostedGlassParams> = {
	type: 'frosted-glass',
	label: 'Frosted glass',
	schema: FrostedGlassEffectSchema,
	defaults: () => ({
		params: {
			region: { ...DEFAULT_FROSTED_GLASS_REGION },
			coverage: 0.72,
			contrast: 0.42,
			roughness: 0.62,
			haze: 0.68,
			refraction: 0.26,
			detailScale: 1.15,
			tint: '#e8f1f5',
			tintStrength: 0.18,
			highlight: 0.22,
			seed: 4107
		}
	}),
	pass: {
		paramsStruct: FrostedGlassUniforms,
		fragmentBody,
		pack: (params, ctx) => {
			const melt = params.melt;
			return {
				region: d.vec4f(
					...packNormalizedOpticalRegion(params.region, DEFAULT_FROSTED_GLASS_REGION)
				),
				tint: d.vec4f(...hexToRgbaFloat(params.tint ?? '#e8f1f5')),
				melt: d.vec4f(
					melt?.center.x ?? 0.5,
					melt?.center.y ?? 0.5,
					melt?.radius ?? 0.28,
					melt?.softness ?? 0.08
				),
				meltTiming: d.vec4f(melt?.from ?? 0.42, melt?.to ?? 0.68, melt ? 1 : 0, 0),
				resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
				progress: ctx.progress,
				coverage: params.coverage ?? 0.72,
				contrast: params.contrast ?? 0.42,
				roughness: params.roughness ?? 0.62,
				haze: params.haze ?? 0.68,
				refraction: params.refraction ?? 0.26,
				detailScale: params.detailScale ?? 1.15,
				tintStrength: params.tintStrength ?? 0.18,
				highlight: params.highlight ?? 0.22,
				seed: params.seed ?? 4107
			};
		}
	},
	Editor
};
