import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';
import {
	DEFAULT_REFRACTIVE_LENS_REGION,
	NormalizedOpticalRegionSchema,
	OpticalShapeSchema,
	getOpticalShapeCode,
	packNormalizedOpticalRegion
} from '$lib/utils/optical-geometry';

import Editor from './Editor.svelte';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const RefractiveLensParamsSchema = z.object({
	shape: OpticalShapeSchema.default('rounded-rect'),
	region: NormalizedOpticalRegionSchema.default(DEFAULT_REFRACTIVE_LENS_REGION),
	magnification: z.number().min(1).max(2.4).default(1.24),
	thickness: z.number().min(0).max(1).default(0.45),
	refraction: z.number().min(0).max(1).default(0.32),
	roughness: z.number().min(0).max(1).default(0.08),
	dispersion: z.number().min(0).max(1).default(0.12),
	reflection: z.number().min(0).max(1).default(0.18),
	rimLight: z.number().min(0).max(1).default(0.32),
	tint: z.string().regex(HEX_COLOR_PATTERN).default('#dbeafe'),
	tintStrength: z.number().min(0).max(1).default(0.08),
	edgeFlatness: z.number().min(0).max(1).default(0.45),
	bevel: z.number().min(0.02).max(1).default(0.28)
});

export type RefractiveLensParams = z.infer<typeof RefractiveLensParamsSchema>;

const RefractiveLensEffectSchema = z.object({
	type: z.literal('refractive-lens'),
	id: z.string(),
	params: RefractiveLensParamsSchema
});

const RefractiveLensUniforms = d.struct({
	region: d.vec4f,
	tint: d.vec4f,
	resolution: d.vec2f,
	progress: d.f32,
	shape: d.f32,
	magnification: d.f32,
	thickness: d.f32,
	refraction: d.f32,
	roughness: d.f32,
	dispersion: d.f32,
	reflection: d.f32,
	rimLight: d.f32,
	tintStrength: d.f32,
	edgeFlatness: d.f32,
	bevel: d.f32
});

// A local clear-glass instrument. Geometry is evaluated in native pixels so a
// circular lens stays circular in either orientation. The output keeps the
// input alpha exactly; displaced color is unpremultiplied and repremultiplied
// against local coverage so a transparent composition never grows a silhouette.
const fragmentBody = /* wgsl */ `
	let region = layout.$.uniforms.region;
	let resolution = layout.$.uniforms.resolution;
	let centerUv = region.xy + region.zw * 0.5;
	let halfPixels = max(region.zw * resolution * 0.5, vec2f(1.0));
	let p = (in.uv - centerUv) * resolution;
	let minHalf = min(halfPixels.x, halfPixels.y);
	let shape = layout.$.uniforms.shape;
	let edgeFlatness = layout.$.uniforms.edgeFlatness;
	let cornerRadius = mix(minHalf, minHalf * mix(0.48, 0.16, edgeFlatness), shape);
	let q = abs(p) - halfPixels + vec2f(cornerRadius);
	let roundedRectDistance = length(max(q, vec2f(0.0)))
		+ min(max(q.x, q.y), 0.0) - cornerRadius;
	let circleDistance = length(p) - minHalf;
	let lensDistance = mix(circleDistance, roundedRectDistance, shape);
	let aa = max(fwidth(lensDistance), 0.75);
	let inside = 1.0 - smoothstep(-aa, aa, lensDistance);

	if (inside <= 0.0) {
		return inputSample;
	}

	let reveal = smoothstep(0.0, 0.12, layout.$.uniforms.progress);
	let bevelPixels = max(2.0, minHalf * (0.04 + 0.2 * layout.$.uniforms.bevel));
	let edge = 1.0 - smoothstep(-bevelPixels, -aa, lensDistance);
	let normalizedP = p / halfPixels;
	let radialNormal = normalize(normalizedP + vec2f(0.00001));
	let magnification = layout.$.uniforms.magnification;
	let baseUv = centerUv + (in.uv - centerUv) / magnification;
	let refractionOffset = radialNormal / resolution
		* edge * layout.$.uniforms.refraction * layout.$.uniforms.thickness * 34.0;
	let roughOffset = vec2f(-radialNormal.y, radialNormal.x) / resolution
		* layout.$.uniforms.roughness * 9.0;
	let sourceUv = baseUv + refractionOffset;

	let centerSample = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv, 0.0);
	let roughA = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv + roughOffset, 0.0);
	let roughB = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv - roughOffset, 0.0);
	let roughC = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv + roughOffset.yx, 0.0);
	let roughD = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv - roughOffset.yx, 0.0);
	let roughMix = layout.$.uniforms.roughness * 0.72;
	var glassSample = mix(centerSample, (centerSample * 2.0 + roughA + roughB + roughC + roughD) / 6.0, roughMix);

	let dispersionOffset = radialNormal / resolution * edge * layout.$.uniforms.dispersion * 5.0;
	let sampleR = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv + dispersionOffset, 0.0);
	let sampleB = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv - dispersionOffset, 0.0);
	glassSample = vec4f(sampleR.r, glassSample.g, sampleB.b, glassSample.a);

	let localAlpha = inputSample.a;
	let straightRgb = select(vec3f(0.0), glassSample.rgb / max(glassSample.a, 0.0001), glassSample.a > 0.0001);
	let tint = layout.$.uniforms.tint;
	straightRgb = mix(straightRgb, tint.rgb, layout.$.uniforms.tintStrength * tint.a);

	let lightDirection = normalize(vec2f(-0.72, -0.48));
	let lightFacing = max(dot(radialNormal, lightDirection), 0.0);
	let fresnel = pow(edge, 2.4);
	let reflection = fresnel * lightFacing * layout.$.uniforms.reflection;
	let rim = fresnel * layout.$.uniforms.rimLight * (0.28 + 0.72 * lightFacing);
	straightRgb = clamp(straightRgb + vec3f(reflection + rim), vec3f(0.0), vec3f(1.0));

	let lens = vec4f(straightRgb * localAlpha, localAlpha);
	return mix(inputSample, lens, inside * reveal);
`;

export const refractiveLensEffectRenderer: EffectRenderer<RefractiveLensParams> = {
	type: 'refractive-lens',
	label: 'Refractive lens',
	schema: RefractiveLensEffectSchema,
	defaults: () => ({
		params: {
			shape: 'rounded-rect',
			region: { ...DEFAULT_REFRACTIVE_LENS_REGION },
			magnification: 1.24,
			thickness: 0.45,
			refraction: 0.32,
			roughness: 0.08,
			dispersion: 0.12,
			reflection: 0.18,
			rimLight: 0.32,
			tint: '#dbeafe',
			tintStrength: 0.08,
			edgeFlatness: 0.45,
			bevel: 0.28
		}
	}),
	pass: {
		paramsStruct: RefractiveLensUniforms,
		fragmentBody,
		pack: (params, ctx) => ({
			region: d.vec4f(
				...packNormalizedOpticalRegion(params.region, DEFAULT_REFRACTIVE_LENS_REGION)
			),
			tint: d.vec4f(...hexToRgbaFloat(params.tint ?? '#dbeafe')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			progress: ctx.progress,
			shape: getOpticalShapeCode(params.shape),
			magnification: params.magnification ?? 1.24,
			thickness: params.thickness ?? 0.45,
			refraction: params.refraction ?? 0.32,
			roughness: params.roughness ?? 0.08,
			dispersion: params.dispersion ?? 0.12,
			reflection: params.reflection ?? 0.18,
			rimLight: params.rimLight ?? 0.32,
			tintStrength: params.tintStrength ?? 0.08,
			edgeFlatness: params.edgeFlatness ?? 0.45,
			bevel: params.bevel ?? 0.28
		})
	},
	Editor
};
