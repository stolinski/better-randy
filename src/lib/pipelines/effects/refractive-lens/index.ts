import { d } from 'typegpu';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { normalizedPassRegion } from '$lib/platform/pipelines/pass-execution';
import { createBicubicSampleWgsl } from '$lib/utils/bicubic-sampling-wgsl';
import { hexToRgbaFloat } from '$lib/utils/color';
import {
	DEFAULT_REFRACTIVE_LENS_REGION,
	getOpticalShapeCode,
	packAspectPreservingOpticalRegion
} from '$lib/utils/optical-geometry';

import Editor from './Editor.svelte';
import {
	refractiveLensEffectDefinition,
	type RefractiveLensParams as RefractiveLensParamsDefinition
} from './definition';

export type RefractiveLensParams = RefractiveLensParamsDefinition;
const RefractiveLensUniforms = d.struct({
	region: d.vec4f,
	tint: d.vec4f,
	resolution: d.vec2f,
	progress: d.f32,
	timestamp: d.f32,
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

	let reveal = smoothstep(0.32, 0.72, layout.$.uniforms.timestamp);
	let bevelPixels = max(2.0, minHalf * (0.04 + 0.2 * layout.$.uniforms.bevel));
	let edge = smoothstep(-bevelPixels, -aa, lensDistance);
	let normalizedP = p / halfPixels;
	let radialNormal = normalize(normalizedP + vec2f(0.00001));
	let magnification = layout.$.uniforms.magnification;
	let baseUv = centerUv + (in.uv - centerUv) / magnification;
	let refractionOffset = radialNormal / resolution
		* edge * layout.$.uniforms.refraction * layout.$.uniforms.thickness * 34.0;
	let roughOffset = vec2f(-radialNormal.y, radialNormal.x) / resolution
		* layout.$.uniforms.roughness * 9.0;
	let sourceUv = baseUv + refractionOffset;

	${createBicubicSampleWgsl({
		prefix: 'lensCenter',
		result: 'centerSample',
		sampler: 'layout.$.samp',
		texture: 'layout.$.inputTexture',
		uv: 'sourceUv'
	})}
	let roughA = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv + roughOffset, 0.0);
	let roughB = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv - roughOffset, 0.0);
	let roughC = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv + roughOffset.yx, 0.0);
	let roughD = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sourceUv - roughOffset.yx, 0.0);
	let roughMix = layout.$.uniforms.roughness * 0.72;
	var glassSample = mix(centerSample, (centerSample * 2.0 + roughA + roughB + roughC + roughD) / 6.0, roughMix);

	let dispersionOffset = radialNormal / resolution * edge * layout.$.uniforms.dispersion * 5.0;
	${createBicubicSampleWgsl({
		prefix: 'lensRed',
		result: 'sampleR',
		sampler: 'layout.$.samp',
		texture: 'layout.$.inputTexture',
		uv: 'sourceUv + dispersionOffset'
	})}
	${createBicubicSampleWgsl({
		prefix: 'lensBlue',
		result: 'sampleB',
		sampler: 'layout.$.samp',
		texture: 'layout.$.inputTexture',
		uv: 'sourceUv - dispersionOffset'
	})}
	glassSample = vec4f(sampleR.r, glassSample.g, sampleB.b, glassSample.a);

	let localAlpha = inputSample.a;
	var straightRgb = select(vec3f(0.0), glassSample.rgb / max(glassSample.a, 0.0001), glassSample.a > 0.0001);
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
	...refractiveLensEffectDefinition,
	pass: {
		paramsStruct: RefractiveLensUniforms,
		fragmentBody,
		execution: (params, ctx) => ({
			region: normalizedPassRegion(
				packAspectPreservingOpticalRegion(params.region, DEFAULT_REFRACTIVE_LENS_REGION, {
					width: ctx.canvasWidth,
					height: ctx.canvasHeight
				}),
				ctx.canvasWidth,
				ctx.canvasHeight,
				4
			)
		}),
		pack: (params, ctx) => ({
			region: d.vec4f(
				...packAspectPreservingOpticalRegion(params.region, DEFAULT_REFRACTIVE_LENS_REGION, {
					width: ctx.canvasWidth,
					height: ctx.canvasHeight
				})
			),
			tint: d.vec4f(...hexToRgbaFloat(params.tint ?? '#dbeafe')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			progress: ctx.progress,
			timestamp: ctx.timestamp,
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
